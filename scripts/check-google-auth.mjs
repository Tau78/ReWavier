import assert from 'node:assert/strict';

const GOOGLE_OAUTH_EXTRA_PARAMS = {
  access_type: 'offline',
  prompt: 'consent select_account',
  include_granted_scopes: 'true',
};

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

assert.equal(GOOGLE_OAUTH_EXTRA_PARAMS.access_type, 'offline');
assert.match(GOOGLE_OAUTH_EXTRA_PARAMS.prompt, /consent/);
assert.equal(googleTokenHasDriveScope('openid https://www.googleapis.com/auth/drive.file'), true);
assert.equal(
  googleTokenHasDriveScope('openid+https://www.googleapis.com/auth/drive.file+email'),
  true,
);
assert.equal(googleTokenHasDriveScope('openid email profile'), false);
assert.equal(googleTokenHasDriveScope(undefined), false);

console.log('ok google auth snapshots the code before Drive login');
