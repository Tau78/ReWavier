import type { Album, AlbumSeparator, AlbumVersionFolder } from './library';
import { createId, isSeparatorId, isVersionFolderId } from './library';
import { versionFolderById } from './albumVersions';
import { audioBasename } from './sidecar';
import type { Track } from './models';

export const ORDER_FILE_NAME = 'rewavier.order.json';

export type AlbumOrderLayoutItem =
  | { kind: 'file'; name: string }
  | { kind: 'separator'; name: string }
  | { kind: 'folder'; name: string; files: string[]; chosen?: string };

export type AlbumOrderFile = {
  version: 1 | 2;
  app: 'rewavier';
  type: 'order';
  updatedAt: number;
  files: string[];
  items?: AlbumOrderLayoutItem[];
};

export function isOrderManifestName(fileName: string): boolean {
  return fileName.trim().toLowerCase() === ORDER_FILE_NAME;
}

function trackOrderName(track: Track): string {
  return track.sourceFileName ?? `${track.title}.m4a`;
}

function nameKey(name: string): string {
  return audioBasename(name).trim().toLowerCase();
}

function isLayoutItem(value: unknown): value is AlbumOrderLayoutItem {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const item = value as Partial<AlbumOrderLayoutItem>;
  if (item.kind === 'file' || item.kind === 'separator') {
    return typeof item.name === 'string' && item.name.trim().length > 0;
  }
  if (item.kind === 'folder') {
    return (
      typeof item.name === 'string' &&
      Array.isArray(item.files) &&
      item.files.every((name) => typeof name === 'string')
    );
  }
  return false;
}

export function parseAlbumOrder(raw: string): AlbumOrderFile | null {
  try {
    const data = JSON.parse(raw) as Partial<AlbumOrderFile>;
    if (data.app !== 'rewavier' || data.type !== 'order' || !Array.isArray(data.files)) {
      return null;
    }
    const items = Array.isArray(data.items) ? data.items.filter(isLayoutItem) : undefined;
    return {
      version: items && items.length > 0 ? 2 : 1,
      app: 'rewavier',
      type: 'order',
      updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : 0,
      files: data.files.filter((name): name is string => typeof name === 'string'),
      items,
    };
  } catch {
    return null;
  }
}

export function buildAlbumOrder(tracks: Track[], updatedAt: number): AlbumOrderFile {
  return buildAlbumOrderFile(undefined, tracks, updatedAt);
}

export function buildAlbumOrderFile(
  album: Album | undefined,
  tracks: Track[],
  updatedAt: number,
): AlbumOrderFile {
  const byId = new Map(tracks.map((track) => [track.id, track]));
  if (!album) {
    const files = tracks.map(trackOrderName);
    return {
      version: 1,
      app: 'rewavier',
      type: 'order',
      updatedAt,
      files,
    };
  }
  const items: AlbumOrderLayoutItem[] = [];
  const files: string[] = [];
  for (const id of album.trackIds) {
    const folder = versionFolderById(album, id);
    if (folder) {
      const folderFiles = folder.trackIds
        .map((trackId) => byId.get(trackId))
        .filter((track): track is Track => track != null)
        .map(trackOrderName);
      const chosen = byId.get(folder.chosenId);
      items.push({
        kind: 'folder',
        name: folder.name,
        files: folderFiles,
        chosen: chosen ? trackOrderName(chosen) : undefined,
      });
      files.push(...folderFiles);
      continue;
    }
    if (isSeparatorId(id)) {
      const name = (album.separators ?? []).find((item) => item.id === id)?.name ?? 'Separatore';
      items.push({ kind: 'separator', name });
      continue;
    }
    if (isVersionFolderId(id)) {
      continue;
    }
    const track = byId.get(id);
    if (!track) {
      continue;
    }
    const name = trackOrderName(track);
    items.push({ kind: 'file', name });
    files.push(name);
  }
  return {
    version: 2,
    app: 'rewavier',
    type: 'order',
    updatedAt,
    files,
    items,
  };
}

function findTrackByOrderName(tracks: Track[], name: string): Track | undefined {
  const key = nameKey(name);
  return tracks.find((track) => nameKey(trackOrderName(track)) === key);
}

function reuseFolderId(album: Album, trackIds: string[], name: string): string {
  const sameTracks = (album.versionFolders ?? []).find(
    (folder) =>
      folder.trackIds.length === trackIds.length &&
      trackIds.every((id) => folder.trackIds.includes(id)),
  );
  if (sameTracks) {
    return sameTracks.id;
  }
  const sameName = (album.versionFolders ?? []).find((folder) => folder.name === name);
  return sameName?.id ?? createId('ver');
}

function reuseSeparatorId(album: Album, name: string, used: Set<string>): string {
  const match = (album.separators ?? []).find((item) => item.name === name && !used.has(item.id));
  return match?.id ?? createId('sep');
}

