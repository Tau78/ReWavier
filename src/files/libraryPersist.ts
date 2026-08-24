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
import { getActiveLibraryOwner, snapshotBelongsToOwner } from './libraryOwner';
import { libraryDirectory, userLibraryDirectory } from './libraryPaths';
import { ensureDirAsync, pathExistsAsync, withTimeout } from './fsSafe';

function persistAndKeep(uri?: string): string | undefined {
  const stored = persistLibraryUri(uri);
  return stored && fileExists(stored) ? stored : undefined;
}

export const LIBRARY_SNAPSHOT_VERSION = 2;
const SNAPSHOT_NAME = 'library.json';

export type LibrarySnapshot = {
  version: number;
  ownerKey?: string;
  tracks: Track[];
  folders: Folder[];
  albums: Album[];
  playlists: Playlist[];
  smartPlaylists: SmartPlaylist[];
  markersByTrackId: Record<string, Marker[]>;
  keptAudioNames?: string[];
};

export function emptyLibrarySnapshot(): LibrarySnapshot {
  return {
    version: LIBRARY_SNAPSHOT_VERSION,
    ownerKey: getActiveLibraryOwner() ?? undefined,
    tracks: [],
    folders: [],
    albums: [],
    playlists: [],
    smartPlaylists: [],
    markersByTrackId: {},
  };
}

function snapshotFileUri(): string {
  return `${userLibraryDirectory().uri}/${SNAPSHOT_NAME}`;
}

function legacySnapshotFileUri(): string {
  return `${libraryDirectory().uri}/${SNAPSHOT_NAME}`;
}

const LEGACY_OWNER_NAME = 'legacy-library-owner.json';

export async function adoptLegacyLibraryIfNeeded(userId: string): Promise<void> {
  const destUri = snapshotFileUri();
  if (await pathExistsAsync(destUri)) {
    return;
  }
  const legacyUri = legacySnapshotFileUri();
  if (!(await pathExistsAsync(legacyUri))) {
    return;
  }
  const markerUri = `${libraryDirectory().uri}/${LEGACY_OWNER_NAME}`;
  if (await pathExistsAsync(markerUri)) {
    return;
  }
  await ensureDirAsync(userLibraryDirectory().uri);
  try {
    await LegacyFS.copyAsync({ from: legacyUri, to: destUri });
    await LegacyFS.writeAsStringAsync(
      markerUri,
      JSON.stringify({ owner: getActiveLibraryOwner() ?? userId, at: Date.now() }),
    );
  } catch {
    // leave legacy in place; next launch can retry
  }
}

export function sanitizeSnapshot(snapshot: LibrarySnapshot): LibrarySnapshot {
  const tracks = snapshot.tracks.map(reconcileTrack);
  const keep = new Set(tracks.map((track) => track.id));
  const pruneIds = (ids: string[]) => ids.filter((id) => keep.has(id));

  return {
    version: LIBRARY_SNAPSHOT_VERSION,
    ownerKey: snapshot.ownerKey ?? getActiveLibraryOwner() ?? undefined,
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
    keptAudioNames: (snapshot.keptAudioNames ?? []).filter((name) => name.trim().length > 0),
  };
}

function parseLibrarySnapshot(parsed: LibrarySnapshot): LibrarySnapshot | null {
  if (!Array.isArray(parsed.tracks)) {
    return null;
  }
  if (parsed.version !== 1 && parsed.version !== LIBRARY_SNAPSHOT_VERSION) {
    return null;
  }
  return {
    version: LIBRARY_SNAPSHOT_VERSION,
    ownerKey: parsed.ownerKey,
    tracks: parsed.tracks,
    folders: Array.isArray(parsed.folders) ? parsed.folders : [],
    albums: Array.isArray(parsed.albums) ? parsed.albums : [],
    playlists: Array.isArray(parsed.playlists) ? parsed.playlists : [],
    smartPlaylists: Array.isArray(parsed.smartPlaylists) ? parsed.smartPlaylists : [],
    markersByTrackId:
      parsed.markersByTrackId && typeof parsed.markersByTrackId === 'object'
        ? parsed.markersByTrackId
        : {},
    keptAudioNames: Array.isArray(parsed.keptAudioNames)
      ? parsed.keptAudioNames.filter((name): name is string => typeof name === 'string' && name.trim().length > 0)
      : [],
  };
}

export async function loadLibrarySnapshot(opts?: {
  requireOwnerKey?: boolean;
}): Promise<LibrarySnapshot | null> {
  const uri = snapshotFileUri();
  const exists = await withTimeout(pathExistsAsync(uri), 2000, false);
  if (!exists) {
    return null;
  }
  try {
    const raw = await withTimeout(
      LegacyFS.readAsStringAsync(uri),
      3000,
      '',
    );
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as LibrarySnapshot;
    const snapshot = parseLibrarySnapshot(parsed);
    if (!snapshot) {
      return null;
    }
    const sanitized = sanitizeSnapshot(snapshot);
    if (
      !snapshotBelongsToOwner(
        sanitized.ownerKey,
        getActiveLibraryOwner(),
        opts?.requireOwnerKey === true,
      )
    ) {
      const empty = emptyLibrarySnapshot();
      await saveLibrarySnapshot(empty);
      return empty;
    }
    return sanitized;
  } catch {
    return null;
  }
}

export async function saveLibrarySnapshot(snapshot: LibrarySnapshot): Promise<void> {
  await ensureDirAsync(userLibraryDirectory().uri);
  await LegacyFS.writeAsStringAsync(
    snapshotFileUri(),
    JSON.stringify({
      ...snapshot,
      version: LIBRARY_SNAPSHOT_VERSION,
      ownerKey: getActiveLibraryOwner() ?? snapshot.ownerKey,
    }),
  );
}
