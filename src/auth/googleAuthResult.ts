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

/** @deprecated Use GOOGLE_DRIVE_EXTRA_PARAMS. Kept so older imports keep compiling. */
export const GOOGLE_OAUTH_EXTRA_PARAMS = GOOGLE_DRIVE_EXTRA_PARAMS;

export function googleAccessTokenFromResult(result: GoogleAuthPayload): string | undefined {
  return result.authentication?.accessToken || result.params.access_token || undefined;
}

export function googleAuthNeedsCodeExchange(result: GoogleAuthPayload): boolean {
  if (result.type !== 'success') {
    return false;
  }
  return !googleAccessTokenFromResult(result) && Boolean(result.params.code);
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

/** iOS uses the reversed client scheme; Android/web use the app custom scheme. */
export function reversedGoogleClientScheme(clientId: string): string {
  return `com.googleusercontent.apps.${clientId.replace(/\.apps\.googleusercontent\.com$/i, '')}`;
}

/** Pinned Android + web-client redirect. Must match the Web client in Google Cloud. */
export const ANDROID_GOOGLE_REDIRECT_URI = 'rewavier://oauth';

/** Store iOS client — used if Expo extra is missing (OTA / archive). */
export const STORE_IOS_GOOGLE_CLIENT_ID =
  '1049963169218-o6tcahpfsdijj2lm811bmjs4vjaglb7v.apps.googleusercontent.com';
export const EXPO_IOS_GOOGLE_CLIENT_ID =
  '1049963169218-gpj1pb8omtfhuv76npnhjnsshkqc970g.apps.googleusercontent.com';
export const WEB_GOOGLE_CLIENT_ID =
  '1049963169218-k8i1dmlbsn1nqrv393u8pp111v7v2efc.apps.googleusercontent.com';

export function iosGoogleRedirectUri(iosClientId: string): string {
  return `${reversedGoogleClientScheme(iosClientId)}:/oauthredirect`;
}

/**
 * Redirect URI for Google AuthSession.
 * iOS store builds must use the reversed iOS client scheme. A web client +
 * `rewavier://oauth` is the Error 400 / invalid_request Google policy page.
 */
export function resolveGoogleOAuthRedirectUri(opts: {
  platform: string;
  iosClientId?: string;
  customSchemeUri: string;
}): string {
  if (opts.platform === 'ios' && opts.iosClientId) {
    return iosGoogleRedirectUri(opts.iosClientId);
  }
  if (opts.platform === 'android') {
    return ANDROID_GOOGLE_REDIRECT_URI;
  }
  return opts.customSchemeUri;
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
  if (raw.includes('redirect_uri') || raw.includes('invalid_request')) {
    return 'Google non ha riconosciuto l’app. Riprova, oppure entra con email.';
  }
  if (result.type === 'error') {
    return 'Login Google non riuscito. Riprova, oppure entra con email.';
  }
  return null;
}
