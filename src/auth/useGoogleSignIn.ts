import { useMemo, useRef } from 'react';
import { Platform } from 'react-native';
import * as AuthSession from 'expo-auth-session';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';

import { useSessionStore } from '../store/sessionStore';
import {
  GOOGLE_DRIVE_EXTRA_PARAMS,
  GOOGLE_IDENTITY_EXTRA_PARAMS,
  googleAccessTokenFromResult,
  googleAuthNeedsCodeExchange,
  googleExchangeIsReady,
  googleTokenHasDriveScope,
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

/** Only drive.file — never drive.readonly (restricted; unverified warning + CASA). */
const DRIVE_SCOPES = [
  ...IDENTITY_SCOPES,
  'https://www.googleapis.com/auth/drive.file',
];

export type GoogleAuthKind = 'identity' | 'drive';

const DRIVE_CONNECT_ERROR =
  'Google non ha collegato Drive. Tocca di nuovo Continua con Google.';

function validClientId(value?: string): string | undefined {
  const trimmed = value?.trim() ?? '';
  return CLIENT_ID_RE.test(trimmed) ? trimmed : undefined;
}

function reversedGoogleScheme(clientId: string): string {
  return `com.googleusercontent.apps.${clientId.replace(/\.apps\.googleusercontent\.com$/i, '')}`;
}

function readClientIds() {
  const extra = (Constants.expoConfig?.extra ?? {}) as {
    googleIosClientId?: string;
    googleExpoIosClientId?: string;
    googleWebClientId?: string;
    googleAndroidClientId?: string;
  };
  const storeIos = validClientId(
    extra.googleIosClientId || process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  );
  const expoIos = validClientId(
    extra.googleExpoIosClientId || process.env.EXPO_PUBLIC_GOOGLE_EXPO_IOS_CLIENT_ID,
  );
  const android = validClientId(
    extra.googleAndroidClientId || process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
  );
  const web = validClientId(extra.googleWebClientId || process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID);
  const inExpoGo = Constants.appOwnership === 'expo';
  const iosClientId = inExpoGo ? undefined : storeIos ?? expoIos;
  const clientId =
    Platform.OS === 'android'
      ? android ?? web
      : inExpoGo
        ? web ?? expoIos ?? storeIos
        : iosClientId ?? web;
  return {
    iosClientId,
    androidClientId: android,
    webClientId: web,
    clientId,
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

async function exchangeGoogleCode(
  code: string,
  clientId: string,
  redirectUri: string,
  codeVerifier: string,
  scopes: string[],
): Promise<AuthSession.TokenResponse> {
  return AuthSession.exchangeCodeAsync(
    {
      clientId,
      code,
      redirectUri,
      scopes,
      extraParams: {
        code_verifier: codeVerifier,
      },
    },
    { tokenEndpoint: GOOGLE_TOKEN_ENDPOINT },
  );
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

  let idToken = response.params.id_token ?? response.authentication?.idToken ?? undefined;
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
      );
      accessToken = exchanged.accessToken || accessToken;
      idToken = exchanged.idToken ?? idToken;
      refreshToken = exchanged.refreshToken ?? refreshToken;
      expiresIn = exchanged.expiresIn ?? expiresIn;
      scope = exchanged.scope ?? scope;
    } catch {
      throw new Error(failMessage);
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
    throw new Error(DRIVE_CONNECT_ERROR);
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

function useGoogleAuthRequest(kind: GoogleAuthKind) {
  const ids = readClientIds();
  const clientId = ids.clientId;
  const redirectUri = ids.iosClientId
    ? `${reversedGoogleScheme(ids.iosClientId)}:/oauthredirect`
    : AuthSession.makeRedirectUri({
        scheme: 'rewavier',
        path: 'oauth',
      });

  // Stable config so a loading-state re-render does not mint a new PKCE verifier mid-login.
  const authRequestConfig = useMemo(
    () => ({
      iosClientId: ids.iosClientId,
      androidClientId: ids.androidClientId,
      webClientId: ids.webClientId,
      clientId: clientId ?? ids.webClientId,
      redirectUri,
      language: 'it' as const,
      shouldAutoExchangeCode: false as const,
      scopes: kind === 'drive' ? DRIVE_SCOPES : IDENTITY_SCOPES,
      extraParams: kind === 'drive' ? GOOGLE_DRIVE_EXTRA_PARAMS : GOOGLE_IDENTITY_EXTRA_PARAMS,
    }),
    [kind, ids.iosClientId, ids.androidClientId, ids.webClientId, clientId, redirectUri],
  );

  const [request, , promptAsync] = Google.useAuthRequest(authRequestConfig);
  const requestRef = useRef(request);
  requestRef.current = request;
  const promptAsyncRef = useRef(promptAsync);
  promptAsyncRef.current = promptAsync;
  const exchangeRef = useRef<GoogleExchangeExtras | null>(null);

  const notReady = 'Google non è ancora pronto. Entra con Apple o crea un account email.';

  return {
    ready: Boolean(clientId && request),
    clientId,
    redirectUri,
    requestRef,
    promptAsyncRef,
    exchangeRef,
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
    prompt: async () => {
      if (!auth.clientId) {
        throw new Error(auth.notReady);
      }
      auth.exchangeRef.current = snapshotGoogleExchange(
        auth.redirectUri,
        auth.requestRef.current?.codeVerifier,
      );
      return auth.promptAsyncRef.current();
    },
  };
}

export async function runGoogleDriveConnect(
  drive: ReturnType<typeof useGoogleDriveConnect>,
): Promise<boolean> {
  const result = await drive.prompt();
  if (result.type === 'dismiss' || result.type === 'cancel') {
    return false;
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
    prompt: async () => {
      if (!auth.clientId) {
        throw new Error(auth.notReady);
      }
      auth.exchangeRef.current = snapshotGoogleExchange(
        auth.redirectUri,
        auth.requestRef.current?.codeVerifier,
      );
      return auth.promptAsyncRef.current();
    },
  };
}
