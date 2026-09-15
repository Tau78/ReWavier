import { useMemo, useRef } from 'react';
import { Platform } from 'react-native';
import * as AuthSession from 'expo-auth-session';
import * as Google from 'expo-auth-session/providers/google';
import * as Updates from 'expo-updates';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';

import { useSessionStore } from '../store/sessionStore';
import {
  GOOGLE_IDENTITY_EXTRA_PARAMS,
  ANDROID_GOOGLE_RETURN_URI,
  ANDROID_GOOGLE_EXCHANGE_URL,
  DESKTOP_GOOGLE_CLIENT_ID,
  EXPO_IOS_GOOGLE_CLIENT_ID,
  STORE_IOS_GOOGLE_CLIENT_ID,
  WEB_GOOGLE_CLIENT_ID,
  androidGoogleNativeRedirectUri,
  androidUsesNativeGoogleRedirect,
  googleAccessTokenFromResult,
  googleAuthNeedsCodeExchange,
  googleAuthPromptFailedMessage,
  googleClientSecretForExchange,
  googleDriveAuthorizeExtraParams,
  googleExchangeIsReady,
  googleIdTokenFromResult,
  googleTokenHasDriveScope,
  iosGoogleRedirectUri,
  pickGoogleClientIds,
  resolveGoogleOAuthRedirectUri,
  reversedGoogleClientScheme,
  snapshotGoogleExchange,
  type GoogleExchangeExtras,
} from './googleAuthResult';

WebBrowser.maybeCompleteAuthSession();

const CLIENT_ID_RE = /^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/i;
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO = 'https://openidconnect.googleapis.com/v1/userinfo';

const IDENTITY_SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

/** Shared Drive membership (`GET /drives`) needs drive.readonly — same listing as iPhone.
 * drive.file alone cannot show Drive Condivisi; keep both so picker grants still work. */
const DRIVE_SCOPES = [
  ...IDENTITY_SCOPES,
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.readonly',
];

export type GoogleAuthKind = 'identity' | 'drive';

const DRIVE_CONNECT_ERROR =
  'Google non ha collegato Drive. Nella schermata Google spunta la casella di Drive e tocca Continua. Oppure usa «Collega da File».';

function validClientId(value?: string): string | undefined {
  const trimmed = value?.trim() ?? '';
  return CLIENT_ID_RE.test(trimmed) ? trimmed : undefined;
}

function readGoogleClientSecrets(): { desktop?: string; web?: string } {
  const extra = (Constants.expoConfig?.extra ?? {}) as {
    googleWebClientSecret?: string;
    googleDesktopClientSecret?: string;
  };
  return {
    desktop:
      extra.googleDesktopClientSecret?.trim() ||
      process.env.GOOGLE_DESKTOP_CLIENT_SECRET?.trim() ||
      undefined,
    web: extra.googleWebClientSecret?.trim() || process.env.GOOGLE_WEB_CLIENT_SECRET?.trim() || undefined,
  };
}

function readClientIds() {
  const extra = (Constants.expoConfig?.extra ?? {}) as {
    googleIosClientId?: string;
    googleExpoIosClientId?: string;
    googleWebClientId?: string;
    googleAndroidClientId?: string;
    googleWebClientSecret?: string;
    googleDesktopClientSecret?: string;
  };
  const storeIos = validClientId(
    extra.googleIosClientId ||
      process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ||
      STORE_IOS_GOOGLE_CLIENT_ID,
  );
  const expoIos = validClientId(
    extra.googleExpoIosClientId ||
      process.env.EXPO_PUBLIC_GOOGLE_EXPO_IOS_CLIENT_ID ||
      EXPO_IOS_GOOGLE_CLIENT_ID,
  );
  const android = validClientId(
    extra.googleAndroidClientId || process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
  );
  const web = validClientId(
    extra.googleWebClientId || process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || WEB_GOOGLE_CLIENT_ID,
  );
  const inExpoGo = Constants.appOwnership === 'expo';
  return {
    ...pickGoogleClientIds({
      platform: Platform.OS,
      inExpoGo,
      storeIos,
      expoIos,
      android,
      web,
    }),
    inExpoGo,
  };
}

