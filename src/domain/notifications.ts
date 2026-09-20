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
};

export type NotificationSnapshot = {
  items: AppNotification[];
};

export function emptyNotificationSnapshot(): NotificationSnapshot {
  return { items: [] };
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
