import * as AuthSession from 'expo-auth-session';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import {
  ANDROID_GOOGLE_EXCHANGE_URL,
  ANDROID_GOOGLE_RETURN_URI,
  DESKTOP_GOOGLE_CLIENT_ID,
  STORE_IOS_GOOGLE_CLIENT_ID,
  WEB_GOOGLE_CLIENT_ID,
  androidGoogleNativeRedirectUri,
  androidUsesNativeGoogleRedirect,
  iosGoogleRedirectUri,
  resolveGoogleOAuthRedirectUri,
} from '../auth/googleAuthResult';
import { loadGoogleAuth, saveGoogleAuth } from '../auth/googleToken';

import { DRIVE_FOLDER_MIME, getDriveFile, isDriveFolder, type DriveFile } from './driveApi';

WebBrowser.maybeCompleteAuthSession();

const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const CLIENT_ID_RE = /^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/i;

const GOOGLE_DISCOVERY: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: AUTH_ENDPOINT,
  tokenEndpoint: TOKEN_ENDPOINT,
};

/** Keep `scripts/check-drive-folder-link.mjs` in sync. */
export function parseReturnParams(url: string): URLSearchParams {
  const raw = url.trim();
  const params = new URLSearchParams();
  if (!raw) {
    return params;
  }
  const hashAt = raw.indexOf('#');
  const queryAt = raw.indexOf('?');
  const query =
    queryAt >= 0 ? raw.slice(queryAt + 1, hashAt > queryAt ? hashAt : undefined) : '';
  const hash = hashAt >= 0 ? raw.slice(hashAt + 1) : '';
  new URLSearchParams(query).forEach((value, key) => params.set(key, value));
  new URLSearchParams(hash).forEach((value, key) => {
    if (!params.has(key)) {
      params.set(key, value);
    }
  });
  return params;
}

export function parsePickedFileIds(url: string): string[] {
  const params = parseReturnParams(url);
  const joined = params.get('picked_file_ids') || params.get('pickedFileIds') || '';
  return joined
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

function validClientId(value?: string): string | undefined {
  const trimmed = value?.trim() ?? '';
  return CLIENT_ID_RE.test(trimmed) ? trimmed : undefined;
}

function pickerAuthContext() {
  const extra = (Constants.expoConfig?.extra ?? {}) as {
    googleIosClientId?: string;
    googleWebClientId?: string;
    googleAndroidClientId?: string;
  };
  const inExpoGo = Constants.appOwnership === 'expo';
  const iosClientId = validClientId(extra.googleIosClientId || STORE_IOS_GOOGLE_CLIENT_ID);
  const webClientId = validClientId(extra.googleWebClientId || WEB_GOOGLE_CLIENT_ID);
  const androidClientId = validClientId(extra.googleAndroidClientId);
  const useNativeAndroidGoogle =
    Platform.OS === 'android' &&
    !inExpoGo &&
    androidUsesNativeGoogleRedirect(
      undefined,
      Updates.runtimeVersion || Constants.expoConfig?.version,
    );
  const useAndroidHttpsImplicit = Platform.OS === 'android' && !inExpoGo && !useNativeAndroidGoogle;
  const androidNativeClientId = androidClientId || DESKTOP_GOOGLE_CLIENT_ID;
  const clientId =
    Platform.OS === 'ios' && iosClientId
      ? iosClientId
      : useNativeAndroidGoogle
        ? androidNativeClientId
        : webClientId || androidNativeClientId;
  const iosRedirect = iosClientId ? iosGoogleRedirectUri(iosClientId) : undefined;
  const androidNativeRedirect = androidGoogleNativeRedirectUri(androidNativeClientId);
  const redirectUri = resolveGoogleOAuthRedirectUri({
    platform: Platform.OS,
    iosClientId,
    webClientId,
    androidClientId: androidNativeClientId,
    androidNative: useNativeAndroidGoogle,
    customSchemeUri:
      iosRedirect ??
      AuthSession.makeRedirectUri({
        scheme: 'rewavier',
        path: 'oauth',
        native: useNativeAndroidGoogle ? androidNativeRedirect : ANDROID_GOOGLE_RETURN_URI,
      }),
  });
  const returnUri =
    Platform.OS === 'ios' && iosRedirect
      ? iosRedirect
      : useNativeAndroidGoogle
        ? androidNativeRedirect
        : ANDROID_GOOGLE_RETURN_URI;
  return { clientId, redirectUri, returnUri, useAndroidHttpsImplicit, useNativeAndroidGoogle };
}

async function persistPickerToken(params: {
  clientId: string;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  scope?: string;
}): Promise<void> {
  if (!params.accessToken) {
    return;
  }
  const existing = await loadGoogleAuth();
  await saveGoogleAuth({
    accessToken: params.accessToken,
    refreshToken: params.refreshToken || existing?.refreshToken,
    clientId: params.clientId,
    scope: params.scope || existing?.scope,
    expiresAt: params.expiresIn
      ? Date.now() + Math.max(30, params.expiresIn - 60) * 1000
      : Date.now() + 50 * 60 * 1000,
  });
}

async function exchangePickerCode(
  code: string,
  clientId: string,
  redirectUri: string,
  codeVerifier?: string,
): Promise<{ accessToken?: string; refreshToken?: string; expiresIn?: number; scope?: string }> {
  if (clientId === DESKTOP_GOOGLE_CLIENT_ID) {
    const response = await fetch(ANDROID_GOOGLE_EXCHANGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
      }).toString(),
    });
    const json = (await response.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    };
    if (!response.ok || !json.access_token) {
      throw new Error('Google non ha aperto la cartella. Riprova.');
    }
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresIn: json.expires_in,
      scope: json.scope,
    };
  }
  const exchanged = await AuthSession.exchangeCodeAsync(
    {
      clientId,
      code,
      redirectUri,
      extraParams: codeVerifier ? { code_verifier: codeVerifier } : {},
    },
    GOOGLE_DISCOVERY,
  );
  return {
    accessToken: exchanged.accessToken ?? undefined,
    refreshToken: exchanged.refreshToken ?? undefined,
    expiresIn: exchanged.expiresIn ?? undefined,
    scope: exchanged.scope ?? undefined,
  };
}

