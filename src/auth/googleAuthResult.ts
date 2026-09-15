/** Keep `scripts/check-google-auth.mjs` in sync. */

export type GoogleAuthPayload = {
  type: string;
  params: Record<string, string>;
  authentication?: {
    accessToken?: string | null;
    idToken?: string | null;
    refreshToken?: string | null;
    expiresIn?: number;
    scope?: string | null;
  } | null;
};

export type GoogleExchangeExtras = {
  redirectUri: string;
  codeVerifier?: string;
};

/** Login only: no Drive scopes, so Google does not show “app not verified / unsafe”. */
export const GOOGLE_IDENTITY_EXTRA_PARAMS = {
  prompt: 'select_account',
} as const;

/** Drive connect: refresh token + folder access. Incremental after identity login. */
export const GOOGLE_DRIVE_EXTRA_PARAMS = {
  access_type: 'offline',
  prompt: 'consent select_account',
  include_granted_scopes: 'true',
} as const;

/**
 * Implicit token return cannot ask for offline access (Google 400).
 * Play 1.0.4 and any Android still on the HTTPS bounce use this.
 */
export const GOOGLE_DRIVE_IMPLICIT_EXTRA_PARAMS = {
  prompt: 'consent select_account',
  include_granted_scopes: 'true',
} as const;

export function googleDriveAuthorizeExtraParams(implicit: boolean): {
  prompt: string;
  include_granted_scopes: string;
  access_type?: string;
} {
  return implicit ? GOOGLE_DRIVE_IMPLICIT_EXTRA_PARAMS : GOOGLE_DRIVE_EXTRA_PARAMS;
}

/** @deprecated Use GOOGLE_DRIVE_EXTRA_PARAMS. Kept so older imports keep compiling. */
export const GOOGLE_OAUTH_EXTRA_PARAMS = GOOGLE_DRIVE_EXTRA_PARAMS;

export function googleAccessTokenFromResult(result: GoogleAuthPayload): string | undefined {
  return result.authentication?.accessToken || result.params.access_token || undefined;
}

export function googleIdTokenFromResult(result: GoogleAuthPayload): string | undefined {
  return result.authentication?.idToken || result.params.id_token || undefined;
}

/** Code exchange only if Google did not already return tokens. */
export function googleAuthNeedsCodeExchange(result: GoogleAuthPayload): boolean {
  if (result.type !== 'success') {
    return false;
  }
  if (googleAccessTokenFromResult(result) || googleIdTokenFromResult(result)) {
    return false;
  }
  return Boolean(result.params.code);
}

export function snapshotGoogleExchange(
  redirectUri: string,
  codeVerifier?: string,
): GoogleExchangeExtras {
  return { redirectUri, codeVerifier };
}

export function googleExchangeIsReady(extras?: GoogleExchangeExtras): extras is GoogleExchangeExtras & {
  codeVerifier: string;
} {
  return Boolean(extras?.redirectUri && extras.codeVerifier);
}

export function googleTokenHasDriveScope(scope?: string | null): boolean {
  if (!scope) {
    return false;
  }
  // Redirect params often use `+` / `%20` instead of spaces.
  const normalized = scope.replace(/\+/g, ' ').replace(/%20/gi, ' ');
  return /(?:^|\s)(https:\/\/www\.googleapis\.com\/auth\/)?drive(\.file|\.readonly)?(?:\s|$)/.test(
    normalized,
  );
}

/** True when the token can call GET /drives (Shared Drive membership list). */
export function googleTokenCanListSharedDrives(scope?: string | null): boolean {
  if (!scope) {
    return false;
  }
  const normalized = scope.replace(/\+/g, ' ').replace(/%20/gi, ' ');
  return (
    /(?:^|\s)(https:\/\/www\.googleapis\.com\/auth\/)?drive\.readonly(?:\s|$)/.test(normalized) ||
    /(?:^|\s)(https:\/\/www\.googleapis\.com\/auth\/)?drive(?:\s|$)/.test(normalized)
  );
}

/** iOS uses the reversed client scheme; Android/web use the app custom scheme. */
export function reversedGoogleClientScheme(clientId: string): string {
  return `com.googleusercontent.apps.${clientId.replace(/\.apps\.googleusercontent\.com$/i, '')}`;
}

/** Web client authorize target. The bounce page then opens ANDROID_GOOGLE_RETURN_URI. */
export const ANDROID_GOOGLE_REDIRECT_URI =
  'https://eventi.musicproeventi.it/ReWavier/oauth.html';

/** Custom-scheme bounce after the HTTPS page. The Play binary already listens here. */
export const ANDROID_GOOGLE_RETURN_URI = 'rewavier://oauth';

export const ANDROID_GOOGLE_PICKER_URL =
  'https://eventi.musicproeventi.it/ReWavier/picker.html';

/** Play 1.0.5 exchanges the Google code here so the secret never sits in the app. */
export const ANDROID_GOOGLE_EXCHANGE_URL =
  'https://eventi.musicproeventi.it/ReWavier/oauth-exchange.php';

/** Desktop client — reversed scheme is in the 1.0.5 Play binary. Token exchange needs a secret (server). */
export const DESKTOP_GOOGLE_CLIENT_ID =
  '1049963169218-k8i1dmlbsn1nqrv393u8pp111v7v2efc.apps.googleusercontent.com';

/** Play 1.0.5+ binaries include this scheme. Older Play builds do not. */
export const ANDROID_GOOGLE_NATIVE_MIN_VERSION_CODE = 11;

