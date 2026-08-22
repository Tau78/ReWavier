import { File } from 'expo-file-system';
import * as LegacyFS from 'expo-file-system/legacy';

import {
  isSeparatorId,
  SEEDED_SMART_IDS,
  type Album,
  type Folder,
  type Playlist,
  type SmartPlaylist,
} from '../domain/library';
import type { Marker, Track } from '../domain/models';
import { fileExists, reconcileTrack } from './downloads';
import { persistLibraryUri } from './libraryUris';
import { libraryDirectory } from './libraryPaths';

function persistAndKeep(uri?: string): string | undefined {
  const stored = persistLibraryUri(uri);
  return stored && fileExists(stored) ? stored : undefined;
}

export const LIBRARY_SNAPSHOT_VERSION = 2;
const SNAPSHOT_NAME = 'library.json';

export type LibrarySnapshot = {
  version: number;
  tracks: Track[];
  folders: Folder[];
  albums: Album[];
  playlists: Playlist[];
  smartPlaylists: SmartPlaylist[];
  markersByTrackId: Record<string, Marker[]>;
};

function snapshotFile(): File {
  return new File(libraryDirectory(), SNAPSHOT_NAME);
}

export function sanitizeSnapshot(snapshot: LibrarySnapshot): LibrarySnapshot {
  const tracks = snapshot.tracks.map(reconcileTrack);
  const keep = new Set(tracks.map((track) => track.id));
  const pruneIds = (ids: string[]) => ids.filter((id) => keep.has(id));

  return {
    version: LIBRARY_SNAPSHOT_VERSION,
    tracks,
    folders: snapshot.folders.map((folder) => ({
      ...folder,
      trackIds: pruneIds(folder.trackIds),
    })),
    albums: snapshot.albums.map((album) => {
      const names = new Map((album.separators ?? []).map((item) => [item.id, item.name]));
      const trackIds = album.trackIds.filter((id) => keep.has(id) || names.has(id) || isSeparatorId(id));
      const separators = trackIds
        .filter((id) => names.has(id) || isSeparatorId(id))
        .map((id) => ({ id, name: names.get(id)?.trim() || 'Separatore' }));
      return {
        ...album,
        trackIds,
        separators: separators.length > 0 ? separators : undefined,
        artworkUri: persistAndKeep(album.artworkUri),
        notes: album.notes?.trim() ? album.notes : undefined,
      };
    }),
    playlists: snapshot.playlists.map((playlist) => ({
      ...playlist,
      trackIds: pruneIds(playlist.trackIds),
    })),
    smartPlaylists: snapshot.smartPlaylists.filter((item) => !SEEDED_SMART_IDS.has(item.id)),
    markersByTrackId: Object.fromEntries(
      Object.entries(snapshot.markersByTrackId).filter(([id]) => keep.has(id)),
    ),
  };
}

export async function loadLibrarySnapshot(): Promise<LibrarySnapshot | null> {
  const file = snapshotFile();
  if (!file.exists) {
    return null;
  }
  try {
    const parsed = JSON.parse(await LegacyFS.readAsStringAsync(file.uri)) as LibrarySnapshot;
    if (!Array.isArray(parsed.tracks)) {
      return null;
    }
    if (parsed.version !== 1 && parsed.version !== LIBRARY_SNAPSHOT_VERSION) {
      return null;
    }
    return sanitizeSnapshot(parsed);
  } catch {
    return null;
  }
}

export async function saveLibrarySnapshot(snapshot: LibrarySnapshot): Promise<void> {
  const file = snapshotFile();
  await LegacyFS.writeAsStringAsync(
    file.uri,
    JSON.stringify({ ...snapshot, version: LIBRARY_SNAPSHOT_VERSION }),
  );
}