function decodeJwtEmail(idToken: string): { email: string; name: string; sub: string } {
  try {
    const payload = idToken.split('.')[1];
    if (!payload) {
      throw new Error('token');
    }
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as {
      email?: string;
      name?: string;
      sub?: string;
    };
    return {
      email: json.email ?? '',
      name: json.name ?? json.email ?? 'Google',
      sub: json.sub ?? `google-${Date.now()}`,
    };
  } catch {
    return { email: '', name: 'Google', sub: `google-${Date.now()}` };
  }
}

async function profileFromGoogle(
  idToken?: string,
  accessToken?: string,
): Promise<{ email: string; name: string; sub: string }> {
  if (idToken) {
    const fromToken = decodeJwtEmail(idToken);
    if (fromToken.email || fromToken.sub) {
      return fromToken;
    }
  }
  if (accessToken) {
    try {
      const response = await fetch(GOOGLE_USERINFO, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (response.ok) {
        const json = (await response.json()) as {
          email?: string;
          name?: string;
          sub?: string;
        };
        return {
          email: json.email ?? '',
          name: json.name ?? json.email ?? 'Google',
          sub: json.sub ?? `google-${Date.now()}`,
        };
      }
    } catch {
      // fall through
    }
  }
  return { email: '', name: 'Google', sub: `google-${Date.now()}` };
}

async function exchangeViaEventi(body: Record<string, string>): Promise<{
  accessToken?: string;
  idToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  scope?: string;
}> {
  const response = await fetch(ANDROID_GOOGLE_EXCHANGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });
  const json = (await response.json()) as {
    access_token?: string;
    id_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };
  if (!response.ok || !json.access_token) {
    throw new Error('exchange');
  }
  return {
    accessToken: json.access_token,
    idToken: json.id_token,
    refreshToken: json.refresh_token,
    expiresIn: json.expires_in,
    scope: json.scope,
  };
}

async function exchangeGoogleCode(
  code: string,
  clientId: string,
  redirectUri: string,
  codeVerifier: string,
  scopes: string[],
  clientSecret?: string,
): Promise<{
  accessToken?: string;
  idToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  scope?: string;
}> {
  if (clientId === DESKTOP_GOOGLE_CLIENT_ID) {
    try {
      return await exchangeViaEventi({
        client_id: clientId,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      });
    } catch {
      // Fall through to in-app exchange if the page is down.
    }
  }
  const extraParams: Record<string, string> = {
    code_verifier: codeVerifier,
  };
  const request: AuthSession.AccessTokenRequestConfig = {
    clientId,
    code,
    redirectUri,
    scopes,
    extraParams,
  };
  if (clientSecret) {
    request.clientSecret = clientSecret;
  }
  const exchanged = await AuthSession.exchangeCodeAsync(request, {
    tokenEndpoint: GOOGLE_TOKEN_ENDPOINT,
  });
  return {
    accessToken: exchanged.accessToken,
    idToken: exchanged.idToken ?? undefined,
    refreshToken: exchanged.refreshToken ?? undefined,
    expiresIn: exchanged.expiresIn,
    scope: exchanged.scope ?? undefined,
  };
}

