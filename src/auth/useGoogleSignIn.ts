import { useRef } from 'react';
import { Platform } from 'react-native';
import * as AuthSession from 'expo-auth-session';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';

import { useSessionStore } from '../store/sessionStore';
import {
  GOOGLE_OAUTH_EXTRA_PARAMS,
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

const DRIVE_SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.readonly',
];

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
  };
  const storeIos = validClientId(
    extra.googleIosClientId || process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  );
  const expoIos = validClientId(
    extra.googleExpoIosClientId || process.env.EXPO_PUBLIC_GOOGLE_EXPO_IOS_CLIENT_ID,
  );
  const web = validClientId(extra.googleWebClientId || process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID);
  const inExpoGo = Constants.appOwnership === 'expo';
  const iosClientId = inExpoGo ? undefined : storeIos ?? expoIos;
  const clientId = inExpoGo ? web ?? expoIos ?? storeIos : iosClientId ?? web;
  return {
    iosClientId,
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
): Promise<AuthSession.TokenResponse> {
  return AuthSession.exchangeCodeAsync(
    {
      clientId,
      code,
      redirectUri,
      scopes: DRIVE_SCOPES,
      extraParams: {
        code_verifier: codeVerifier,
      },
    },
    { tokenEndpoint: GOOGLE_TOKEN_ENDPOINT },
  );
}

export async function completeGoogleSignIn(
  response: AuthSession.AuthSessionResult,
  clientId: string,
  extras?: GoogleExchangeExtras,
): Promise<void> {
  if (response.type !== 'success') {
    throw new Error('Login Google non riuscito. Riprova con Apple o email.');
  }

  let idToken = response.params.id_token ?? response.authentication?.idToken ?? undefined;
  let accessToken = googleAccessTokenFromResult(response);
  let refreshToken = response.authentication?.refreshToken ?? response.params.refresh_token;
  let expiresIn = response.authentication?.expiresIn;
  let scope = response.authentication?.scope ?? response.params.scope;

  if (googleAuthNeedsCodeExchange(response)) {
    if (!googleExchangeIsReady(extras)) {
      throw new Error(DRIVE_CONNECT_ERROR);
    }
    try {
      const exchanged = await exchangeGoogleCode(
        response.params.code,
        clientId,
        extras.redirectUri,
        extras.codeVerifier,
      );
      accessToken = exchanged.accessToken || accessToken;
      idToken = exchanged.idToken ?? idToken;
      refreshToken = exchanged.refreshToken ?? refreshToken;
      expiresIn = exchanged.expiresIn ?? expiresIn;
      scope = exchanged.scope ?? scope;
    } catch {
      throw new Error(DRIVE_CONNECT_ERROR);
    }
  }

  if (!accessToken) {
    throw new Error(DRIVE_CONNECT_ERROR);
  }
  if (scope && !googleTokenHasDriveScope(scope)) {
    throw new Error(DRIVE_CONNECT_ERROR);
  }

  const profile = await profileFromGoogle(idToken, accessToken);
  await useSessionStore.getState().signInSocial({
    provider: 'google',
    id: `google:${profile.sub}`,
    email: profile.email,
    displayName: profile.name,
    accessToken,
    refreshToken,
    clientId,
    expiresIn,
  });
}

export function isGoogleConfigured(): boolean {
  const ids = readClientIds();
  if (ids.inExpoGo) {
    return Boolean(ids.clientId);
  }
  if (Platform.OS === 'ios') {
    return Boolean(ids.iosClientId);
  }
  return Boolean(ids.clientId);
}

export function useGoogleSignIn() {
  const ids = readClientIds();
  const clientId = ids.clientId;
  const redirectUri = ids.iosClientId
    ? `${reversedGoogleScheme(ids.iosClientId)}:/oauthredirect`
    : AuthSession.makeRedirectUri({
        scheme: 'rewavier',
        path: 'oauth',
      });

  const [request, , promptAsync] = Google.useAuthRequest({
    iosClientId: ids.iosClientId,
    webClientId: ids.webClientId,
    clientId: clientId ?? ids.webClientId,
    redirectUri,
    language: 'it',
    shouldAutoExchangeCode: false,
    scopes: DRIVE_SCOPES,
    extraParams: GOOGLE_OAUTH_EXTRA_PARAMS,
  });
  const requestRef = useRef(request);
  requestRef.current = request;
  const exchangeRef = useRef<GoogleExchangeExtras | null>(null);

  return {
    ready: Boolean(clientId && request),
    completeGoogleSignIn: async (result: AuthSession.AuthSessionResult) => {
      if (!clientId) {
        throw new Error('Google non è ancora pronto. Entra con Apple o crea un account email.');
      }
      await completeGoogleSignIn(
        result,
        clientId,
        exchangeRef.current ??
          snapshotGoogleExchange(redirectUri, requestRef.current?.codeVerifier),
      );
    },
    prompt: async () => {
      if (!clientId) {
        throw new Error('Google non è ancora pronto. Entra con Apple o crea un account email.');
      }
      exchangeRef.current = snapshotGoogleExchange(
        redirectUri,
        requestRef.current?.codeVerifier,
      );
      return promptAsync();
    },
  };
}
