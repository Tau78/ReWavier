import assert from 'node:assert/strict';

const GOOGLE_IDENTITY_EXTRA_PARAMS = {
  prompt: 'select_account',
};

const GOOGLE_DRIVE_EXTRA_PARAMS = {
  access_type: 'offline',
  prompt: 'consent select_account',
  include_granted_scopes: 'true',
};

const GOOGLE_OAUTH_EXTRA_PARAMS = GOOGLE_DRIVE_EXTRA_PARAMS;

function googleAccessTokenFromResult(result) {
  return result.authentication?.accessToken || result.params.access_token || undefined;
}

function googleAuthNeedsCodeExchange(result) {
  if (result.type !== 'success') {
    return false;
  }
  return !googleAccessTokenFromResult(result) && Boolean(result.params.code);
}

function snapshotGoogleExchange(redirectUri, codeVerifier) {
  return { redirectUri, codeVerifier };
}

function googleExchangeIsReady(extras) {
  return Boolean(extras?.redirectUri && extras.codeVerifier);
}

function googleTokenHasDriveScope(scope) {
  if (!scope) {
    return false;
  }
  const normalized = scope.replace(/\+/g, ' ').replace(/%20/gi, ' ');
  return /(?:^|\s)(https:\/\/www\.googleapis\.com\/auth\/)?drive(\.file|\.readonly)?(?:\s|$)/.test(
    normalized,
  );
}

function reversedGoogleClientScheme(clientId) {
  return `com.googleusercontent.apps.${clientId.replace(/\.apps\.googleusercontent\.com$/i, '')}`;
}

const ANDROID_GOOGLE_REDIRECT_URI = 'rewavier://oauth';

function resolveGoogleOAuthRedirectUri(opts) {
  if (opts.platform === 'ios' && opts.iosClientId) {
    return `${reversedGoogleClientScheme(opts.iosClientId)}:/oauthredirect`;
  }
  if (opts.platform === 'android') {
    return ANDROID_GOOGLE_REDIRECT_URI;
  }
  return opts.customSchemeUri;
}

function googleAuthPromptFailedMessage(result) {
  if (result.type === 'success' || result.type === 'cancel' || result.type === 'dismiss') {
    return null;
  }
  const raw = `${result.params?.error ?? ''} ${result.errorCode ?? ''}`.toLowerCase();
  if (raw.includes('redirect_uri')) {
    return 'Google non ha riconosciuto l’app. Riprova, oppure entra con email.';
  }
  if (result.type === 'error') {
    return 'Login Google non riuscito. Riprova, oppure entra con email.';
  }
  return null;
}

assert.equal(
  googleAuthNeedsCodeExchange({
    type: 'success',
    params: { code: 'abc' },
    authentication: null,
  }),
  true,
);

assert.equal(
  googleAuthNeedsCodeExchange({
    type: 'success',
    params: { access_token: 'tok' },
    authentication: null,
  }),
  false,
);

assert.equal(
  googleAuthNeedsCodeExchange({
    type: 'success',
    params: { code: 'abc' },
    authentication: { accessToken: 'tok' },
  }),
  false,
);

assert.equal(
  googleAuthNeedsCodeExchange({
    type: 'cancel',
    params: { code: 'abc' },
  }),
  false,
);

assert.equal(
  googleAccessTokenFromResult({
    type: 'success',
    params: { code: 'abc' },
    authentication: null,
  }),
  undefined,
);

const firstVerifier = 'verifier-from-tap';
const snapshot = snapshotGoogleExchange(
  'com.googleusercontent.apps.example:/oauthredirect',
  firstVerifier,
);
const laterRequest = { codeVerifier: 'verifier-after-rerender' };
assert.equal(snapshot.codeVerifier, firstVerifier);
assert.notEqual(snapshot.codeVerifier, laterRequest.codeVerifier);
assert.equal(googleExchangeIsReady(snapshot), true);
assert.equal(googleExchangeIsReady({ redirectUri: snapshot.redirectUri }), false);
assert.equal(googleExchangeIsReady(undefined), false);

assert.equal(GOOGLE_IDENTITY_EXTRA_PARAMS.prompt, 'select_account');
assert.doesNotMatch(GOOGLE_IDENTITY_EXTRA_PARAMS.prompt, /consent/);
assert.equal(GOOGLE_OAUTH_EXTRA_PARAMS.access_type, 'offline');
assert.match(GOOGLE_OAUTH_EXTRA_PARAMS.prompt, /consent/);
assert.equal(GOOGLE_DRIVE_EXTRA_PARAMS.include_granted_scopes, 'true');
assert.equal(googleTokenHasDriveScope('openid https://www.googleapis.com/auth/drive.file'), true);
assert.equal(
  googleTokenHasDriveScope('openid+https://www.googleapis.com/auth/drive.file+email'),
  true,
);
assert.equal(googleTokenHasDriveScope('openid email profile'), false);
assert.equal(googleTokenHasDriveScope(undefined), false);

const iosId = '1049963169218-o6tcahpfsdijj2lm811bmjs4vjaglb7v.apps.googleusercontent.com';
const custom = 'rewavier://oauth';
assert.equal(
  resolveGoogleOAuthRedirectUri({ platform: 'ios', iosClientId: iosId, customSchemeUri: custom }),
  'com.googleusercontent.apps.1049963169218-o6tcahpfsdijj2lm811bmjs4vjaglb7v:/oauthredirect',
);
assert.equal(
  resolveGoogleOAuthRedirectUri({ platform: 'android', iosClientId: iosId, customSchemeUri: custom }),
  custom,
);
assert.equal(
  resolveGoogleOAuthRedirectUri({ platform: 'android', iosClientId: undefined, customSchemeUri: custom }),
  ANDROID_GOOGLE_REDIRECT_URI,
);
assert.equal(
  resolveGoogleOAuthRedirectUri({
    platform: 'android',
    iosClientId: iosId,
    customSchemeUri: 'exp://192.168.1.2:8081/--/oauth',
  }),
  ANDROID_GOOGLE_REDIRECT_URI,
);
assert.equal(googleAuthPromptFailedMessage({ type: 'dismiss' }), null);
assert.equal(googleAuthPromptFailedMessage({ type: 'cancel' }), null);
assert.equal(
  googleAuthPromptFailedMessage({ type: 'error', params: { error: 'redirect_uri_mismatch' } }),
  'Google non ha riconosciuto l’app. Riprova, oppure entra con email.',
);

console.log('ok google auth snapshots the code; identity login skips Drive consent');
