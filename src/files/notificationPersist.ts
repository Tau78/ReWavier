import * as LegacyFS from 'expo-file-system/legacy';

import {
  emptyNotificationSnapshot,
  type AppNotification,
  type NotificationSnapshot,
} from '../domain/notifications';
import { ensureDirAsync, pathExistsAsync, withTimeout } from './fsSafe';
import { getActiveLibraryOwner } from './libraryOwner';
import { userLibraryDirectory } from './libraryPaths';

const FILE_NAME = 'notifications.json';

let cache: NotificationSnapshot = emptyNotificationSnapshot();
let loaded = false;
let loadedOwner: string | null | undefined;
let saveChain: Promise<void> = Promise.resolve();
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function fileUri(): string {
  return `${userLibraryDirectory().uri}/${FILE_NAME}`;
}

function asItem(value: unknown): AppNotification | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== 'string' ||
    typeof row.albumId !== 'string' ||
    typeof row.trackId !== 'string' ||
    typeof row.markerId !== 'string'
  ) {
    return undefined;
  }
  const timestampMs = Number(row.timestampMs);
  const createdAt = Number(row.createdAt);
  if (!Number.isFinite(timestampMs) || !Number.isFinite(createdAt)) {
    return undefined;
  }
  const readAtRaw = row.readAt == null ? undefined : Number(row.readAt);
  return {
    id: row.id,
    albumId: row.albumId,
    trackId: row.trackId,
    markerId: row.markerId,
    timestampMs: Math.round(timestampMs),
    fromAuthorName: typeof row.fromAuthorName === 'string' ? row.fromAuthorName : 'Qualcuno',
    fromAuthorId: typeof row.fromAuthorId === 'string' ? row.fromAuthorId : undefined,
    snippet: typeof row.snippet === 'string' ? row.snippet : '',
    createdAt: Math.round(createdAt),
    readAt: readAtRaw != null && Number.isFinite(readAtRaw) ? Math.round(readAtRaw) : undefined,
  };
}

function sanitizeSnapshot(raw: unknown): NotificationSnapshot {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return emptyNotificationSnapshot();
  }
  const parsed = raw as Record<string, unknown>;
  const items: AppNotification[] = [];
  if (Array.isArray(parsed.items)) {
    for (const value of parsed.items) {
      const item = asItem(value);
      if (item) {
        items.push(item);
      }
    }
  }
  items.sort((a, b) => b.createdAt - a.createdAt);
  return { items: items.slice(0, 200) };
}

export function resetNotificationPersist(): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  cache = emptyNotificationSnapshot();
  loaded = false;
  loadedOwner = undefined;
}

export async function hydrateNotificationPersist(): Promise<NotificationSnapshot> {
  const owner = getActiveLibraryOwner();
  if (loaded && loadedOwner === owner) {
    return cache;
  }
  loadedOwner = owner;
  const uri = fileUri();
  const exists = await withTimeout(pathExistsAsync(uri), 2000, false);
  if (!exists) {
    cache = emptyNotificationSnapshot();
    loaded = true;
    return cache;
  }
  try {
    const raw = await withTimeout(LegacyFS.readAsStringAsync(uri), 3000, '');
    cache = raw ? sanitizeSnapshot(JSON.parse(raw) as unknown) : emptyNotificationSnapshot();
  } catch {
    cache = emptyNotificationSnapshot();
  }
  loaded = true;
  return cache;
}

function scheduleSave(): void {
  if (saveTimer) {
    return;
  }
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void flushNotificationPersist();
  }, 500);
}

export async function flushNotificationPersist(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (!loaded) {
    return;
  }
  const snapshot = cache;
  saveChain = saveChain.then(async () => {
    await ensureDirAsync(userLibraryDirectory().uri);
    await LegacyFS.writeAsStringAsync(fileUri(), JSON.stringify(snapshot));
  });
  try {
    await saveChain;
  } catch {
    // next write retries
  }
}

export function readNotificationSnapshot(): NotificationSnapshot {
  return cache;
}

export function writeNotificationSnapshot(next: NotificationSnapshot): void {
  cache = {
    items: [...next.items].sort((a, b) => b.createdAt - a.createdAt).slice(0, 200),
  };
  loaded = true;
  scheduleSave();
}
