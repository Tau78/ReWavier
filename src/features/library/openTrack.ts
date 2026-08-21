import { playableUri } from '../../domain/audioFormats';
import { useLibraryStore } from '../../store/libraryStore';
import { usePlayerStore } from '../../store/playerStore';

export function openTrack(trackId: string, queueIds?: string[]): boolean {
  const track = useLibraryStore.getState().getTrack(trackId);
  if (!track || !playableUri(track)) {
    return false;
  }
  const markers = useLibraryStore.getState().markersByTrackId[trackId] ?? [];
  usePlayerStore.getState().loadTrack(track, markers, queueIds ?? [trackId]);
  if (!track.downloaded) {
    void useLibraryStore.getState().downloadTrack(trackId).catch(() => undefined);
  }
  return true;
}