/**
 * Opens Google’s folder picker (drive.file). After the user picks DPB (or another
 * Shared Drive folder), that folder is visible to ReWavier.
 */
export async function pickSharedDriveFolder(): Promise<DriveFile | null> {
  const ctx = pickerAuthContext();
  if (!ctx.clientId) {
    throw new Error('Google non è pronto. Torna indietro e collega Drive.');
  }
  const request = new AuthSession.AuthRequest({
    clientId: ctx.clientId,
    redirectUri: ctx.redirectUri,
    scopes: [DRIVE_FILE_SCOPE],
    responseType: ctx.useAndroidHttpsImplicit
      ? AuthSession.ResponseType.Token
      : AuthSession.ResponseType.Code,
    usePKCE: !ctx.useAndroidHttpsImplicit,
    prompt: AuthSession.Prompt.Consent,
    extraParams: {
      trigger_onepick: 'true',
      allow_folder_selection: 'true',
      mimetypes: DRIVE_FOLDER_MIME,
      language: 'it',
      ...(ctx.useAndroidHttpsImplicit ? {} : { access_type: 'offline' }),
    },
  });
  const authUrl = await request.makeAuthUrlAsync(GOOGLE_DISCOVERY);
  let returnUrl = '';
  if (Platform.OS === 'android') {
    try {
      await WebBrowser.warmUpAsync();
    } catch {
      // optional
    }
    try {
      const browserResult = await WebBrowser.openAuthSessionAsync(authUrl, ctx.returnUri, {
        createTask: false,
        showInRecents: true,
      });
      if (browserResult.type !== 'success') {
        return null;
      }
      returnUrl = browserResult.url;
    } finally {
      try {
        await WebBrowser.coolDownAsync();
      } catch {
        // optional
      }
    }
  } else {
    const result = await request.promptAsync(GOOGLE_DISCOVERY);
    if (result.type !== 'success') {
      return null;
    }
    returnUrl = result.url ?? '';
  }
  const pickedIds = parsePickedFileIds(returnUrl);
  const params = parseReturnParams(returnUrl);
  const accessToken = params.get('access_token') || undefined;
  const code = params.get('code') || undefined;
  if (accessToken) {
    await persistPickerToken({
      clientId: ctx.clientId,
      accessToken,
      refreshToken: params.get('refresh_token') || undefined,
      expiresIn: Number(params.get('expires_in')) || undefined,
      scope: params.get('scope') || undefined,
    });
  } else if (code && !ctx.useAndroidHttpsImplicit) {
    const exchanged = await exchangePickerCode(code, ctx.clientId, ctx.redirectUri, request.codeVerifier);
    await persistPickerToken({ clientId: ctx.clientId, ...exchanged });
  }
  if (pickedIds.length === 0) {
    throw new Error(
      'Nella schermata Google apri il Drive della band, tocca la cartella e poi Inserisci.',
    );
  }
  for (const id of pickedIds) {
    const file = await getDriveFile(id);
    if (file && isDriveFolder(file)) {
      return file;
    }
  }
  throw new Error('Google non ha aperto la cartella. Scegli una cartella, non un file.');
}
