import { create } from 'zustand';

import { albumMentionCandidates, selfMentionHandles } from '../domain/albumPeople';
import { albumContainsTrackId, playableAlbumTrackIds } from '../domain/albumVersions';
import { handleMatchesPerson } from '../domain/mentions';
import { isOwnMarker, markerAuthorLabel, markerPreviewText } from '../domain/markers';
import { extractMentionHandles } from '../domain/mentions';
import type { Marker } from '../domain/models';
import {
  defaultNotificationPrefs,
  isNotificationUnread,
  notificationDedupKey,
  type AppNotification,
  type NotificationPrefs,
} from '../domain/notifications';
import type { SessionUser } from '../domain/session';
import {
  flushNotificationPersist,
  hydrateNotificationPersist,
  readNotificationSnapshot,
  resetNotificationPersist,
  writeNotificationSnapshot,
} from '../files/notificationPersist';
import type { MentionNotificationPayload } from '../notifications/mentionPayload';
import {
  presentMentionOsNotification,
  registerExpoPushToken,
  sendExpoPushMention,
} from '../notifications/pushNotifications';
import { useLibraryStore } from './libraryStore';
import { useSessionStore } from './sessionStore';

type NotificationState = {
  items: AppNotification[];
  prefs: NotificationPrefs;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  reset: () => void;
  setOsEnabled: (enabled: boolean) => void;
  refreshPushToken: () => Promise<string | null>;
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

function persist(state: Pick<NotificationState, 'items' | 'prefs'>) {
  writeNotificationSnapshot({ items: state.items, prefs: state.prefs });
}

function shouldNotifyOs(existing: AppNotification | undefined, next: AppNotification): boolean {
  if (next.readAt != null) {
    return false;
  }
  if (!existing) {
    return true;
  }
  if (existing.snippet !== next.snippet) {
    return true;
  }
  return existing.osNotifiedAt == null;
}

async function maybePresentOs(item: AppNotification, albumName?: string): Promise<void> {
  const prefs = useNotificationStore.getState().prefs;
  if (!prefs.osEnabled) {
    return;
  }
  await presentMentionOsNotification(item, albumName);
  const now = Date.now();
  const items = useNotificationStore.getState().items.map((row) =>
    row.id === item.id ? { ...row, osNotifiedAt: now } : row,
  );
  persist({ items, prefs });
  useNotificationStore.setState({ items });
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  items: [],
  prefs: defaultNotificationPrefs(),
  hydrated: false,

  async hydrate() {
    const snap = await hydrateNotificationPersist();
    set({ items: snap.items, prefs: snap.prefs, hydrated: true });
  },

  reset() {
    resetNotificationPersist();
    set({ items: [], prefs: defaultNotificationPrefs(), hydrated: false });
  },

  setOsEnabled(enabled) {
    const prefs = { ...get().prefs, osEnabled: enabled };
    persist({ items: get().items, prefs });
    set({ prefs });
    if (enabled) {
      void get().refreshPushToken();
    }
  },

  async refreshPushToken() {
    const token = await registerExpoPushToken();
    if (!token) {
      return null;
    }
    const prefs = { ...get().prefs, expoPushToken: token };
    persist({ items: get().items, prefs });
    set({ prefs });
    const user = useSessionStore.getState().user;
    if (user?.id) {
      useLibraryStore.getState().setMemberPushTokenForUser(user.id, token);
    }
    return token;
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
      osNotifiedAt: existing?.osNotifiedAt,
    };
    if (existing && existing.snippet !== nextItem.snippet) {
      nextItem.readAt = undefined;
      nextItem.createdAt = Date.now();
      nextItem.osNotifiedAt = undefined;
    }
    const items = [nextItem, ...get().items.filter((item) => item.id !== id)];
    persist({ items, prefs: get().prefs });
    set({ items });
    if (shouldNotifyOs(existing, nextItem)) {
      const album = useLibraryStore.getState().albums.find((row) => row.id === albumId);
      void maybePresentOs(nextItem, album?.name);
    }
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
    persist({ items, prefs: get().prefs });
    set({ items });
  },

  markAllReadForAlbum(albumId) {
    const now = Date.now();
    const items = get().items.map((item) =>
      item.albumId === albumId && item.readAt == null ? { ...item, readAt: now } : item,
    );
    persist({ items, prefs: get().prefs });
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

export function notificationItemsSnapshot(): AppNotification[] {
  return readNotificationSnapshot().items;
}

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
  void notifyMentionTargetsOnSave(album.id, trackId, markers, user);
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

/** When I save a note with @, ping other members if their push token is on Drive. */
export async function notifyMentionTargetsOnSave(
  albumId: string,
  trackId: string,
  markers: Marker[],
  user: SessionUser,
): Promise<void> {
  const album = useLibraryStore.getState().albums.find((item) => item.id === albumId);
  if (!album) {
    return;
  }
  const library = useLibraryStore.getState();
  const candidates = albumMentionCandidates(album, library.markersByTrackId, user);
  const tokens = album.memberPushTokens ?? {};
  for (const marker of markers) {
    if (!isOwnMarker(marker, user)) {
      continue;
    }
    const handles = extractMentionHandles(marker.text);
    if (handles.length === 0) {
      continue;
    }
    const payload: MentionNotificationPayload = {
      kind: 'mention',
      albumId,
      trackId,
      markerId: marker.id,
      timestampMs: marker.timestampMs,
    };
    const snippet = markerPreviewText(marker.text);
    for (const handle of handles) {
      const person = candidates.find((row) => handleMatchesPerson(handle, row));
      if (!person || person.key === user.id) {
        continue;
      }
      const pushToken = tokens[person.key]?.trim();
      if (!pushToken) {
        continue;
      }
      void sendExpoPushMention({
        to: pushToken,
        fromAuthorName: user.displayName?.trim() || 'Qualcuno',
        albumName: album.name,
        snippet,
        payload,
      });
    }
  }
}