async function tokensFromGoogleResult(
  response: AuthSession.AuthSessionResult,
  clientId: string,
  extras: GoogleExchangeExtras | undefined,
  failMessage: string,
  scopes: string[],
): Promise<{
  idToken?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  scope?: string;
}> {
  if (response.type !== 'success') {
    throw new Error(failMessage);
  }

  let idToken = googleIdTokenFromResult(response);
  let accessToken = googleAccessTokenFromResult(response);
  let refreshToken = response.authentication?.refreshToken ?? response.params.refresh_token;
  let expiresIn = response.authentication?.expiresIn;
  let scope = response.authentication?.scope ?? response.params.scope;

  if (googleAuthNeedsCodeExchange(response)) {
    if (!googleExchangeIsReady(extras)) {
      throw new Error(failMessage);
    }
    try {
      const exchanged = await exchangeGoogleCode(
        response.params.code,
        clientId,
        extras.redirectUri,
        extras.codeVerifier,
        scopes,
        googleClientSecretForExchange(clientId, readGoogleClientSecrets()),
      );
      accessToken = exchanged.accessToken || accessToken;
      idToken = exchanged.idToken ?? idToken;
      refreshToken = exchanged.refreshToken ?? refreshToken;
      expiresIn = exchanged.expiresIn ?? expiresIn;
      scope = exchanged.scope ?? scope;
    } catch {
      if (!idToken && !accessToken) {
        throw new Error(failMessage);
      }
    }
  }

  return { idToken, accessToken, refreshToken, expiresIn, scope };
}

export async function completeGoogleSignIn(
  response: AuthSession.AuthSessionResult,
  clientId: string,
  extras?: GoogleExchangeExtras,
): Promise<void> {
  const tokens = await tokensFromGoogleResult(
    response,
    clientId,
    extras,
    'Login Google non riuscito. Riprova con Apple o email.',
    IDENTITY_SCOPES,
  );
  const profile = await profileFromGoogle(tokens.idToken, tokens.accessToken);
  if (!profile.email && profile.sub.startsWith('google-')) {
    throw new Error('Login Google non riuscito. Riprova con Apple o email.');
  }
  const driveOk = Boolean(tokens.accessToken && googleTokenHasDriveScope(tokens.scope));
  await useSessionStore.getState().signInSocial({
    provider: 'google',
    id: `google:${profile.sub}`,
    email: profile.email,
    displayName: profile.name,
    accessToken: driveOk ? tokens.accessToken : undefined,
    refreshToken: driveOk ? tokens.refreshToken : undefined,
    clientId: driveOk ? clientId : undefined,
    expiresIn: driveOk ? tokens.expiresIn : undefined,
    scope: tokens.scope,
    driveConnected: driveOk,
  });
}

export async function completeGoogleDriveConnect(
  response: AuthSession.AuthSessionResult,
  clientId: string,
  extras?: GoogleExchangeExtras,
): Promise<void> {
  const tokens = await tokensFromGoogleResult(
    response,
    clientId,
    extras,
    DRIVE_CONNECT_ERROR,
    DRIVE_SCOPES,
  );
  if (!tokens.accessToken || !googleTokenHasDriveScope(tokens.scope)) {
    throw new Error(
      tokens.accessToken && !googleTokenHasDriveScope(tokens.scope)
        ? 'Hai dato l’ok a Google senza il permesso Drive. Riprova, spunta la casella Drive e tocca Continua.'
        : DRIVE_CONNECT_ERROR,
    );
  }
  const session = useSessionStore.getState();
  if (session.user) {
    await session.attachGoogleDrive({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      clientId,
      expiresIn: tokens.expiresIn,
      scope: tokens.scope,
    });
    return;
  }
  await completeGoogleSignIn(response, clientId, extras);
}

export function isGoogleConfigured(): boolean {
  const ids = readClientIds();
  if (ids.inExpoGo) {
    return Boolean(ids.clientId);
  }
  if (Platform.OS === 'ios') {
    return Boolean(ids.iosClientId);
  }
  if (Platform.OS === 'android') {
    return Boolean(ids.androidClientId ?? ids.webClientId);
  }
  return Boolean(ids.clientId);
}

