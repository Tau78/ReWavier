import * as LegacyFS from 'expo-file-system/legacy';

import {
  emptyPlaybackSnapshot,
  resumePositionMs,
  type PlaybackSnapshot,
  type ResumePoint,
  type TrackResume,
} from '../domain/playbackResume';
import { ensureDirAsync, pathExistsAsync, withTimeout } from './fsSafe';
import { getActiveLibraryOwner } from './libraryOwner';
import { userLibraryDirectory } from './libraryPaths';

const FILE_NAME = 'playback.json';

let cache: PlaybackSnapshot = emptyPlaybackSnapshot();
let loaded = false;
let loadedOwner: string | null | undefined;
let saveChain: Promise<void> = Promise.resolve();
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function fileUri(): string {
  return `${userLibraryDirectory().uri}/${FILE_NAME}`;
}

function asPoint(value: unknown): ResumePoint | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const row = value as Record<string, unknown>;
  if (typeof row.trackId !== 'string' || !row.trackId) {
    return undefined;
  }
  const positionMs = Number(row.positionMs);
  if (!Number.isFinite(positionMs) || positionMs < 0) {
    return undefined;
  }
  const updatedAt = Number(row.updatedAt);
  return {
    trackId: row.trackId,
    positionMs: Math.round(positionMs),
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0,
  };
}

function asTrackResume(value: unknown): TrackResume | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const row = value as Record<string, unknown>;
  const positionMs = Number(row.positionMs);
  if (!Number.isFinite(positionMs) || positionMs < 0) {
    return undefined;
  }
  const updatedAt = Number(row.updatedAt);
  return {
    positionMs: Math.round(positionMs),
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0,
  };
}

function sanitizeSnapshot(raw: unknown): PlaybackSnapshot {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return emptyPlaybackSnapshot();
  }
  const parsed = raw as Record<string, unknown>;
  const collections: Record<string, ResumePoint> = {};
  const tracks: Record<string, TrackResume> = {};
  if (parsed.collections && typeof parsed.collections === 'object' && !Array.isArray(parsed.collections)) {
    for (const [key, value] of Object.entries(parsed.collections as Record<string, unknown>)) {
      const point = asPoint(value);
      if (point) {
        collections[key] = point;
      }
    }
  }
  if (parsed.tracks && typeof parsed.tracks === 'object' && !Array.isArray(parsed.tracks)) {
    for (const [key, value] of Object.entries(parsed.tracks as Record<string, unknown>)) {
      const point = asTrackResume(value);
      if (point) {
        tracks[key] = point;
      }
    }
  }
  return { collections, tracks };
}

export function resetPlaybackPersist(): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  cache = emptyPlaybackSnapshot();
  loaded = false;
  loadedOwner = undefined;
}

export async function hydratePlaybackPersist(): Promise<void> {
  const owner = getActiveLibraryOwner();
  if (loaded && loadedOwner === owner) {
    return;
  }
  loadedOwner = owner;
  const uri = fileUri();
  const exists = await withTimeout(pathExistsAsync(uri), 2000, false);
  if (!exists) {
    cache = emptyPlaybackSnapshot();
    loaded = true;
    return;
  }
  try {
    const raw = await withTimeout(LegacyFS.readAsStringAsync(uri), 3000, '');
    cache = raw ? sanitizeSnapshot(JSON.parse(raw) as unknown) : emptyPlaybackSnapshot();
  } catch {
    cache = emptyPlaybackSnapshot();
  }
  loaded = true;
}

function scheduleSave(): void {
  if (saveTimer) {
    return;
  }
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void flushPlaybackPersist();
  }, 800);
}

export async function flushPlaybackPersist(): Promise<void> {
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

export function getCollectionResume(key: string): ResumePoint | undefined {
  return cache.collections[key];
}

export function getTrackResume(trackId: string): TrackResume | undefined {
  return cache.tracks[trackId];
}

export function startAtMsForTrack(trackId: string, durationMs: number): number | undefined {
  const saved = getTrackResume(trackId);
  if (!saved) {
    return undefined;
  }
  return resumePositionMs(saved.positionMs, durationMs);
}

export function startAtMsForCollection(
  key: string,
  trackId: string,
  durationMs: number,
): number | undefined {
  const collection = getCollectionResume(key);
  if (collection?.trackId === trackId) {
    const fromCollection = resumePositionMs(collection.positionMs, durationMs);
    if (fromCollection != null) {
      return fromCollection;
    }
  }
  return startAtMsForTrack(trackId, durationMs);
}

export function rememberPlayback(
  trackId: string,
  positionMs: number,
  collectionKeys: string[],
): void {
  if (!trackId) {
    return;
  }
  const now = Date.now();
  const rounded = Math.max(0, Math.round(positionMs));
  cache = {
    collections: { ...cache.collections },
    tracks: { ...cache.tracks },
  };
  cache.tracks[trackId] = { positionMs: rounded, updatedAt: now };
  for (const key of collectionKeys) {
    if (!key) {
      continue;
    }
    cache.collections[key] = { trackId, positionMs: rounded, updatedAt: now };
  }
  scheduleSave();
}
