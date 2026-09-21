import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { requireOptionalNativeModule } from 'expo-modules-core';
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
let availabilityCache: boolean | null = null;

export type PushPermissionState = 'granted' | 'denied' | 'undetermined';

/** Native expo-notifications linked in this build (OTA alone is not enough). */
export function isOsNotificationsAvailable(): boolean {
  if (availabilityCache != null) {
    return availabilityCache;
  }
  try {
    const permissions = requireOptionalNativeModule('ExpoNotificationPermissionsModule');
    const scheduler = requireOptionalNativeModule('ExpoNotificationScheduler');
    availabilityCache =
      permissions != null &&
      typeof permissions.getPermissionsAsync === 'function' &&
      scheduler != null &&
      typeof scheduler.scheduleNotificationAsync === 'function';
  } catch {
    availabilityCache = false;
  }
  return availabilityCache;
}

export function configureOsNotificationHandler(): void {
  if (!isOsNotificationsAvailable() || handlerInstalled) {
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

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android' || !isOsNotificationsAvailable()) {
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
  if (!isOsNotificationsAvailable()) {
    return false;
  }
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
  if (!isOsNotificationsAvailable() || listenersInstalled) {
    return () => undefined;
  }
  listenersInstalled = true;
  configureOsNotificationHandler();

  let onResponse: Notifications.Subscription | undefined;
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
