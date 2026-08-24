import type { Album, Folder, Playlist, SmartPlaylist } from '../../domain/library';
import { mergeMarkers } from '../mergeNotes';
import type { Marker, Track } from '../../domain/models';
import type { LibrarySnapshot } from '../../files/libraryPersist';

function trackKey(track: Track): string {
  return (track.sourceFileName || track.title).trim().toLowerCase();
}

function remapTrackId(id: string, idRemap: Map<string, string>): string {
  return idRemap.get(id) ?? id;
}

function mergeTracks(local: Track[], remote: Track[]): { tracks: Track[]; idRemap: Map<string, string> } {
  const idRemap = new Map<string, string>();
  const byId = new Map(local.map((track) => [track.id, track]));
  const byKey = new Map(local.map((track) => [trackKey(track), track]));
  for (const incoming of remote) {
    const existing = byId.get(incoming.id) ?? byKey.get(trackKey(incoming));
    if (!existing) {
      byId.set(incoming.id, {
        ...incoming,
        fileUri: undefined,
        inboxUri: undefined,
        downloaded: false,
        downloadedAt: undefined,
      });
      continue;
    }
    if (incoming.id !== existing.id) {
      idRemap.set(incoming.id, existing.id);
    }
    byId.set(existing.id, {
      ...existing,
      title: existing.title || incoming.title,
      artist: existing.artist || incoming.artist,
      durationMs: existing.durationMs || incoming.durationMs,
      startMs: existing.startMs ?? incoming.startMs,
      endMs: existing.endMs ?? incoming.endMs,
      exerciseOpenId: existing.exerciseOpenId ?? incoming.exerciseOpenId,
      exerciseCloseId: existing.exerciseCloseId ?? incoming.exerciseCloseId,
      practiceHoleId: existing.practiceHoleId ?? incoming.practiceHoleId,
      sourceFileName: existing.sourceFileName || incoming.sourceFileName,
      driveFileId: existing.driveFileId || incoming.driveFileId,
      artworkUri: existing.artworkUri || incoming.artworkUri,
    });
  }
  return { tracks: [...byId.values()], idRemap };
}

function mergeFolders(local: Folder[], remote: Folder[], idRemap: Map<string, string>): Folder[] {
  const byId = new Map(local.map((folder) => [folder.id, folder]));
  for (const incoming of remote) {
    const existing = byId.get(incoming.id);
    if (!existing) {
      byId.set(incoming.id, {
        ...incoming,
        trackIds: incoming.trackIds.map((id) => remapTrackId(id, idRemap)),
      });
      continue;
    }
    const trackIds = [...existing.trackIds];
    for (const id of incoming.trackIds) {
      const remapped = remapTrackId(id, idRemap);
      if (!trackIds.includes(remapped)) {
        trackIds.push(remapped);
      }
    }
    byId.set(existing.id, { ...existing, name: existing.name || incoming.name, trackIds });
  }
  return [...byId.values()];
}

function mergeAlbums(local: Album[], remote: Album[], idRemap: Map<string, string>): Album[] {
  const byId = new Map(local.map((album) => [album.id, album]));
  for (const incoming of remote) {
    const existing = byId.get(incoming.id);
    if (!existing) {
      byId.set(incoming.id, {
        ...incoming,
        trackIds: incoming.trackIds.map((id) => remapTrackId(id, idRemap)),
      });
      continue;
    }
    const trackIds = [...existing.trackIds];
    for (const id of incoming.trackIds) {
      const remapped = remapTrackId(id, idRemap);
      if (!trackIds.includes(remapped)) {
        trackIds.push(remapped);
      }
    }
    byId.set(existing.id, {
      ...existing,
      trackIds,
      notes: existing.notes || incoming.notes,
      artworkUri: existing.artworkUri || incoming.artworkUri,
      driveFolderId: existing.driveFolderId || incoming.driveFolderId,
      driveFolderName: existing.driveFolderName || incoming.driveFolderName,
    });
  }
  return [...byId.values()];
}

function mergePlaylists(local: Playlist[], remote: Playlist[], idRemap: Map<string, string>): Playlist[] {
  const byId = new Map(local.map((playlist) => [playlist.id, playlist]));
  for (const incoming of remote) {
    const existing = byId.get(incoming.id);
    if (!existing) {
      byId.set(incoming.id, {
        ...incoming,
        trackIds: incoming.trackIds.map((id) => remapTrackId(id, idRemap)),
      });
      continue;
    }
    const trackIds = [...existing.trackIds];
    for (const id of incoming.trackIds) {
      const remapped = remapTrackId(id, idRemap);
      if (!trackIds.includes(remapped)) {
        trackIds.push(remapped);
      }
    }
    byId.set(existing.id, { ...existing, name: existing.name || incoming.name, trackIds });
  }
  return [...byId.values()];
}

function mergeSmart(local: SmartPlaylist[], remote: SmartPlaylist[]): SmartPlaylist[] {
  const byId = new Map(local.map((item) => [item.id, item]));
  for (const incoming of remote) {
    if (!byId.has(incoming.id)) {
      byId.set(incoming.id, incoming);
    }
  }
  return [...byId.values()];
}

function mergeAllMarkers(
  local: Record<string, Marker[]>,
  remote: Record<string, Marker[]>,
  idRemap: Map<string, string>,
): Record<string, Marker[]> {
  const remappedRemote: Record<string, Marker[]> = {};
  for (const [id, markers] of Object.entries(remote)) {
    const localId = remapTrackId(id, idRemap);
    remappedRemote[localId] = [...(remappedRemote[localId] ?? []), ...markers];
  }
  const ids = new Set([...Object.keys(local), ...Object.keys(remappedRemote)]);
  const out: Record<string, Marker[]> = {};
  for (const id of ids) {
    out[id] = mergeMarkers(local[id] ?? [], remappedRemote[id] ?? []);
  }
  return out;
}

export function mergeLibrarySnapshots(local: LibrarySnapshot, remote: LibrarySnapshot): LibrarySnapshot {
  const { tracks, idRemap } = mergeTracks(local.tracks, remote.tracks);
  return {
    version: Math.max(local.version, remote.version),
    ownerKey: local.ownerKey,
    tracks: mergeTracks(local.tracks, remote.tracks),
    folders: mergeFolders(local.folders, remote.folders),
    albums: mergeAlbums(local.albums, remote.albums),
    playlists: mergePlaylists(local.playlists, remote.playlists),
    smartPlaylists: mergeSmart(local.smartPlaylists, remote.smartPlaylists),
    markersByTrackId: mergeAllMarkers(local.markersByTrackId, remote.markersByTrackId, idRemap),
    keptAudioNames: [...new Set([...(local.keptAudioNames ?? []), ...(remote.keptAudioNames ?? [])])],
  };
}
