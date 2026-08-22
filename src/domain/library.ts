import { type Marker, type Track } from './models';

export type CollectionKind = 'folder' | 'album' | 'playlist' | 'smart';

export type Folder = {
  id: string;
  name: string;
  parentId: string | null;
  trackIds: string[];
};

export type AlbumOrigin = 'local' | 'drive';

export type Album = {
  id: string;
  name: string;
  artist: string;
  trackIds: string[];
  origin?: AlbumOrigin;
  driveFolderName?: string;
  driveFolderId?: string;
  lastSyncedAt?: number;
  orderUpdatedAt?: number;
  shared?: boolean;
  artworkUri?: string;
  notes?: string;
};

export type Playlist = {
  id: string;
  name: string;
  trackIds: string[];
};

export type SmartCondition =
  | { id: string; type: 'minNotes'; value: number }
  | { id: string; type: 'titleContains'; value: string };

export type SmartPlaylist = {
  id: string;
  name: string;
  conditions: SmartCondition[];
};

export const DEMO_TRACKS: Track[] = [];

export const DEMO_FOLDERS: Folder[] = [];

export const DEMO_ALBUMS: Album[] = [];

export const DEMO_PLAYLISTS: Playlist[] = [];

export const SEEDED_SMART_IDS = new Set(['smart-notes']);

export const DEMO_SMART: SmartPlaylist[] = [];

export function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}`;
}

export function trackMatchesSmart(
  track: Track,
  markers: Marker[],
  playlist: SmartPlaylist,
): boolean {
  if (playlist.conditions.length === 0) {
    return false;
  }
  return playlist.conditions.every((condition) => {
    if (condition.type === 'minNotes') {
      return markers.filter((marker) => marker.hidden !== true).length >= condition.value;
    }
    const needle = condition.value.trim().toLowerCase();
    if (!needle) {
      return true;
    }
    return (
      track.title.toLowerCase().includes(needle) ||
      track.artist.toLowerCase().includes(needle)
    );
  });
}
