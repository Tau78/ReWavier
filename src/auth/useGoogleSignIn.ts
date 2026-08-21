import { useEffect } from 'react';
import * as AuthSession from 'expo-auth-session';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';

import { useSessionStore } from '../store/sessionStore';

WebBrowser.maybeCompleteAuthSession();

const CLIENT_ID_RE = /^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/i;

const DRIVE_SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.readonly',
];

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

export function useGoogleSignIn() {
  const ids = readClientIds();
  const clientId = ids.clientId;
  const redirectUri = ids.iosClientId
    ? `${reversedGoogleScheme(ids.iosClientId)}:/oauthredirect`
    : AuthSession.makeRedirectUri({
        scheme: 'rewavier',
        path: 'oauth',
      });

  const [request, response, promptAsync] = Google.useAuthRequest({
    iosClientId: ids.iosClientId,
    webClientId: ids.webClientId,
    clientId: clientId ?? ids.webClientId,
    redirectUri,
    language: 'it',
    selectAccount: true,
    scopes: DRIVE_SCOPES,
    extraParams: {
      access_type: 'offline',
    },
  });

  useEffect(() => {
    if (response?.type !== 'success' || !clientId) {
      return;
    }
    const idToken = response.params.id_token ?? response.authentication?.idToken;
    const accessToken = response.authentication?.accessToken ?? response.params.access_token;
    const refreshToken = response.authentication?.refreshToken ?? response.params.refresh_token;
    const expiresIn = response.authentication?.expiresIn;
    const profile = idToken
      ? decodeJwtEmail(idToken)
      : { email: '', name: 'Google', sub: `google-${Date.now()}` };
    void useSessionStore.getState().signInSocial({
      provider: 'google',
      id: `google:${profile.sub}`,
      email: profile.email,
      displayName: profile.name,
      accessToken,
      refreshToken,
      clientId,
      expiresIn,
    });
  }, [clientId, response]);

  return {
    ready: Boolean(clientId && request),
    prompt: async () => {
      if (!clientId) {
        throw new Error('Google non è ancora pronto. Entra con Apple o crea un account email.');
      }
      try {
        return await promptAsync();
      } finally {
        void WebBrowser.coolDownAsync().catch(() => undefined);
        WebBrowser.dismissAuthSession();
      }
    },
  };
}
