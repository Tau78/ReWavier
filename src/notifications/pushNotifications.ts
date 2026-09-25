import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Linking, Platform } from 'react-native';

import type { AppNotification } from '../domain/notifications';
import {
  mentionPayloadFromData,
  mentionPayloadToData,
  type MentionNotificationPayload,
} from './mentionPayload';
import { openMentionNotification } from './notificationRouter';
import {
  isOsNotificationsAvailable,
  markOsNotificationsUnavailable,
} from './osNotificationsAvailability';

export { isOsNotificationsAvailable } from './osNotificationsAvailability';

const ANDROID_CHANNEL_ID = 'mentions';

type NotificationsModule = typeof import('expo-notifications');

let handlerInstalled = false;
let listenersInstalled = false;
let notificationsModule: NotificationsModule | null = null;
let notificationsLoad: Promise<NotificationsModule | null> | null = null;

async function loadNotifications(): Promise<NotificationsModule | null> {
  if (!isOsNotificationsAvailable()) {
    return null;
  }
  if (notificationsModule) {
    return notificationsModule;
  }
  if (!notificationsLoad) {
    notificationsLoad = import('expo-notifications')
      .then((mod) => {
        notificationsModule = mod;
        return mod;
      })
      .catch(() => {
        markOsNotificationsUnavailable();
        notificationsModule = null;
        return null;
      });
  }
  return notificationsLoad;
}

export type PushPermissionState = 'granted' | 'denied' | 'undetermined';

export async function configureOsNotificationHandler(): Promise<void> {
  if (!isOsNotificationsAvailable() || handlerInstalled) {
    return;
  }
  const Notifications = await loadNotifications();
  if (!Notifications) {
    return;
  }
  handlerInstalled = true;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  } catch {
    handlerInstalled = false;
  }
}

async function ensureAndroidChannel(Notifications: NotificationsModule): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }
  try {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: 'Tag e menzioni',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 180, 80, 180],
      lightColor: '#FF6B35',
    });
  } catch {
    // channel optional until native build includes notifications
  }
}

export async function readPushPermissionState(): Promise<PushPermissionState> {
  if (!isOsNotificationsAvailable()) {
    return 'undetermined';
  }
  try {
    const Notifications = await loadNotifications();
    if (!Notifications) {
      return 'undetermined';
    }
    const settings = await Notifications.getPermissionsAsync();
    if (settings.granted || settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) {
      return 'granted';
    }
    if (settings.canAskAgain === false) {
      return 'denied';
    }
    return 'undetermined';
  } catch {
    return 'undetermined';
  }
}

export async function requestPushPermission(): Promise<PushPermissionState> {
  if (!isOsNotificationsAvailable()) {
    return 'undetermined';
  }
  try {
    const Notifications = await loadNotifications();
    if (!Notifications) {
      return 'undetermined';
    }
    await ensureAndroidChannel(Notifications);
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
  } catch {
    return 'undetermined';
  }
}

/** Expo push token for remote delivery (requires dev/production build, not Expo Go on Android). */
export async function registerExpoPushToken(): Promise<string | null> {
  if (!isOsNotificationsAvailable() || !Device.isDevice) {
    return null;
  }
  try {
    const Notifications = await loadNotifications();
    if (!Notifications) {
      return null;
    }
    // Android 13+: channel must exist before the permission prompt / token fetch.
    await ensureAndroidChannel(Notifications);
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
  if (!isOsNotificationsAvailable()) {
    return;
  }
  try {
    const permission = await readPushPermissionState();
    if (permission !== 'granted') {
      return;
    }
    const Notifications = await loadNotifications();
    if (!Notifications) {
      return;
    }
    await ensureAndroidChannel(Notifications);
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
  } catch {
    // skip banner if native module missing or permission denied
  }
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
    const json = (await response.json()) as {
      data?: { status?: string; message?: string; details?: { error?: string } }[];
    };
    const row = json.data?.[0];
    return row?.status === 'ok';
  } catch {
    return false;
  }
}

export function openSystemNotificationSettings(): void {
  void Linking.openSettings();
}

export async function installNotificationListeners(): Promise<() => void> {
  if (!isOsNotificationsAvailable() || listenersInstalled) {
    return () => undefined;
  }
  const Notifications = await loadNotifications();
  if (!Notifications) {
    return () => undefined;
  }
  listenersInstalled = true;
  await configureOsNotificationHandler();
  await ensureAndroidChannel(Notifications);

  let onResponse: { remove: () => void } | undefined;
  try {
    onResponse = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, unknown> | undefined;
      const payload = mentionPayloadFromData(data);
      if (payload) {
        void openMentionNotification(payload);
      }
    });
  } catch {
    listenersInstalled = false;
    return () => undefined;
  }

  return () => {
    listenersInstalled = false;
    onResponse?.remove();
  };
}

export async function readInitialNotificationResponse(): Promise<void> {
  if (!isOsNotificationsAvailable()) {
    return;
  }
  try {
    const Notifications = await loadNotifications();
    if (!Notifications) {
      return;
    }
    const last = await Notifications.getLastNotificationResponseAsync();
    if (!last) {
      return;
    }
    const data = last.notification.request.content.data as Record<string, unknown> | undefined;
    const payload = mentionPayloadFromData(data);
    if (payload) {
      await openMentionNotification(payload);
    }
  } catch {
    // cold start without notification module
  }
}
