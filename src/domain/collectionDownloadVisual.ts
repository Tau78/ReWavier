import { isDownloaded, playableUri, trackCanFetchRemote } from './audioFormats';
import type { Track } from './models';

export type CollectionDownloadVisual = 'download' | 'update' | 'done' | 'pause';

export function collectionDownloadVisual(input: {
  active: boolean;
  missingLocal: boolean;
  driveHasNews: boolean;
}): CollectionDownloadVisual {
  if (input.active) {
    return 'pause';
  }
  if (input.missingLocal) {
    return 'download';
  }
  if (input.driveHasNews) {
    return 'update';
  }
  return 'done';
}

export function collectionDownloadGlyph(visual: CollectionDownloadVisual): string {
  if (visual === 'pause') {
    return '❚❚';
  }
  if (visual === 'update') {
    return '↻';
  }
  if (visual === 'done') {
    return '✓';
  }
  return '↓';
}

export function drivePeekNewsCount(peek: {
  newRemoteCount: number;
  changedTrackIds: readonly string[];
}): number {
  return Math.max(0, peek.newRemoteCount) + new Set(peek.changedTrackIds).size;
}

export function collectionDownloadLabel(
  visual: CollectionDownloadVisual,
  kind: 'album' | 'folder',
): string {
  const thing = kind === 'folder' ? 'playlist' : 'album';
  if (visual === 'pause') {
    return 'Metti in pausa il download';
  }
  if (visual === 'update') {
    return `Aggiorna ${thing}`;
  }
  if (visual === 'done') {
    return `${thing === 'playlist' ? 'Playlist' : 'Album'} già sul telefono`;
  }
  return `Scarica ${thing}`;
}

export function trackNeedsFetch(track: Track): boolean {
  if (track.pendingRemoteUpdate) {
    return trackCanFetchRemote(track);
  }
  if (isDownloaded(track)) {
    return false;
  }
  return Boolean(playableUri(track) || trackCanFetchRemote(track));
}

export class DownloadPausedError extends Error {
  constructor() {
    super('paused');
    this.name = 'DownloadPausedError';
  }
}

export function isDownloadPausedError(error: unknown): boolean {
  return error instanceof DownloadPausedError || (error instanceof Error && error.name === 'DownloadPausedError');
}
