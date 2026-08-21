import { useEffect } from 'react';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';

import { useSessionStore } from '../store/sessionStore';

WebBrowser.maybeCompleteAuthSession();

const DRIVE_SCOPES = [
  'openid',
  'profile',
  'email',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.readonly',
];

function readClientIds() {
  const extra = (Constants.expoConfig?.extra ?? {}) as {
    googleIosClientId?: string;
    googleExpoIosClientId?: string;
    googleWebClientId?: string;
  };
  const storeIos = extra.googleIosClientId || process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '';
  const expoIos =
    extra.googleExpoIosClientId || process.env.EXPO_PUBLIC_GOOGLE_EXPO_IOS_CLIENT_ID || '';
  const web = extra.googleWebClientId || process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '';
  const inExpoGo = Constants.appOwnership === 'expo';
  const iosClientId = (inExpoGo ? expoIos || storeIos : storeIos || expoIos) || undefined;
  const webClientId = web || undefined;
  return {
    iosClientId,
    webClientId,
    configured: Boolean(iosClientId || webClientId),
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
  const clientId = ids.iosClientId ?? ids.webClientId ?? 'rewavier.apps.googleusercontent.com';
  const [request, response, promptAsync] = Google.useAuthRequest({
    iosClientId: ids.iosClientId ?? clientId,
    webClientId: ids.webClientId,
    clientId,
    scopes: DRIVE_SCOPES,
    extraParams: {
      access_type: 'offline',
      include_granted_scopes: 'true',
      prompt: 'consent select_account',
    },
  });

  useEffect(() => {
    if (response?.type !== 'success') {
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
    ready: request != null,
    prompt: async () => {
      try {
        return await promptAsync();
      } finally {
        void WebBrowser.coolDownAsync().catch(() => undefined);
        WebBrowser.dismissAuthSession();
      }
    },
  };
}
