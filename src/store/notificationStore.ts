import { create } from 'zustand';

import { albumContainsTrackId, playableAlbumTrackIds } from '../domain/albumVersions';
import { selfMentionHandles } from '../domain/albumPeople';
import { isOwnMarker, markerAuthorLabel, markerPreviewText } from '../domain/markers';
import { extractMentionHandles } from '../domain/mentions';
import type { Marker } from '../domain/models';
import {
  isNotificationUnread,
  notificationDedupKey,
  type AppNotification,
} from '../domain/notifications';
import type { SessionUser } from '../domain/session';
import {
  flushNotificationPersist,
  hydrateNotificationPersist,
  readNotificationSnapshot,
  resetNotificationPersist,
  writeNotificationSnapshot,
} from '../files/notificationPersist';
import { useLibraryStore } from './libraryStore';
import { useSessionStore } from './sessionStore';

type NotificationState = {
  items: AppNotification[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  reset: () => void;
  /** Create/update a local notification when someone else mentions me. */
  ingestMarkerMention: (input: {
    albumId: string;
    trackId: string;
    marker: Marker;
    user: SessionUser | null;
  }) => void;
  ingestTrackMarkers: (input: {
    albumId: string;
    trackId: string;
    markers: Marker[];
    user: SessionUser | null;
  }) => void;
  markRead: (id: string) => void;
  markAllReadForAlbum: (albumId: string) => void;
  unreadCountForAlbum: (albumId: string) => number;
  itemsForAlbum: (albumId: string) => AppNotification[];
};

function persist(items: AppNotification[]) {
  writeNotificationSnapshot({ items });
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  items: [],
  hydrated: false,

  async hydrate() {
    const snap = await hydrateNotificationPersist();
    set({ items: snap.items, hydrated: true });
  },

  reset() {
    resetNotificationPersist();
    set({ items: [], hydrated: false });
  },

  ingestMarkerMention({ albumId, trackId, marker, user }) {
    if (!user || !albumId || !trackId || !marker.id) {
      return;
    }
    if (isOwnMarker(marker, user)) {
      return;
    }
    const handles = extractMentionHandles(marker.text);
    if (handles.length === 0) {
      return;
    }
    const mine = selfMentionHandles(user);
    if (!handles.some((handle) => mine.includes(handle))) {
      // Also accept prefix match: @mau → mauro
      const hit = handles.some((handle) =>
        mine.some((self) => self === handle || self.startsWith(handle) || handle.startsWith(self)),
      );
      if (!hit) {
        return;
      }
    }
    const id = notificationDedupKey({ albumId, trackId, markerId: marker.id });
    const existing = get().items.find((item) => item.id === id);
    const nextItem: AppNotification = {
      id,
      albumId,
      trackId,
      markerId: marker.id,
      timestampMs: marker.timestampMs,
      fromAuthorName: markerAuthorLabel(marker),
      fromAuthorId: marker.authorId,
      snippet: markerPreviewText(marker.text),
      createdAt: existing?.createdAt ?? marker.updatedAt ?? marker.createdAt ?? Date.now(),
      readAt: existing?.readAt,
    };
    // Fresh mention text after an edit → treat as unread again.
    if (existing && existing.snippet !== nextItem.snippet) {
      nextItem.readAt = undefined;
      nextItem.createdAt = Date.now();
    }
    const items = [nextItem, ...get().items.filter((item) => item.id !== id)];
    persist(items);
    set({ items });
  },

  ingestTrackMarkers({ albumId, trackId, markers, user }) {
    for (const marker of markers) {
      get().ingestMarkerMention({ albumId, trackId, marker, user });
    }
  },

  markRead(id) {
    const now = Date.now();
    const items = get().items.map((item) =>
      item.id === id && item.readAt == null ? { ...item, readAt: now } : item,
    );
    persist(items);
    set({ items });
  },

  markAllReadForAlbum(albumId) {
    const now = Date.now();
    const items = get().items.map((item) =>
      item.albumId === albumId && item.readAt == null ? { ...item, readAt: now } : item,
    );
    persist(items);
    set({ items });
  },

  unreadCountForAlbum(albumId) {
    return get().items.filter((item) => item.albumId === albumId && isNotificationUnread(item)).length;
  },

  itemsForAlbum(albumId) {
    return get().items.filter((item) => item.albumId === albumId);
  },
}));

export async function flushNotifications(): Promise<void> {
  await flushNotificationPersist();
}

/** Safe read after hydrate for non-React callers. */
export function notificationItemsSnapshot(): AppNotification[] {
  return readNotificationSnapshot().items;
}

/** After markers land on a track (save or Drive merge), create local @ notifications for me. */
export function ingestMentionsForSavedTrack(trackId: string, markers: Marker[]): void {
  const user = useSessionStore.getState().user;
  if (!user || !trackId) {
    return;
  }
  const album = useLibraryStore
    .getState()
    .albums.find((item) => albumContainsTrackId(item, trackId));
  if (!album) {
    return;
  }
  useNotificationStore.getState().ingestTrackMarkers({
    albumId: album.id,
    trackId,
    markers,
    user,
  });
}

export function ingestMentionsForAlbum(albumId: string): void {
  const user = useSessionStore.getState().user;
  const library = useLibraryStore.getState();
  const album = library.albums.find((item) => item.id === albumId);
  if (!user || !album) {
    return;
  }
  for (const trackId of playableAlbumTrackIds(album)) {
    useNotificationStore.getState().ingestTrackMarkers({
      albumId,
      trackId,
      markers: library.markersByTrackId[trackId] ?? [],
      user,
    });
  }
}