async function waitForGoogleAuthRequest(
  getRequest: () => AuthSession.AuthRequest | null | undefined,
): Promise<AuthSession.AuthRequest | null | undefined> {
  for (let attempt = 0; attempt < 15; attempt += 1) {
    const request = getRequest();
    if (request?.url) {
      return request;
    }
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  return getRequest();
}

function useGoogleAuthRequest(kind: GoogleAuthKind) {
  const ids = readClientIds();
  const useNativeAndroidGoogle =
    Platform.OS === 'android' &&
    !ids.inExpoGo &&
    androidUsesNativeGoogleRedirect(
      undefined,
      Updates.runtimeVersion || Constants.expoConfig?.version,
    );
  const useAndroidHttpsImplicit = Platform.OS === 'android' && !ids.inExpoGo && !useNativeAndroidGoogle;
  const androidNativeClientId = ids.androidClientId || DESKTOP_GOOGLE_CLIENT_ID;
  const clientId = useNativeAndroidGoogle ? androidNativeClientId : ids.clientId;
  const iosRedirect = ids.iosClientId ? iosGoogleRedirectUri(ids.iosClientId) : undefined;
  const androidNativeRedirect = androidGoogleNativeRedirectUri(androidNativeClientId);
  const redirectUri = resolveGoogleOAuthRedirectUri({
    platform: Platform.OS,
    iosClientId: ids.iosClientId,
    webClientId: ids.webClientId,
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

  // Stable config so a loading-state re-render does not mint a new PKCE verifier mid-login.
  // Standalone iOS: only the iOS client. A web client + custom scheme is Error 400.
  const authRequestConfig = useMemo(() => {
    const config: Parameters<typeof Google.useAuthRequest>[0] = {
      clientId,
      redirectUri,
      language: 'it',
      shouldAutoExchangeCode: false,
      scopes: kind === 'drive' ? DRIVE_SCOPES : IDENTITY_SCOPES,
      extraParams:
        kind === 'drive'
          ? googleDriveAuthorizeExtraParams(useAndroidHttpsImplicit)
          : GOOGLE_IDENTITY_EXTRA_PARAMS,
    };
    if (useAndroidHttpsImplicit) {
      // Play 1.0.4: tokens on the HTTPS bounce page. No code exchange.
      config.responseType =
        kind === 'drive' ? AuthSession.ResponseType.Token : AuthSession.ResponseType.IdToken;
      config.usePKCE = false;
    }
    if (ids.iosClientId && Platform.OS === 'ios' && !ids.inExpoGo) {
      config.iosClientId = ids.iosClientId;
    } else if (useNativeAndroidGoogle) {
      config.androidClientId = androidNativeClientId;
    } else if (ids.webClientId) {
      config.webClientId = ids.webClientId;
    }
    if (ids.androidClientId && !useNativeAndroidGoogle) {
      config.androidClientId = ids.androidClientId;
    }
    return config;
  }, [
    kind,
    ids.iosClientId,
    ids.androidClientId,
    ids.webClientId,
    ids.inExpoGo,
    clientId,
    redirectUri,
    useNativeAndroidGoogle,
    useAndroidHttpsImplicit,
    androidNativeClientId,
  ]);

  const redirectUriOptions = useMemo(() => {
    if (ids.iosClientId && Platform.OS === 'ios') {
      return {
        native: iosGoogleRedirectUri(ids.iosClientId),
        scheme: reversedGoogleClientScheme(ids.iosClientId),
        path: 'oauthredirect',
      };
    }
    if (useNativeAndroidGoogle) {
      return {
        native: androidNativeRedirect,
        scheme: reversedGoogleClientScheme(androidNativeClientId),
        path: 'oauthredirect',
      };
    }
    return { native: ANDROID_GOOGLE_RETURN_URI, scheme: 'rewavier', path: 'oauth' };
  }, [ids.iosClientId, useNativeAndroidGoogle, androidNativeClientId, androidNativeRedirect]);

  const [request, , promptAsync] = Google.useAuthRequest(authRequestConfig, redirectUriOptions);
  const requestRef = useRef(request);
  requestRef.current = request;
  const promptAsyncRef = useRef(promptAsync);
  promptAsyncRef.current = promptAsync;
  const exchangeRef = useRef<GoogleExchangeExtras | null>(null);

  const notReady = 'Google non è ancora pronto. Entra con Apple o crea un account email.';

  const prompt = async () => {
    if (!clientId) {
      throw new Error(notReady);
    }
    exchangeRef.current = snapshotGoogleExchange(redirectUri, requestRef.current?.codeVerifier);
    if (Platform.OS === 'android') {
      try {
        await WebBrowser.warmUpAsync();
      } catch {
        // Custom Tabs warmup is optional
      }
      try {
        const request = await waitForGoogleAuthRequest(() => requestRef.current);
        const authUrl = request?.url;
        if (!request || !authUrl) {
          throw new Error(notReady);
        }
        const returnUri = useNativeAndroidGoogle ? androidNativeRedirect : ANDROID_GOOGLE_RETURN_URI;
        const browserResult = await WebBrowser.openAuthSessionAsync(authUrl, returnUri, {
          createTask: false,
          showInRecents: true,
        });
        if (browserResult.type !== 'success') {
          return { type: browserResult.type };
        }
        const parsed = request.parseReturnUrl(browserResult.url);
        if (parsed.type !== 'success' && parsed.type !== 'error') {
          return parsed;
        }
        const hasIdentity = Boolean(
          parsed.params.id_token ||
            parsed.params.access_token ||
            parsed.params.code ||
            parsed.authentication?.idToken ||
            parsed.authentication?.accessToken,
        );
        if (parsed.type === 'error' && hasIdentity) {
          return {
            type: 'success' as const,
            error: null,
            errorCode: parsed.errorCode,
            params: parsed.params,
            authentication: parsed.authentication,
            url: parsed.url,
          };
        }
        return parsed;
      } finally {
        try {
          await WebBrowser.coolDownAsync();
        } catch {
          // optional
        }
      }
    }
    return promptAsyncRef.current();
  };

  return {
    ready: Boolean(clientId && request),
    clientId,
    redirectUri,
    requestRef,
    promptAsyncRef,
    exchangeRef,
    prompt,
    notReady,
  };
}

export function useGoogleSignIn() {
  const auth = useGoogleAuthRequest('identity');
  return {
    ready: auth.ready,
    completeGoogleSignIn: async (result: AuthSession.AuthSessionResult) => {
      if (!auth.clientId) {
        throw new Error(auth.notReady);
      }
      await completeGoogleSignIn(
        result,
        auth.clientId,
        auth.exchangeRef.current ??
          snapshotGoogleExchange(auth.redirectUri, auth.requestRef.current?.codeVerifier),
      );
    },
    prompt: auth.prompt,
  };
}

export async function runGoogleDriveConnect(
  drive: ReturnType<typeof useGoogleDriveConnect>,
): Promise<boolean> {
  const result = await drive.prompt();
  if (result.type === 'dismiss' || result.type === 'cancel') {
    return false;
  }
  const failed = googleAuthPromptFailedMessage(result);
  if (failed) {
    throw new Error(failed);
  }
  await drive.completeDriveConnect(result);
  return true;
}

export function useGoogleDriveConnect() {
  const auth = useGoogleAuthRequest('drive');
  return {
    ready: auth.ready,
    completeDriveConnect: async (result: AuthSession.AuthSessionResult) => {
      if (!auth.clientId) {
        throw new Error(auth.notReady);
      }
      await completeGoogleDriveConnect(
        result,
        auth.clientId,
        auth.exchangeRef.current ??
          snapshotGoogleExchange(auth.redirectUri, auth.requestRef.current?.codeVerifier),
      );
    },
    prompt: auth.prompt,
  };
}
