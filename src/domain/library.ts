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

/** More files of the same song. v2 will add choosing the best bits (comping). */
export type AlbumVersionFolder = {
  id: string;
  name: string;
  trackIds: string[];
  chosenId: string;
};

export type AlbumDocument = {
  id: string;
  name: string;
  fileUri: string;
  folderPath?: string;
  driveFileId?: string;
  remoteModifiedAt?: string;
  remoteHash?: string;
};

export type Album = {
  id: string;
  name: string;
  artist: string;
  trackIds: string[];
  origin?: AlbumOrigin;
  driveFolderName?: string;
  driveFolderId?: string;
  /** Shared Drive (team) id when the album lives outside My Drive. */
  driveSharedDriveId?: string;
  /** When true, sync also walks Drive subfolders and keeps the same tree in the app. */
  driveRecursive?: boolean;
  lastSyncedAt?: number;
  orderUpdatedAt?: number;
  shared?: boolean;
  artworkUri?: string;
  notes?: string;
  separators?: AlbumSeparator[];
  versionFolders?: AlbumVersionFolder[];
  documents?: AlbumDocument[];
};

export function isSeparatorId(id: string): boolean {
  return id.startsWith('sep-');
}

export function isVersionFolderId(id: string): boolean {
  return id.startsWith('ver-');
}

export function albumTrackCount(
  trackIds: string[],
  versionFolders: AlbumVersionFolder[] = [],
): number {
  const folders = new Map(versionFolders.map((folder) => [folder.id, folder]));
  let count = 0;
  for (const id of trackIds) {
    if (isSeparatorId(id)) {
      continue;
    }
    const folder = folders.get(id);
    if (folder) {
      count += folder.trackIds.length;
      continue;
    }
    if (!isVersionFolderId(id)) {
      count += 1;
    }
  }
  return count;
}

export function mergeAlbumOrderFromCloud(previousIds: string[], incomingTrackIds: string[]): string[] {
  const next = incomingTrackIds.filter((id) => !isSeparatorId(id) && !isVersionFolderId(id));
  let lastIncomingIndex = -1;
  for (const id of previousIds) {
    if (isSeparatorId(id) || isVersionFolderId(id)) {
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
