/** Keep `scripts/check-google-auth.mjs` in sync. */

export type GoogleAuthPayload = {
  type: string;
  params: Record<string, string>;
  authentication?: {
    accessToken?: string | null;
    idToken?: string | null;
    refreshToken?: string | null;
    expiresIn?: number;
  } | null;
};

export function googleAccessTokenFromResult(result: GoogleAuthPayload): string | undefined {
  return result.authentication?.accessToken || result.params.access_token || undefined;
}

export function googleAuthNeedsCodeExchange(result: GoogleAuthPayload): boolean {
  if (result.type !== 'success') {
    return false;
  }
  return !googleAccessTokenFromResult(result) && Boolean(result.params.code);
}
