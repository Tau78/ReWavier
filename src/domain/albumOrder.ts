import type { Album } from './library';
import { isSeparatorId } from './library';
import { audioBasename } from './sidecar';
import type { Track } from './models';

export const ORDER_FILE_NAME = 'rewavier.order.json';

export type AlbumOrderFile = {
  version: 1;
  app: 'rewavier';
  type: 'order';
  updatedAt: number;
  files: string[];
};

export function isOrderManifestName(fileName: string): boolean {
  return fileName.trim().toLowerCase() === ORDER_FILE_NAME;
}

export function parseAlbumOrder(raw: string): AlbumOrderFile | null {
  try {
    const data = JSON.parse(raw) as Partial<AlbumOrderFile>;
    if (data.app !== 'rewavier' || data.type !== 'order' || !Array.isArray(data.files)) {
      return null;
    }
    return {
      version: 1,
      app: 'rewavier',
      type: 'order',
      updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : 0,
      files: data.files.filter((name): name is string => typeof name === 'string'),
    };
  } catch {
    return null;
  }
}

export function buildAlbumOrder(tracks: Track[], updatedAt: number): AlbumOrderFile {
  return {
    version: 1,
    app: 'rewavier',
    type: 'order',
    updatedAt,
    files: tracks.map((track) => track.sourceFileName ?? `${track.title}.m4a`),
  };
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
  const trackIds = album.trackIds.filter((id) => byId.has(id));
  const separators = album.trackIds.filter((id) => isSeparatorId(id));
  const sorted = [...trackIds].sort((left, right) =>
    compareAlbumTrackNames(byId.get(left) as Track, byId.get(right) as Track),
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
