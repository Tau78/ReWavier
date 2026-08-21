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

export function sortTracksByOrder(tracks: Track[], files: string[]): Track[] {
  const rank = new Map(
    files.map((name, index) => [audioBasename(name).toLowerCase(), index]),
  );
  return [...tracks].sort((left, right) => {
    const a = rank.get(audioBasename(left.sourceFileName ?? left.title).toLowerCase());
    const b = rank.get(audioBasename(right.sourceFileName ?? right.title).toLowerCase());
    if (a == null && b == null) {
      return 0;
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
