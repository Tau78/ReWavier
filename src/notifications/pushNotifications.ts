import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Linking, Platform } from 'react-native';

import type { AppNotification } from '../domain/notifications';
import {
  mentionPayloadFromData,
  mentionPayloadToData,
  type MentionNotificationPayload,
} from './mentionPayload';
import { openMentionNotification } from './notificationRouter';

const ANDROID_CHANNEL_ID = 'mentions';

let handlerInstalled = false;
let listenersInstalled = false;

export type PushPermissionState = 'granted' | 'denied' | 'undetermined';

export function configureOsNotificationHandler(): void {
  if (handlerInstalled) {
    return;
  }
  handlerInstalled = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: 'Tag e menzioni',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 180, 80, 180],
    lightColor: '#FF6B35',
  });
}

export async function readPushPermissionState(): Promise<PushPermissionState> {
  const settings = await Notifications.getPermissionsAsync();
  if (settings.granted || settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) {
    return 'granted';
  }
  if (settings.canAskAgain === false) {
    return 'denied';
  }
  return 'undetermined';
}

export async function requestPushPermission(): Promise<PushPermissionState> {
  await ensureAndroidChannel();
  const current = await Notifications.getPermissionsAsync();
  if (
    current.granted ||
    current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  ) {
    return 'granted';
  }
  const next = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: true, allowSound: true },
  });
  if (next.granted || next.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) {
    return 'granted';
  }
  if (next.canAskAgain === false) {
    return 'denied';
  }
  return 'denied';
}

/** Expo push token for remote delivery (requires dev/production build, not Expo Go on Android). */
export async function registerExpoPushToken(): Promise<string | null> {
  if (!Device.isDevice) {
    return null;
  }
  const permission = await requestPushPermission();
  if (permission !== 'granted') {
    return null;
  }
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;
  if (!projectId) {
    return null;
  }
  try {
    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    return token.data?.trim() || null;
  } catch {
    return null;
  }
}

export async function presentMentionOsNotification(
  item: AppNotification,
  albumName?: string,
): Promise<void> {
  const permission = await readPushPermissionState();
  if (permission !== 'granted') {
    return;
  }
  await ensureAndroidChannel();
  const title = albumName?.trim()
    ? `${item.fromAuthorName} in ${albumName}`
    : `${item.fromAuthorName} ti ha taggato`;
  const body = item.snippet.trim() || 'Tocca per ascoltare da quel punto.';
  const payload: MentionNotificationPayload = {
    kind: 'mention',
    albumId: item.albumId,
    trackId: item.trackId,
    markerId: item.markerId,
    timestampMs: item.timestampMs,
  };
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: mentionPayloadToData(payload),
      sound: true,
      ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_ID } : {}),
    },
    trigger: null,
  });
}

/** Best-effort remote push via Expo Push API (no custom server). */
export async function sendExpoPushMention(input: {
  to: string;
  fromAuthorName: string;
  albumName?: string;
  snippet: string;
  payload: MentionNotificationPayload;
}): Promise<boolean> {
  const token = input.to.trim();
  if (!token.startsWith('ExponentPushToken[')) {
    return false;
  }
  const title = input.albumName?.trim()
    ? `${input.fromAuthorName} in ${input.albumName}`
    : `${input.fromAuthorName} ti ha taggato`;
  const body = input.snippet.trim() || 'Tocca per ascoltare da quel punto.';
  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: token,
        title,
        body,
        data: mentionPayloadToData(input.payload),
        sound: 'default',
        priority: 'high',
        channelId: ANDROID_CHANNEL_ID,
      }),
    });
    if (!response.ok) {
      return false;
    }
    const json = (await response.json()) as { data?: { status?: string }[] };
    const status = json.data?.[0]?.status;
    return status === 'ok';
  } catch {
    return false;
  }
}

export function openSystemNotificationSettings(): void {
  void Linking.openSettings();
}

export function installNotificationListeners(): () => void {
  if (listenersInstalled) {
    return () => undefined;
  }
  listenersInstalled = true;
  configureOsNotificationHandler();

  const onResponse = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as Record<string, unknown> | undefined;
    const payload = mentionPayloadFromData(data);
    if (payload) {
      void openMentionNotification(payload);
    }
  });

  return () => {
    listenersInstalled = false;
    onResponse.remove();
  };
}

export async function readInitialNotificationResponse(): Promise<void> {
  const last = await Notifications.getLastNotificationResponseAsync();
  if (!last) {
    return;
  }
  const data = last.notification.request.content.data as Record<string, unknown> | undefined;
  const payload = mentionPayloadFromData(data);
  if (payload) {
    await openMentionNotification(payload);
  }
}
