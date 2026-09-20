export type AppNotification = {
  id: string;
  albumId: string;
  trackId: string;
  markerId: string;
  timestampMs: number;
  fromAuthorName: string;
  fromAuthorId?: string;
  snippet: string;
  createdAt: number;
  readAt?: number;
  /** Set after banner shown in Centro notifiche (avoid duplicate OS alerts). */
  osNotifiedAt?: number;
};

export type NotificationPrefs = {
  /** Show banners in Centro notifiche / lock screen. Default true. */
  osEnabled: boolean;
  expoPushToken?: string;
};

export type NotificationSnapshot = {
  items: AppNotification[];
  prefs: NotificationPrefs;
};

export function defaultNotificationPrefs(): NotificationPrefs {
  return { osEnabled: true };
}

export function emptyNotificationSnapshot(): NotificationSnapshot {
  return { items: [], prefs: defaultNotificationPrefs() };
}

export function notificationDedupKey(input: {
  albumId: string;
  trackId: string;
  markerId: string;
}): string {
  return `${input.albumId}:${input.trackId}:${input.markerId}`;
}

export function isNotificationUnread(item: AppNotification): boolean {
  return item.readAt == null;
}
