import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import {
  ANDROID_GOOGLE_PICKER_URL,
  ANDROID_GOOGLE_RETURN_URI,
  DESKTOP_GOOGLE_CLIENT_ID,
  STORE_IOS_GOOGLE_CLIENT_ID,
  androidGoogleNativeRedirectUri,
  androidUsesNativeGoogleRedirect,
  iosGoogleRedirectUri,
} from '../auth/googleAuthResult';
import { getValidGoogleAccessToken } from '../auth/googleToken';

import { getDriveFile, isDriveFolder, type DriveFile } from './driveApi';

WebBrowser.maybeCompleteAuthSession();

const CLIENT_ID_RE = /^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/i;

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

function pickerReturnUri(): string {
  const extra = (Constants.expoConfig?.extra ?? {}) as {
    googleIosClientId?: string;
    googleAndroidClientId?: string;
  };
  const inExpoGo = Constants.appOwnership === 'expo';
  const iosClientId = validClientId(extra.googleIosClientId || STORE_IOS_GOOGLE_CLIENT_ID);
  const androidClientId = validClientId(extra.googleAndroidClientId);
  const useNativeAndroidGoogle =
    Platform.OS === 'android' &&
    !inExpoGo &&
    androidUsesNativeGoogleRedirect(
      undefined,
      Updates.runtimeVersion || Constants.expoConfig?.version,
    );
  const androidNativeClientId = androidClientId || DESKTOP_GOOGLE_CLIENT_ID;
  if (Platform.OS === 'ios' && iosClientId) {
    return iosGoogleRedirectUri(iosClientId);
  }
  if (useNativeAndroidGoogle) {
    return androidGoogleNativeRedirectUri(androidNativeClientId);
  }
  return ANDROID_GOOGLE_RETURN_URI;
}

/**
 * Opens a folder picker that lists Shared Drives (not My Drive).
 * Google’s own “Seleziona un elemento” stays on Il mio Drive; this page does not.
 */
export async function pickSharedDriveFolder(): Promise<DriveFile | null> {
  let accessToken: string;
  try {
    accessToken = await getValidGoogleAccessToken();
  } catch {
    throw new Error('Collega Google Drive, poi tocca di nuovo Scegli su Google.');
  }
  const returnUri = pickerReturnUri();
  const pickerUrl =
    `${ANDROID_GOOGLE_PICKER_URL}?return=${encodeURIComponent(returnUri)}` +
    `#access_token=${encodeURIComponent(accessToken)}`;
  try {
    await WebBrowser.warmUpAsync();
  } catch {
    // optional
  }
  let returnUrl = '';
  try {
    const browserResult = await WebBrowser.openAuthSessionAsync(pickerUrl, returnUri, {
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
  const params = parseReturnParams(returnUrl);
  if ((params.get('error') || '').toLowerCase() === 'access_denied') {
    return null;
  }
  const pickedIds = parsePickedFileIds(returnUrl);
  if (pickedIds.length === 0) {
    throw new Error(
      'Nella schermata Google apri i Drive condivisi, tocca la cartella della band e conferma.',
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
