import { DriveSlowError, isAbortError } from '../domain/albumRefresh';
import {
  ANDROID_GOOGLE_EXCHANGE_URL,
  DESKTOP_GOOGLE_CLIENT_ID,
  googleClientSecretForExchange,
  googleTokenCanListSharedDrives,
} from './googleAuthResult';
import {
  clearGoogleToken,
  loadGoogleToken,
  saveGoogleToken,
} from '../files/sessionPersist';
import Constants from 'expo-constants';

const TOKEN_REFRESH_TIMEOUT_MS = 15_000;

export type GoogleAuth = {
  accessToken: string;
  refreshToken?: string;
  clientId?: string;
  expiresAt?: number;
  scope?: string;
};

const BLOB_PREFIX = 'json:';

export async function saveGoogleAuth(auth: GoogleAuth): Promise<void> {
  await saveGoogleToken(`${BLOB_PREFIX}${JSON.stringify(auth)}`);
}

export async function loadGoogleAuth(): Promise<GoogleAuth | null> {
  const raw = await loadGoogleToken();
  if (!raw) {
    return null;
  }
  if (raw.startsWith(BLOB_PREFIX)) {
    try {
      const parsed = JSON.parse(raw.slice(BLOB_PREFIX.length)) as GoogleAuth;
      return parsed.accessToken ? parsed : null;
    } catch {
      return null;
    }
  }
  return { accessToken: raw };
}

export async function clearGoogleAuth(): Promise<void> {
  await clearGoogleToken();
}

async function refreshAccess(auth: GoogleAuth): Promise<GoogleAuth> {
  if (!auth.refreshToken || !auth.clientId) {
    throw new Error('Sessione Google scaduta. Accedi di nuovo con Google.');
  }
  const extra = (Constants.expoConfig?.extra ?? {}) as {
    googleDesktopClientSecret?: string;
    googleWebClientSecret?: string;
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TOKEN_REFRESH_TIMEOUT_MS);
  let response: Response;
  try {
    if (auth.clientId === DESKTOP_GOOGLE_CLIENT_ID) {
      response = await fetch(ANDROID_GOOGLE_EXCHANGE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: auth.clientId,
          grant_type: 'refresh_token',
          refresh_token: auth.refreshToken,
        }).toString(),
        signal: controller.signal,
      });
    } else {
      const secret = googleClientSecretForExchange(auth.clientId, {
        desktop: extra.googleDesktopClientSecret,
        web: extra.googleWebClientSecret,
      });
      const body = new URLSearchParams({
        client_id: auth.clientId,
        grant_type: 'refresh_token',
        refresh_token: auth.refreshToken,
      });
      if (secret) {
        body.set('client_secret', secret);
      }
      response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
        signal: controller.signal,
      });
    }
  } catch (error) {
    if (isAbortError(error) || controller.signal.aborted) {
      throw new DriveSlowError();
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    throw new Error('Sessione Google scaduta. Accedi di nuovo con Google.');
  }
  const json = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
  };
  if (!json.access_token) {
    throw new Error('Sessione Google scaduta. Accedi di nuovo con Google.');
  }
  const next: GoogleAuth = {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? auth.refreshToken,
    clientId: auth.clientId,
    scope: auth.scope,
    expiresAt: Date.now() + Math.max(30, (json.expires_in ?? 3600) - 60) * 1000,
  };
  await saveGoogleAuth(next);
  return next;
}

/** Email of the Google account tied to the Drive token (may differ from the app login). */
export async function fetchGoogleDriveEmail(): Promise<string | null> {
  try {
    const access = await getValidGoogleAccessToken();
    const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${access}` },
    });
    if (!response.ok) {
      return null;
    }
    const json = (await response.json()) as { email?: string };
    const email = json.email?.trim() ?? '';
    return email || null;
  } catch {
    return null;
  }
}

/** Whether the saved Drive token can list Shared Drive memberships (GET /drives). */
export async function canListSharedDrives(): Promise<boolean> {
  try {
    const auth = await loadGoogleAuth();
    if (!auth?.accessToken) {
      return false;
    }
    if (googleTokenCanListSharedDrives(auth.scope)) {
      return true;
    }
    // Older saves omit scope; probe /drives once.
    const access = await getValidGoogleAccessToken();
    const response = await fetch(
      'https://www.googleapis.com/drive/v3/drives?pageSize=1&fields=drives(id)',
      { headers: { Authorization: `Bearer ${access}` } },
    );
    return response.ok;
  } catch {
    return false;
  }
}

export async function getValidGoogleAccessToken(forceRefresh = false): Promise<string> {
  const auth = await loadGoogleAuth();
  if (!auth) {
    throw new Error('Google Drive non collegato');
  }
  if (!forceRefresh && auth.expiresAt && auth.expiresAt > Date.now()) {
    return auth.accessToken;
  }
  if (auth.refreshToken && auth.clientId) {
    return (await refreshAccess(auth)).accessToken;
  }
  if (forceRefresh || (auth.expiresAt && auth.expiresAt <= Date.now())) {
    throw new Error('Sessione Google scaduta. Accedi di nuovo con Google.');
  }
  return auth.accessToken;
}
