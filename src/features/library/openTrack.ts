import { playableUri } from '../../domain/audioFormats';
import { useLibraryStore } from '../../store/libraryStore';
import { usePlayerStore } from '../../store/playerStore';

export function openTrack(
  trackId: string,
  queueIds?: string[],
  options?: { autoPlay?: boolean; startAtMs?: number },
): boolean {
  const track = useLibraryStore.getState().getTrack(trackId);
  if (!track || !playableUri(track)) {
    return false;
  }
  const markers = useLibraryStore.getState().markersByTrackId[trackId] ?? [];
  usePlayerStore.getState().loadTrack(track, markers, queueIds ?? [trackId], options);
  if (!track.downloaded) {
    void useLibraryStore.getState().downloadTrack(trackId).catch(() => undefined);
  }
  return true;
}

export function playQueue(trackIds: string[]): boolean {
  const playableIds = trackIds.filter((id) => {
    const track = useLibraryStore.getState().getTrack(id);
    return Boolean(track && playableUri(track));
  });
  const first = playableIds[0];
  if (!first) {
    return false;
  }
  return openTrack(first, playableIds, { autoPlay: true });
}

/** Loads the first playable track in this list unless one is already in the player. */
export function ensureCollectionTrack(trackIds: string[]): boolean {
  const current = usePlayerStore.getState().track.id;
  if (current && trackIds.includes(current)) {
    return true;
  }
  for (const trackId of trackIds) {
    if (openTrack(trackId, trackIds)) {
      return true;
    }
  }
  return false;
}
