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

export const GOOGLE_OAUTH_EXTRA_PARAMS = {
  access_type: 'offline',
  prompt: 'consent select_account',
  include_granted_scopes: 'true',
} as const;

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