/** Apply Drive order file: folders, separators, chosen take, and track order. */
export function applyAlbumOrderFile(album: Album, tracks: Track[], parsed: AlbumOrderFile): Album {
  const albumTracks = tracks.filter(
    (track) =>
      album.trackIds.includes(track.id) ||
      (album.versionFolders ?? []).some((folder) => folder.trackIds.includes(track.id)),
  );
  const seen = new Set<string>();
  const take = (track: Track | undefined): Track | undefined => {
    if (!track || seen.has(track.id)) {
      return undefined;
    }
    seen.add(track.id);
    return track;
  };

  if (parsed.items && parsed.items.length > 0) {
    const trackIds: string[] = [];
    const versionFolders: AlbumVersionFolder[] = [];
    const separators: AlbumSeparator[] = [];
    const usedSep = new Set<string>();
    for (const item of parsed.items) {
      if (item.kind === 'file') {
        const track = take(findTrackByOrderName(albumTracks, item.name));
        if (track) {
          trackIds.push(track.id);
        }
        continue;
      }
      if (item.kind === 'separator') {
        const id = reuseSeparatorId(album, item.name, usedSep);
        usedSep.add(id);
        separators.push({ id, name: item.name });
        trackIds.push(id);
        continue;
      }
      const inner = item.files
        .map((name) => take(findTrackByOrderName(albumTracks, name)))
        .filter((track): track is Track => track != null);
      if (inner.length < 2) {
        for (const track of inner) {
          trackIds.push(track.id);
        }
        continue;
      }
      const folderTrackIds = inner.map((track) => track.id);
      const chosen = item.chosen
        ? findTrackByOrderName(inner, item.chosen)
        : inner[0];
      const folderId = reuseFolderId(album, folderTrackIds, item.name);
      versionFolders.push({
        id: folderId,
        name: item.name.trim() || 'Versioni',
        trackIds: folderTrackIds,
        chosenId: chosen?.id ?? folderTrackIds[0]!,
      });
      trackIds.push(folderId);
    }
    for (const track of albumTracks) {
      if (!seen.has(track.id)) {
        trackIds.push(track.id);
      }
    }
    return {
      ...album,
      trackIds,
      versionFolders: versionFolders.length > 0 ? versionFolders : undefined,
      separators: separators.length > 0 ? separators : undefined,
      orderUpdatedAt: parsed.updatedAt,
    };
  }

  const ordered = sortTracksByOrder(albumTracks, parsed.files);
  const incomingIds = ordered.map((track) => track.id);
  const nested = (album.versionFolders ?? []).flatMap((folder) => folder.trackIds);
  const nextIds = mergeAlbumOrderKeepingFolders(album.trackIds, incomingIds, nested);
  return {
    ...album,
    trackIds: nextIds,
    orderUpdatedAt: parsed.updatedAt,
  };
}

/** Flat Drive list + keep local folders/separators without duplicating inner tracks. */
export function mergeAlbumOrderKeepingFolders(
  previousIds: string[],
  incomingTrackIds: string[],
  nestedTrackIds: string[],
): string[] {
  const nested = new Set(nestedTrackIds);
  const next = incomingTrackIds.filter(
    (id) => !isSeparatorId(id) && !isVersionFolderId(id) && !nested.has(id),
  );
  let lastIncomingIndex = -1;
  for (const id of previousIds) {
    if (isSeparatorId(id) || isVersionFolderId(id)) {
      const at = lastIncomingIndex + 1;
      next.splice(at, 0, id);
      lastIncomingIndex = at;
      continue;
    }
    const index = next.indexOf(id);
    if (index >= 0) {
      lastIncomingIndex = index;
    }
  }
  return next;
}

export function albumTrackSortKey(track: Track): string {
  return (track.sourceFileName ?? `${track.title}.m4a`).trim();
}

export function compareAlbumTrackNames(left: Track, right: Track): number {
  return albumTrackSortKey(left).localeCompare(albumTrackSortKey(right), 'it', {
    numeric: true,
    sensitivity: 'base',
  });
}

export function albumHasCustomOrder(album: Pick<Album, 'orderUpdatedAt'>): boolean {
  return (album.orderUpdatedAt ?? 0) > 0;
}

export function sortTracksAlphabetically(tracks: Track[]): Track[] {
  return [...tracks].sort(compareAlbumTrackNames);
}

/** Default album order is A→Z by file name. A drag (or Drive order file) locks a custom order. */
export function orderedAlbumItemIds(album: Album, tracks: Track[]): string[] {
  if (albumHasCustomOrder(album)) {
    return album.trackIds;
  }
  const byId = new Map(tracks.map((track) => [track.id, track]));
  const folders = new Map((album.versionFolders ?? []).map((folder) => [folder.id, folder]));
  const itemIds = album.trackIds.filter((id) => byId.has(id) || folders.has(id));
  const separators = album.trackIds.filter((id) => isSeparatorId(id));
  const nameOf = (id: string) => {
    const folder = folders.get(id);
    if (folder) {
      return folder.name;
    }
    const track = byId.get(id);
    return track ? albumTrackSortKey(track) : id;
  };
  const sorted = [...itemIds].sort((left, right) =>
    nameOf(left).localeCompare(nameOf(right), 'it', { numeric: true, sensitivity: 'base' }),
  );
  return separators.length ? [...sorted, ...separators] : sorted;
}

export function sortTracksByOrder(tracks: Track[], files: string[]): Track[] {
  const rank = new Map(
    files.map((name, index) => [audioBasename(name).toLowerCase(), index]),
  );
  return [...tracks].sort((left, right) => {
    const a = rank.get(audioBasename(left.sourceFileName ?? left.title).toLowerCase());
    const b = rank.get(audioBasename(right.sourceFileName ?? right.title).toLowerCase());
    if (a == null && b == null) {
      return compareAlbumTrackNames(left, right);
    }
    if (a == null) {
      return 1;
    }
    if (b == null) {
      return -1;
    }
    return a - b;
  });
}
