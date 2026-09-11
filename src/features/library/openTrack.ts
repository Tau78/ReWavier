import { playableUri, trackCanFetchRemote } from '../../domain/audioFormats';
import { pickResumeTrackId } from '../../domain/playbackResume';
import {
  getCollectionResume,
  hydratePlaybackPersist,
  startAtMsForCollection,
  startAtMsForTrack,
} from '../../files/playbackPersist';
import { isTrackDownloadBlocked } from '../../store/downloadProgressStore';
import { useLibraryStore } from '../../store/libraryStore';
import { usePlayerStore } from '../../store/playerStore';

export type OpenTrackOptions = {
  autoPlay?: boolean;
  startAtMs?: number;
  resumeKey?: string;
  /** When false, do not apply a saved position (skip / explicit cue). Default true. */
  resume?: boolean;
};

function playableQueueIds(trackIds: string[]): string[] {
  return trackIds.filter((id) => {
    const track = useLibraryStore.getState().getTrack(id);
    return Boolean(track && playableUri(track) && !isTrackDownloadBlocked(id));
  });
}

function resolvedStartAtMs(
  trackId: string,
  options?: OpenTrackOptions,
): number | undefined {
  if (options?.startAtMs != null) {
    return options.startAtMs;
  }
  if (options?.resume === false) {
    return undefined;
  }
  const durationMs = useLibraryStore.getState().getTrack(trackId)?.durationMs ?? 0;
  if (options?.resumeKey) {
    return startAtMsForCollection(options.resumeKey, trackId, durationMs);
  }
  return startAtMsForTrack(trackId, durationMs);
}

export function openTrack(
  trackId: string,
  queueIds?: string[],
  options?: OpenTrackOptions,
): boolean {
  const track = useLibraryStore.getState().getTrack(trackId);
  if (!track || !playableUri(track) || isTrackDownloadBlocked(trackId)) {
    return false;
  }
  const nextQueue = queueIds ?? [trackId];
  const player = usePlayerStore.getState();
  if (player.track.id === trackId && playableUri(player.track) && player.loadState !== 'error') {
    const patch: { resumeKey?: string; queueIds?: string[] } = {};
    if (options?.resumeKey && options.resumeKey !== player.resumeKey) {
      patch.resumeKey = options.resumeKey;
    }
    if (nextQueue.join('\0') !== player.queueIds.join('\0')) {
      patch.queueIds = nextQueue;
    }
    if (Object.keys(patch).length > 0) {
      usePlayerStore.setState(patch);
    }
    if (options?.startAtMs != null) {
      usePlayerStore.getState().seekTo(options.startAtMs);
    }
    if (options?.autoPlay) {
      usePlayerStore.getState().play();
    }
    return true;
  }
  const markers = useLibraryStore.getState().markersByTrackId[trackId] ?? [];
  const startAtMs = resolvedStartAtMs(trackId, options);
  usePlayerStore.getState().loadTrack(track, markers, nextQueue, {
    autoPlay: options?.autoPlay,
    startAtMs,
    resumeKey: options?.resumeKey,
  });
  if (!track.downloaded) {
    void useLibraryStore.getState().downloadTrack(trackId).catch(() => undefined);
  }
  return true;
}

export function playQueue(
  trackIds: string[],
  options?: { collectionKey?: string },
): boolean {
  const playableIds = playableQueueIds(trackIds);
  if (playableIds.length === 0) {
    return false;
  }
  const saved = options?.collectionKey ? getCollectionResume(options.collectionKey) : undefined;
  const resumeId = pickResumeTrackId(saved, playableIds) ?? playableIds[0];
  if (!resumeId) {
    return false;
  }
  return openTrack(resumeId, playableIds, {
    autoPlay: true,
    resumeKey: options?.collectionKey,
  });
}

/** Opens the track, fetching it from Drive first when the file is not on the phone. */
export async function ensurePlayableAndOpen(
  trackId: string,
  queueIds?: string[],
  options?: OpenTrackOptions,
): Promise<boolean> {
  await hydratePlaybackPersist();
  if (openTrack(trackId, queueIds, options)) {
    return true;
  }
  if (isTrackDownloadBlocked(trackId)) {
    return false;
  }
  const track = useLibraryStore.getState().getTrack(trackId);
  if (!track || !trackCanFetchRemote(track)) {
    return false;
  }
  await useLibraryStore.getState().downloadTrack(trackId);
  return openTrack(trackId, queueIds, options);
}

/** Loads the last saved track in this list unless one is already in the player. */
export function restoreCollectionPlayback(key: string, trackIds: string[]): boolean {
  const current = usePlayerStore.getState().track.id;
  if (current && trackIds.includes(current)) {
    return true;
  }
  if (current) {
    return false;
  }
  const playableIds = playableQueueIds(trackIds);
  const resumeId = pickResumeTrackId(getCollectionResume(key), playableIds);
  if (!resumeId) {
    return false;
  }
  return openTrack(resumeId, playableIds, { resumeKey: key });
}

/** Loads the first playable track in this list unless one is already in the player. */
export function ensureCollectionTrack(trackIds: string[]): boolean {
  const current = usePlayerStore.getState().track.id;
  if (current && trackIds.includes(current)) {
    return true;
  }
  for (const trackId of trackIds) {
    if (openTrack(trackId, trackIds, { resume: false })) {
      return true;
    }
  }
  return false;
}
