import type { Album, AlbumDocument, Folder, Playlist, SmartPlaylist } from '../../domain/library';
import { mergeMarkers } from '../mergeNotes';
import type { Marker, Track } from '../../domain/models';
import type { LibrarySnapshot } from '../../files/libraryPersist';

function trackKey(track: Track): string {
  return (track.sourceFileName || track.title).trim().toLowerCase();
}

function remapTrackId(id: string, idRemap: Map<string, string>): string {
  return idRemap.get(id) ?? id;
}

function finiteMs(value?: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

function longerDuration(localMs?: number, incomingMs?: number): number {
  return Math.max(finiteMs(localMs), finiteMs(incomingMs));
}

/** Suitcase paths belong to another phone — never treat them as files on this one. */
export function withoutPhoneFiles(track: Track): Track {
  return {
    ...track,
    fileUri: undefined,
    inboxUri: undefined,
    downloaded: false,
    downloadedAt: undefined,
  };
}

function mergeTracks(local: Track[], remote: Track[]): { tracks: Track[]; idRemap: Map<string, string> } {
  const idRemap = new Map<string, string>();
  const byId = new Map(local.map((track) => [track.id, track]));
  const byKey = new Map(local.map((track) => [trackKey(track), track]));
  for (const raw of remote) {
    const incoming = withoutPhoneFiles(raw);
    const existing = byId.get(incoming.id) ?? byKey.get(trackKey(incoming));
    if (!existing) {
      byId.set(incoming.id, incoming);
      continue;
    }
    if (incoming.id !== existing.id) {
      idRemap.set(incoming.id, existing.id);
    }
    byId.set(existing.id, {
      ...existing,
      title: existing.title || incoming.title,
      artist: existing.artist || incoming.artist,
      durationMs: longerDuration(existing.durationMs, incoming.durationMs),
      startMs: existing.startMs ?? incoming.startMs,
      endMs: existing.endMs ?? incoming.endMs,
      exerciseOpenId: existing.exerciseOpenId ?? incoming.exerciseOpenId,
      exerciseCloseId: existing.exerciseCloseId ?? incoming.exerciseCloseId,
      practiceHoleId: existing.practiceHoleId ?? incoming.practiceHoleId,
      sourceFileName: existing.sourceFileName || incoming.sourceFileName,
      driveFileId: existing.driveFileId || incoming.driveFileId,
      artworkUri: existing.artworkUri || incoming.artworkUri,
      fileUri: existing.fileUri,
      inboxUri: existing.inboxUri,
      downloaded: Boolean(existing.fileUri || existing.inboxUri || existing.downloaded),
      downloadedAt: existing.downloadedAt || incoming.downloadedAt,
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

function documentKey(document: AlbumDocument): string {
  return document.driveFileId || document.id;
}

function mergeDocuments(
  local?: AlbumDocument[],
  remote?: AlbumDocument[],
): AlbumDocument[] | undefined {
  const byKey = new Map<string, AlbumDocument>();
  for (const document of local ?? []) {
    byKey.set(documentKey(document), document);
  }
  for (const incoming of remote ?? []) {
    const key = documentKey(incoming);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, incoming);
      continue;
    }
    byKey.set(key, {
      ...incoming,
      id: existing.id,
      fileUri: existing.fileUri || incoming.fileUri,
    });
  }
  const list = [...byKey.values()];
  return list.length > 0 ? list : undefined;
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
      notesUpdatedAt: Math.max(existing.notesUpdatedAt ?? 0, incoming.notesUpdatedAt ?? 0) || undefined,
      artworkUri: existing.artworkUri || incoming.artworkUri,
      documents: mergeDocuments(existing.documents, incoming.documents),
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

/** Keep files and duration already on this phone when a suitcase overwrite arrives. */
export function keepLocalMedia(local: Track[], merged: Track[]): Track[] {
  const byId = new Map(local.map((track) => [track.id, track]));
  const byKey = new Map(local.map((track) => [trackKey(track), track]));
  return merged.map((track) => {
    const prev = byId.get(track.id) ?? byKey.get(trackKey(track));
    if (!prev) {
      return withoutPhoneFiles(track);
    }
    const fileUri = prev.fileUri || track.fileUri;
    const inboxUri = prev.inboxUri || track.inboxUri;
    return {
      ...track,
      fileUri,
      inboxUri,
      artworkUri: prev.artworkUri || track.artworkUri,
      downloaded: Boolean(fileUri || inboxUri || prev.downloaded),
      downloadedAt: prev.downloadedAt || track.downloadedAt,
      durationMs: longerDuration(prev.durationMs, track.durationMs),
    };
  });
}

export function mergeLibrarySnapshots(local: LibrarySnapshot, remote: LibrarySnapshot): LibrarySnapshot {
  const { tracks, idRemap } = mergeTracks(local.tracks, remote.tracks.map(withoutPhoneFiles));
  return {
    version: Math.max(local.version, remote.version),
    ownerKey: local.ownerKey,
    tracks,
    folders: mergeFolders(local.folders, remote.folders, idRemap),
    albums: mergeAlbums(local.albums, remote.albums, idRemap),
    playlists: mergePlaylists(local.playlists, remote.playlists, idRemap),
    smartPlaylists: mergeSmart(local.smartPlaylists, remote.smartPlaylists),
    markersByTrackId: mergeAllMarkers(local.markersByTrackId, remote.markersByTrackId, idRemap),
    keptAudioNames: [...new Set([...(local.keptAudioNames ?? []), ...(remote.keptAudioNames ?? [])])],
  };
}
