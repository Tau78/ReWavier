import { albumContainsTrackId } from './albumVersions';
import type { Album, CollectionKind, Folder, Playlist } from './library';

export type ResumePoint = {
  trackId: string;
  positionMs: number;
  updatedAt: number;
};

export type TrackResume = {
  positionMs: number;
  updatedAt: number;
};

export type PlaybackSnapshot = {
  collections: Record<string, ResumePoint>;
  tracks: Record<string, TrackResume>;
};

export function emptyPlaybackSnapshot(): PlaybackSnapshot {
  return { collections: {}, tracks: {} };
}

export function collectionResumeKey(kind: CollectionKind, id: string): string {
  return `${kind}:${id}`;
}

/** Near the start or the end → next play starts from the beginning. */
export function resumePositionMs(positionMs: number, durationMs: number): number | undefined {
  if (!Number.isFinite(positionMs) || positionMs < 1500) {
    return undefined;
  }
  if (durationMs > 0 && positionMs >= durationMs - 2500) {
    return undefined;
  }
  return Math.max(0, Math.round(positionMs));
}

export function pickResumeTrackId(
  saved: ResumePoint | undefined,
  playableIds: string[],
): string | undefined {
  if (saved && playableIds.includes(saved.trackId)) {
    return saved.trackId;
  }
  return undefined;
}

export function collectionKeysForTrackId(
  trackId: string,
  albums: Album[],
  playlists: Playlist[],
  folders: Folder[],
): string[] {
  const keys: string[] = [];
  for (const album of albums) {
    if (albumContainsTrackId(album, trackId)) {
      keys.push(collectionResumeKey('album', album.id));
    }
  }
  for (const playlist of playlists) {
    if (playlist.trackIds.includes(trackId)) {
      keys.push(collectionResumeKey('playlist', playlist.id));
    }
  }
  for (const folder of folders) {
    if (folder.trackIds.includes(trackId)) {
      keys.push(collectionResumeKey('folder', folder.id));
    }
  }
  return keys;
}
