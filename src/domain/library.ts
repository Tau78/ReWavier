import { type Marker, type Track } from './models';

export type CollectionKind = 'folder' | 'album' | 'playlist' | 'smart';

export type Folder = {
  id: string;
  name: string;
  parentId: string | null;
  trackIds: string[];
  driveFolderId?: string;
};

export type AlbumOrigin = 'local' | 'drive';

export type AlbumSeparator = {
  id: string;
  name: string;
};

export type Album = {
  id: string;
  name: string;
  artist: string;
  trackIds: string[];
  origin?: AlbumOrigin;
  driveFolderName?: string;
  driveFolderId?: string;
  /** When true, sync also walks Drive subfolders and keeps the same tree in the app. */
  driveRecursive?: boolean;
  lastSyncedAt?: number;
  orderUpdatedAt?: number;
  shared?: boolean;
  artworkUri?: string;
  notes?: string;
  separators?: AlbumSeparator[];
};

export function isSeparatorId(id: string): boolean {
  return id.startsWith('sep-');
}

export function albumTrackCount(trackIds: string[]): number {
  return trackIds.filter((id) => !isSeparatorId(id)).length;
}

export function mergeAlbumOrderFromCloud(previousIds: string[], incomingTrackIds: string[]): string[] {
  const next = incomingTrackIds.filter((id) => !isSeparatorId(id));
  let lastIncomingIndex = -1;
  for (const id of previousIds) {
    if (isSeparatorId(id)) {
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
