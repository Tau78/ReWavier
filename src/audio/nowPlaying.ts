import type { AudioMetadata } from 'expo-audio';

import type { Track } from '../domain/models';
import { useLibraryStore } from '../store/libraryStore';

export function nowPlayingMetadata(track: Track): AudioMetadata {
  const album = useLibraryStore
    .getState()
    .albums.find((item) => item.trackIds.includes(track.id));
  const artist = track.artist.trim() || album?.artist?.trim() || undefined;
  return {
    title: track.title,
    artist,
    albumTitle: album?.name,
    artworkUrl: album?.artworkUri,
  };
}