/** Native scheme shipped with store version 1.0.5 (versionCode ≥ 11). */
export const ANDROID_GOOGLE_NATIVE_MIN_RUNTIME = '1.0.5';

function runtimeVersionGte(value: string, min: string): boolean {
  const left = value.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const right = min.split('.').map((part) => Number.parseInt(part, 10) || 0);
  for (let i = 0; i < 3; i += 1) {
    const delta = (left[i] ?? 0) - (right[i] ?? 0);
    if (delta !== 0) {
      return delta > 0;
    }
  }
  return true;
}

/**
 * True only for the installed Play binary, not the OTA JS.
 * `expo-constants` nativeBuildVersion is missing on SDK 54 Android;
 * `expo-updates` runtimeVersion stays on the APK (1.0.4 vs 1.0.5).
 */
export function androidUsesNativeGoogleRedirect(
  nativeBuildVersion?: string | number | null,
  runtimeVersion?: string | null,
): boolean {
  const runtime = runtimeVersion?.trim();
  if (runtime && runtimeVersionGte(runtime, ANDROID_GOOGLE_NATIVE_MIN_RUNTIME)) {
    return true;
  }
  const code = Number(nativeBuildVersion);
  return Number.isFinite(code) && code >= ANDROID_GOOGLE_NATIVE_MIN_VERSION_CODE;
}

/** Store iOS client — used if Expo extra is missing (OTA / archive). */
export const STORE_IOS_GOOGLE_CLIENT_ID =
  '1049963169218-o6tcahpfsdijj2lm811bmjs4vjaglb7v.apps.googleusercontent.com';
export const EXPO_IOS_GOOGLE_CLIENT_ID =
  '1049963169218-gpj1pb8omtfhuv76npnhjnsshkqc970g.apps.googleusercontent.com';
export const WEB_GOOGLE_CLIENT_ID =
  '1049963169218-oglbjve738epat5bsm2fnbunsolfh4ed.apps.googleusercontent.com';

export function iosGoogleRedirectUri(iosClientId: string): string {
  return `${reversedGoogleClientScheme(iosClientId)}:/oauthredirect`;
}

/**
 * Redirect URI sent to Google.
 * iOS store builds use the reversed iOS client scheme.
 * Android Play 1.0.5+ uses the Desktop client reversed scheme; the code is
 * exchanged on Eventi so Play does not need a secret in the store binary.
 * Older Play builds keep the HTTPS bounce page on the Web application client.
 */
export function resolveGoogleOAuthRedirectUri(opts: {
  platform: string;
  iosClientId?: string;
  webClientId?: string;
  androidClientId?: string;
  androidNative?: boolean;
  customSchemeUri: string;
}): string {
  if (opts.platform === 'ios' && opts.iosClientId) {
    return iosGoogleRedirectUri(opts.iosClientId);
  }
  if (opts.platform === 'android' && opts.androidNative) {
    return androidGoogleNativeRedirectUri(opts.androidClientId || DESKTOP_GOOGLE_CLIENT_ID);
  }
  if (opts.platform === 'android') {
    return ANDROID_GOOGLE_REDIRECT_URI;
  }
  return opts.customSchemeUri;
}

export function androidGoogleNativeRedirectUri(clientId?: string): string {
  return `${reversedGoogleClientScheme(clientId || DESKTOP_GOOGLE_CLIENT_ID)}:/oauthredirect`;
}

/** Which Google client to send. Standalone iOS never falls back to the web client. */
export function pickGoogleClientIds(input: {
  platform: string;
  inExpoGo: boolean;
  storeIos?: string;
  expoIos?: string;
  android?: string;
  web?: string;
}): {
  iosClientId?: string;
  androidClientId?: string;
  webClientId?: string;
  clientId?: string;
} {
  const iosClientId = input.inExpoGo ? undefined : input.storeIos ?? input.expoIos;
  if (input.platform === 'android') {
    return {
      iosClientId,
      androidClientId: input.android,
      webClientId: input.web,
      clientId: input.android ?? input.web,
    };
  }
  if (input.inExpoGo) {
    return {
      iosClientId: undefined,
      androidClientId: input.android,
      webClientId: input.web,
      clientId: input.web ?? input.expoIos ?? input.storeIos,
    };
  }
  return {
    iosClientId,
    androidClientId: input.android,
    webClientId: input.web,
    clientId: iosClientId,
  };
}

/** Secret only for confidential clients (Desktop / Web). iOS public clients omit it. */
export function googleClientSecretForExchange(
  clientId: string,
  secrets: { desktop?: string; web?: string },
): string | undefined {
  const desktop = secrets.desktop?.trim();
  const web = secrets.web?.trim();
  if (desktop && clientId === DESKTOP_GOOGLE_CLIENT_ID) {
    return desktop;
  }
  if (web && clientId === WEB_GOOGLE_CLIENT_ID) {
    return web;
  }
  return undefined;
}

/** User-facing line when Google returns an error (not cancel / dismiss). */
export function googleAuthPromptFailedMessage(result: {
  type: string;
  params?: Record<string, string>;
  errorCode?: string | null;
}): string | null {
  if (result.type === 'success' || result.type === 'cancel' || result.type === 'dismiss') {
    return null;
  }
  const raw = `${result.params?.error ?? ''} ${result.errorCode ?? ''}`.toLowerCase();
  if (raw.includes('redirect_uri') || raw.includes('invalid_request') || raw.includes('access_denied')) {
    return 'Google ha bloccato il collegamento. Usa «Collega da File», oppure riprova più tardi.';
  }
  if (result.type === 'error') {
    return 'Login Google non riuscito. Riprova, oppure entra con email.';
  }
  return null;
}
