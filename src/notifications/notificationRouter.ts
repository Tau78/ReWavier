import { playableAlbumTrackIds } from '../domain/albumVersions';
import { ensurePlayableAndOpen } from '../features/library/openTrack';
import { navigateWhenReady } from '../navigation/navigationRef';
import { useLibraryStore } from '../store/libraryStore';
import { useNotificationStore } from '../store/notificationStore';
import { notificationDedupKey } from '../domain/notifications';
import type { MentionNotificationPayload } from './mentionPayload';

export async function openMentionNotification(payload: MentionNotificationPayload): Promise<void> {
  const { albumId, trackId, timestampMs } = payload;
  const album = useLibraryStore.getState().albums.find((item) => item.id === albumId);
  const queueIds = album ? playableAlbumTrackIds(album) : [trackId];
  const id = notificationDedupKey({
    albumId: payload.albumId,
    trackId: payload.trackId,
    markerId: payload.markerId,
  });
  useNotificationStore.getState().markRead(id);
  navigateWhenReady('Collection', { kind: 'album', id: albumId });
  await ensurePlayableAndOpen(trackId, queueIds, {
    autoPlay: true,
    startAtMs: timestampMs,
  });
}
