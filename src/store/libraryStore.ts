import { create } from 'zustand';

import {
  DEMO_ALBUMS,
  DEMO_FOLDERS,
  DEMO_PLAYLISTS,
  DEMO_SMART,
  DEMO_TRACKS,
  createId,
  mergeAlbumOrderFromCloud,
  trackMatchesSmart,
  type Album,
  type AlbumOrigin,
  type CollectionKind,
  type Folder,
  type Playlist,
  type SmartPlaylist,
} from '../domain/library';
import { type Marker, type Track } from '../domain/models';
import { withPractice, type PracticeIds } from '../domain/practice';
import {
  loadLibrarySnapshot,
  saveLibrarySnapshot,
  sanitizeSnapshot,
  type LibrarySnapshot,
} from '../files/libraryPersist';
import { playableUri } from '../domain/audioFormats';
import { migrateTracksToAudioFolder, scanAudioFolder } from '../files/audioFolder';
import {
  copyToDownloads,
  removeUri,
} from '../files/downloads';
import { sourceFileNameFromTitle } from '../domain/sidecar';
import { writeSidecarToLibrary, removeSidecarFromLibrary, type ImportedBundle } from '../files/libraryFiles';
import { userHasUsage } from '../domain/session';
import { useSessionStore } from './sessionStore';

export type LibraryState = {
  tracks: Track[];
  folders: Folder[];
  albums: Album[];
  playlists: Playlist[];
  smartPlaylists: SmartPlaylist[];
  markersByTrackId: Record<string, Marker[]>;
  peaksByTrackId: Record<string, number[]>;
  downloadingIds: Record<string, number>;
  libraryHydrated: boolean;
};

export type LibraryActions = {
  setTrackMarkers: (trackId: string, markers: Marker[]) => void;
  createFolder: (name: string, parentId?: string | null) => string;
  createAlbum: (
    name: string,
    extras?: {
      artist?: string;
      origin?: AlbumOrigin;
      driveFolderName?: string;
      driveFolderId?: string;
    },
  ) => string;
  linkAlbumDrive: (albumId: string, folderId: string, folderName: string) => void;
  touchAlbumSync: (albumId: string) => void;
  updateTrackRemote: (
    trackId: string,
    meta: Pick<Track, 'driveFileId' | 'remoteModifiedAt' | 'remoteSize' | 'remoteHash'>,
  ) => void;
  setTrackInbox: (trackId: string, inboxUri: string) => void;
  createPlaylist: (name: string) => string;
  renameFolder: (id: string, name: string) => void;
  deleteFolder: (id: string) => void;
  moveFolder: (id: string, parentId: string | null) => void;
  renameAlbum: (id: string, name: string) => void;
  setAlbumArtwork: (id: string, artworkUri?: string) => void;
  setAlbumNotes: (id: string, notes: string) => void;
  addAlbumSeparator: (albumId: string, name: string) => string;
  renameAlbumSeparator: (albumId: string, separatorId: string, name: string) => void;
  deleteAlbumSeparator: (albumId: string, separatorId: string) => void;
  deleteAlbum: (id: string) => void;
  renamePlaylist: (id: string, name: string) => void;
  deletePlaylist: (id: string) => void;
  renameTrack: (id: string, title: string) => void;
  setTrackArtwork: (id: string, artworkUri?: string) => void;
  setTrackBounds: (id: string, startMs: number, endMs: number) => void;
  setTrackPractice: (id: string, practice: PracticeIds) => void;
  deleteTrack: (id: string) => Promise<void>;
  moveTrack: (trackId: string, folderId: string | null) => void;
  addTrackToFolder: (trackId: string, folderId: string) => 'added' | 'exists';
  importBundles: (
    bundles: ImportedBundle[],
    dest?: { folderId?: string | null; albumId?: string },
  ) => void;
  addTracksToAlbum: (albumId: string, trackIds: string[]) => void;
  replaceTrackFile: (trackId: string, fileUri: string, keepMarkerIds: string[]) => void;
  downloadTrack: (trackId: string) => Promise<void>;
  removeDownload: (trackId: string) => Promise<void>;
  downloadAlbum: (albumId: string) => Promise<void>;
  updateTrackDuration: (id: string, durationMs: number) => void;
  setTrackPeaks: (id: string, peaks: number[]) => void;
  createSmartPlaylist: (playlist: Omit<SmartPlaylist, 'id'>) => string;
  updateSmartPlaylist: (playlist: SmartPlaylist) => void;
  deleteSmartPlaylist: (id: string) => void;
  setCollectionOrder: (
    kind: CollectionKind,
    id: string,
    trackIds: string[],
    extras?: { updatedAt?: number; fromCloud?: boolean },
  ) => void;
  hydrate: () => Promise<void>;
  getTrack: (id: string) => Track | undefined;
  tracksIn: (kind: CollectionKind, id: string) => Track[];
  foldersIn: (parentId: string | null) => Folder[];
  folderDescendants: (id: string) => Set<string>;
};

export type LibraryStore = LibraryState & LibraryActions;

function sidecarSlug(): string | undefined {
  const user = useSessionStore.getState().user;
  return user && userHasUsage(user, 'band') ? user.authorSlug : undefined;
}

function persistSidecar(track: Track | undefined, markers: Marker[]) {
  if (!track) {
    return;
  }
  void writeSidecarToLibrary(track, markers, sidecarSlug())
    .then(() => import('../cloud/syncEngine').then((mod) => mod.pushSidecarIfShared(track.id)))
    .catch(() => undefined);
}

function snapshotFrom(state: LibraryState): LibrarySnapshot {
  return {
    version: 2,
    tracks: state.tracks,
    folders: state.folders,
    albums: state.albums,
    playlists: state.playlists,
    smartPlaylists: state.smartPlaylists,
    markersByTrackId: state.markersByTrackId,
  };
}

let persistReady = false;
let persistTimer: ReturnType<typeof setTimeout> | undefined;
let libraryHydratePromise: Promise<void> | undefined;

export function waitForLibraryHydrated(): Promise<void> {
  if (useLibraryStore.getState().libraryHydrated) {
    return Promise.resolve();
  }
  if (libraryHydratePromise) {
    return libraryHydratePromise;
  }
  return new Promise((resolve) => {
    const unsub = useLibraryStore.subscribe((state) => {
      if (state.libraryHydrated) {
        unsub();
        resolve();
      }
    });
  });
}

export async function flushLibraryPersist(): Promise<void> {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = undefined;
  }
  if (!persistReady) {
    return;
  }
  await saveLibrarySnapshot(snapshotFrom(useLibraryStore.getState()));
}

function schedulePersist() {
  if (!persistReady) {
    return;
  }
  if (persistTimer) {
    clearTimeout(persistTimer);
  }
  persistTimer = setTimeout(() => {
    void saveLibrarySnapshot(snapshotFrom(useLibraryStore.getState())).catch(() => undefined);
  }, 250);
}

export const useLibraryStore = create<LibraryStore>((set, get) => ({
  tracks: DEMO_TRACKS,
  folders: DEMO_FOLDERS,
  albums: DEMO_ALBUMS,
  playlists: DEMO_PLAYLISTS,
  smartPlaylists: DEMO_SMART,
  markersByTrackId: {},
  peaksByTrackId: {},
  downloadingIds: {},
  libraryHydrated: false,

  setTrackMarkers(trackId, markers) {
    set((state) => ({
      markersByTrackId: { ...state.markersByTrackId, [trackId]: markers },
    }));
    persistSidecar(get().getTrack(trackId), markers);
  },

  createFolder(name, parentId = null) {
    const id = createId('folder');
    const trimmed = name.trim() || 'Nuova cartella';
    set((state) => ({
      folders: [...state.folders, { id, name: trimmed, parentId, trackIds: [] }],
    }));
    return id;
  },

  createAlbum(name, extras) {
    const id = createId('album');
    const trimmed = name.trim() || 'Nuovo album';
    set((state) => ({
      albums: [
        ...state.albums,
        {
          id,
          name: trimmed,
          artist: extras?.artist ?? '',
          trackIds: [],
          origin: extras?.origin ?? 'local',
          driveFolderName: extras?.driveFolderName,
          driveFolderId: extras?.driveFolderId,
        },
      ],
    }));
    return id;
  },

  linkAlbumDrive(albumId, folderId, folderName) {
    set((state) => ({
      albums: state.albums.map((album) =>
        album.id === albumId
          ? { ...album, origin: 'drive', driveFolderId: folderId, driveFolderName: folderName }
          : album,
      ),
    }));
  },

  touchAlbumSync(albumId) {
    set((state) => ({
      albums: state.albums.map((album) =>
        album.id === albumId ? { ...album, lastSyncedAt: Date.now() } : album,
      ),
    }));
  },

  updateTrackRemote(trackId, meta) {
    set((state) => ({
      tracks: state.tracks.map((track) =>
        track.id === trackId ? { ...track, ...meta } : track,
      ),
    }));
  },

  setTrackInbox(trackId, inboxUri) {
    set((state) => ({
      tracks: state.tracks.map((track) =>
        track.id === trackId ? { ...track, inboxUri, downloaded: false } : track,
      ),
      peaksByTrackId: Object.fromEntries(
        Object.entries(state.peaksByTrackId).filter(([id]) => id !== trackId),
      ),
    }));
  },

  createPlaylist(name) {
    const id = createId('pl');
    const trimmed = name.trim() || 'Nuova playlist';
    set((state) => ({
      playlists: [...state.playlists, { id, name: trimmed, trackIds: [] }],
    }));
    return id;
  },

  renameFolder(id, name) {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    set((state) => ({
      folders: state.folders.map((folder) =>
        folder.id === id ? { ...folder, name: trimmed } : folder,
      ),
    }));
  },

  deleteFolder(id) {
    const { folders } = get();
    const doomed = get().folderDescendants(id);
    doomed.add(id);
    const parentId = folders.find((folder) => folder.id === id)?.parentId ?? null;
    set((state) => ({
      folders: state.folders
        .filter((folder) => !doomed.has(folder.id))
        .map((folder) =>
          folder.parentId && doomed.has(folder.parentId)
            ? { ...folder, parentId }
            : folder,
        ),
    }));
  },

  moveFolder(id, parentId) {
    if (id === parentId) {
      return;
    }
    if (parentId && get().folderDescendants(id).has(parentId)) {
      return;
    }
    set((state) => ({
      folders: state.folders.map((folder) =>
        folder.id === id ? { ...folder, parentId } : folder,
      ),
    }));
  },

  renameAlbum(id, name) {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    set((state) => ({
      albums: state.albums.map((album) =>
        album.id === id ? { ...album, name: trimmed } : album,
      ),
    }));
  },

  setAlbumArtwork(id, artworkUri) {
    const previous = get().albums.find((album) => album.id === id)?.artworkUri;
    if (previous && previous !== artworkUri) {
      void removeUri(previous);
    }
    set((state) => ({
      albums: state.albums.map((album) =>
        album.id === id ? { ...album, artworkUri } : album,
      ),
    }));
  },

  setAlbumNotes(id, notes) {
    set((state) => ({
      albums: state.albums.map((album) =>
        album.id === id ? { ...album, notes } : album,
      ),
    }));
  },

  addAlbumSeparator(albumId, name) {
    const trimmed = name.trim() || 'Separatore';
    const separatorId = createId('sep');
    set((state) => ({
      albums: state.albums.map((album) =>
        album.id === albumId
          ? {
              ...album,
              trackIds: [...album.trackIds, separatorId],
              separators: [...(album.separators ?? []), { id: separatorId, name: trimmed }],
              orderUpdatedAt: Date.now(),
            }
          : album,
      ),
    }));
    return separatorId;
  },

  renameAlbumSeparator(albumId, separatorId, name) {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    set((state) => ({
      albums: state.albums.map((album) =>
        album.id === albumId
          ? {
              ...album,
              separators: (album.separators ?? []).map((item) =>
                item.id === separatorId ? { ...item, name: trimmed } : item,
              ),
            }
          : album,
      ),
    }));
  },

  deleteAlbumSeparator(albumId, separatorId) {
    set((state) => ({
      albums: state.albums.map((album) =>
        album.id === albumId
          ? {
              ...album,
              trackIds: album.trackIds.filter((id) => id !== separatorId),
              separators: (album.separators ?? []).filter((item) => item.id !== separatorId),
              orderUpdatedAt: Date.now(),
            }
          : album,
      ),
    }));
  },

  deleteAlbum(id) {
    const artworkUri = get().albums.find((album) => album.id === id)?.artworkUri;
    void removeUri(artworkUri);
    set((state) => ({
      albums: state.albums.filter((album) => album.id !== id),
    }));
  },

  renamePlaylist(id, name) {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    set((state) => ({
      playlists: state.playlists.map((playlist) =>
        playlist.id === id ? { ...playlist, name: trimmed } : playlist,
      ),
    }));
  },

  deletePlaylist(id) {
    set((state) => ({
      playlists: state.playlists.filter((playlist) => playlist.id !== id),
    }));
  },

  renameTrack(id, title) {
    const trimmed = title.trim();
    if (!trimmed) {
      return;
    }
    const previous = get().getTrack(id);
    if (!previous) {
      return;
    }
    const nextSource = sourceFileNameFromTitle(trimmed, previous.sourceFileName);
    const oldSource = previous.sourceFileName ?? `${previous.title}.mp3`;
    const nameChanged =
      oldSource.toLowerCase() !== nextSource.toLowerCase();
    set((state) => ({
      tracks: state.tracks.map((track) =>
        track.id === id ? { ...track, title: trimmed, sourceFileName: nextSource } : track,
      ),
    }));
    const track = get().getTrack(id);
    const markers = get().markersByTrackId[id] ?? [];
    void import('./playerStore').then(({ usePlayerStore }) => {
      const playing = usePlayerStore.getState().track;
      if (playing.id === id) {
        usePlayerStore.setState({
          track: { ...playing, title: trimmed, sourceFileName: nextSource },
        });
      }
    });
    if (!nameChanged) {
      persistSidecar(track, markers);
      return;
    }
    removeSidecarFromLibrary(oldSource, sidecarSlug());
    if (!track) {
      return;
    }
    void writeSidecarToLibrary(track, markers, sidecarSlug())
      .then(() =>
        import('../cloud/syncEngine').then((mod) => mod.followTrackRenameOnDrive(id, oldSource)),
      )
      .catch(() => undefined);
  },

  setTrackArtwork(id, artworkUri) {
    const previous = get().getTrack(id)?.artworkUri;
    if (previous && previous !== artworkUri) {
      void removeUri(previous);
    }
    set((state) => ({
      tracks: state.tracks.map((track) =>
        track.id === id ? { ...track, artworkUri } : track,
      ),
    }));
    void import('./playerStore').then(({ refreshPlayingArtwork }) => {
      refreshPlayingArtwork(id);
    });
  },

  setTrackBounds(id, startMs, endMs) {
    set((state) => ({
      tracks: state.tracks.map((track) =>
        track.id === id ? { ...track, startMs, endMs } : track,
      ),
    }));
    const track = get().getTrack(id);
    persistSidecar(track, get().markersByTrackId[id] ?? []);
  },

  setTrackPractice(id, practice) {
    set((state) => ({
      tracks: state.tracks.map((track) =>
        track.id === id ? withPractice(track, practice) : track,
      ),
    }));
    const track = get().getTrack(id);
    persistSidecar(track, get().markersByTrackId[id] ?? []);
  },

  async deleteTrack(id) {
    const track = get().getTrack(id);
    if (track) {
      removeSidecarFromLibrary(track.sourceFileName ?? track.title, sidecarSlug());
    }
    await removeUri(track?.fileUri);
    await removeUri(track?.inboxUri);
    await removeUri(track?.artworkUri);
    set((state) => ({
      tracks: state.tracks.filter((track) => track.id !== id),
      folders: state.folders.map((folder) => ({
        ...folder,
        trackIds: folder.trackIds.filter((trackId) => trackId !== id),
      })),
      albums: state.albums.map((album) => ({
        ...album,
        trackIds: album.trackIds.filter((trackId) => trackId !== id),
      })),
      playlists: state.playlists.map((playlist) => ({
        ...playlist,
        trackIds: playlist.trackIds.filter((trackId) => trackId !== id),
      })),
      markersByTrackId: Object.fromEntries(
        Object.entries(state.markersByTrackId).filter(([key]) => key !== id),
      ),
      peaksByTrackId: Object.fromEntries(
        Object.entries(state.peaksByTrackId).filter(([key]) => key !== id),
      ),
    }));
    const { clearPlayerIfTrackDeleted } = require('./playerStore') as typeof import('./playerStore');
    clearPlayerIfTrackDeleted(id);
  },

  moveTrack(trackId, folderId) {
    set((state) => ({
      folders: state.folders.map((folder) => {
        const without = folder.trackIds.filter((id) => id !== trackId);
        if (folder.id === folderId) {
          return { ...folder, trackIds: [...without, trackId] };
        }
        return { ...folder, trackIds: without };
      }),
    }));
  },

  addTrackToFolder(trackId, folderId) {
    const folder = get().folders.find((item) => item.id === folderId);
    if (!folder) {
      return 'exists';
    }
    if (folder.trackIds.includes(trackId)) {
      return 'exists';
    }
    set((state) => ({
      folders: state.folders.map((item) =>
        item.id === folderId ? { ...item, trackIds: [...item.trackIds, trackId] } : item,
      ),
    }));
    return 'added';
  },

  importBundles(bundles, dest = {}) {
    if (bundles.length === 0) {
      return;
    }
    const folderId = dest.folderId ?? null;
    const albumId = dest.albumId;
    const ids = bundles.map((bundle) => bundle.track.id);
    set((state) => {
      const nextMarkers = { ...state.markersByTrackId };
      for (const bundle of bundles) {
        nextMarkers[bundle.track.id] = bundle.markers;
      }
      return {
        tracks: [...state.tracks, ...bundles.map((bundle) => bundle.track)],
        markersByTrackId: nextMarkers,
        folders:
          folderId == null
            ? state.folders
            : state.folders.map((folder) =>
                folder.id === folderId
                  ? { ...folder, trackIds: [...folder.trackIds, ...ids] }
                  : folder,
              ),
        albums: albumId
          ? state.albums.map((album) =>
              album.id === albumId ? { ...album, trackIds: [...album.trackIds, ...ids] } : album,
            )
          : state.albums,
      };
    });
    for (const bundle of bundles) {
      persistSidecar(bundle.track, bundle.markers);
    }
  },

  addTracksToAlbum(albumId, trackIds) {
    set((state) => ({
      albums: state.albums.map((album) =>
        album.id === albumId
          ? { ...album, trackIds: [...album.trackIds, ...trackIds.filter((id) => !album.trackIds.includes(id))] }
          : album,
      ),
    }));
  },

  replaceTrackFile(trackId, fileUri, keepMarkerIds) {
    const keep = new Set(keepMarkerIds);
    const now = Date.now();
    set((state) => {
      const current = state.markersByTrackId[trackId] ?? [];
      const nextMarkers = current.map((marker) =>
        keep.has(marker.id) ? marker : { ...marker, hidden: true, updatedAt: now },
      );
      return {
        tracks: state.tracks.map((track) =>
          track.id === trackId
            ? { ...track, fileUri, downloaded: true, downloadedAt: Date.now() }
            : track,
        ),
        markersByTrackId: { ...state.markersByTrackId, [trackId]: nextMarkers },
        peaksByTrackId: Object.fromEntries(
          Object.entries(state.peaksByTrackId).filter(([id]) => id !== trackId),
        ),
      };
    });
    persistSidecar(get().getTrack(trackId), get().markersByTrackId[trackId] ?? []);
  },

  async downloadTrack(trackId) {
    const track = get().getTrack(trackId);
    if (!track || get().downloadingIds[trackId] != null) {
      return;
    }
    const source = playableUri(track);
    if (!source) {
      throw new Error('Nessun file da scaricare');
    }
    if (track.downloaded && track.fileUri) {
      return;
    }
    set((state) => ({
      downloadingIds: { ...state.downloadingIds, [trackId]: 0 },
    }));
    try {
      const fileUri = await copyToDownloads(
        source,
        track.id,
        track.sourceFileName ?? `${track.title}.m4a`,
      );
      set((state) => {
        const { [trackId]: _, ...rest } = state.downloadingIds;
        return {
          downloadingIds: rest,
          tracks: state.tracks.map((item) =>
            item.id === trackId
              ? { ...item, fileUri, downloaded: true, downloadedAt: Date.now() }
              : item,
          ),
        };
      });
    } catch (error) {
      set((state) => {
        const { [trackId]: _, ...rest } = state.downloadingIds;
        return { downloadingIds: rest };
      });
      throw error;
    }
  },

  async removeDownload(trackId) {
    const track = get().getTrack(trackId);
    if (!track?.fileUri) {
      return;
    }
    await removeUri(track.fileUri);
    set((state) => ({
      tracks: state.tracks.map((item) =>
        item.id === trackId
          ? { ...item, fileUri: undefined, downloaded: false, downloadedAt: undefined }
          : item,
      ),
    }));
  },

  async downloadAlbum(albumId) {
    const tracks = get().tracksIn('album', albumId);
    for (const track of tracks) {
      if (track.downloaded && track.fileUri) {
        continue;
      }
      await get().downloadTrack(track.id);
    }
  },

  setTrackPeaks(id, peaks) {
    set((state) => ({
      peaksByTrackId: { ...state.peaksByTrackId, [id]: peaks },
    }));
  },

  updateTrackDuration(id, durationMs) {
    set((state) => ({
      tracks: state.tracks.map((track) =>
        track.id === id ? { ...track, durationMs } : track,
      ),
    }));
  },

  createSmartPlaylist(playlist) {
    const id = createId('smart');
    set((state) => ({
      smartPlaylists: [...state.smartPlaylists, { ...playlist, id }],
    }));
    return id;
  },

  updateSmartPlaylist(playlist) {
    set((state) => ({
      smartPlaylists: state.smartPlaylists.map((item) =>
        item.id === playlist.id ? playlist : item,
      ),
    }));
  },

  setCollectionOrder(kind, id, trackIds, extras = {}) {
    if (kind === 'smart') {
      return;
    }
    const updatedAt = extras.updatedAt ?? Date.now();
    const currentIds =
      kind === 'folder'
        ? get().folders.find((folder) => folder.id === id)?.trackIds
        : kind === 'playlist'
          ? get().playlists.find((playlist) => playlist.id === id)?.trackIds
          : get().albums.find((album) => album.id === id)?.trackIds;
    const nextIds =
      kind === 'album' && extras.fromCloud && currentIds
        ? mergeAlbumOrderFromCloud(currentIds, trackIds)
        : trackIds;
    const same = (current: string[]) =>
      current.length === nextIds.length && current.every((trackId, index) => trackId === nextIds[index]);
    if (currentIds && same(currentIds) && !extras.fromCloud) {
      return;
    }
    set((state) => {
      if (kind === 'folder') {
        return {
          folders: state.folders.map((folder) =>
            folder.id === id && !same(folder.trackIds) ? { ...folder, trackIds: nextIds } : folder,
          ),
        };
      }
      if (kind === 'playlist') {
        return {
          playlists: state.playlists.map((playlist) =>
            playlist.id === id && !same(playlist.trackIds) ? { ...playlist, trackIds: nextIds } : playlist,
          ),
        };
      }
      return {
        albums: state.albums.map((album) =>
          album.id === id
            ? { ...album, trackIds: nextIds, orderUpdatedAt: updatedAt }
            : album,
        ),
      };
    });
    if (kind === 'album' && !extras.fromCloud) {
      void import('../cloud/syncEngine').then((mod) => mod.pushAlbumOrder(id)).catch(() => undefined);
    }
  },

  deleteSmartPlaylist(id) {
    set((state) => ({
      smartPlaylists: state.smartPlaylists.filter((item) => item.id !== id),
    }));
  },

  async hydrate() {
    if (libraryHydratePromise) {
      return libraryHydratePromise;
    }
    const run = async () => {
      let hadSnapshot = false;
      try {
        const snapshot = await loadLibrarySnapshot({ quick: true });
        hadSnapshot = snapshot != null;
        set({
          tracks: snapshot?.tracks ?? [],
          folders: snapshot?.folders ?? [],
          albums: snapshot?.albums ?? [],
          playlists: snapshot?.playlists ?? [],
          smartPlaylists: snapshot?.smartPlaylists ?? [],
          markersByTrackId: snapshot?.markersByTrackId ?? {},
        });
        persistReady = true;
        await finishLibraryHydrate(hadSnapshot);
      } finally {
        set({ libraryHydrated: true });
      }
    };
    libraryHydratePromise = run();
    return libraryHydratePromise;
  },

  getTrack(id) {
    return get().tracks.find((track) => track.id === id);
  },

  tracksIn(kind, id) {
    const { tracks, folders, albums, playlists, smartPlaylists, markersByTrackId } = get();
    if (kind === 'smart') {
      const smart = smartPlaylists.find((item) => item.id === id);
      if (!smart) {
        return [];
      }
      return tracks.filter((track) =>
        trackMatchesSmart(track, markersByTrackId[track.id] ?? [], smart),
      );
    }
    const collection =
      kind === 'folder'
        ? folders.find((item) => item.id === id)
        : kind === 'album'
          ? albums.find((item) => item.id === id)
          : playlists.find((item) => item.id === id);
    if (!collection) {
      return [];
    }
    return collection.trackIds
      .map((trackId) => tracks.find((track) => track.id === trackId))
      .filter((track): track is Track => track != null);
  },

  foldersIn(parentId) {
    return get().folders.filter((folder) => folder.parentId === parentId);
  },

  folderDescendants(id) {
    const { folders } = get();
    const result = new Set<string>();
    const visit = (parent: string) => {
      for (const folder of folders) {
        if (folder.parentId === parent && !result.has(folder.id)) {
          result.add(folder.id);
          visit(folder.id);
        }
      }
    };
    visit(id);
    return result;
  },
}));

useLibraryStore.subscribe(schedulePersist);

async function finishLibraryHydrate(hadSnapshot: boolean) {
  try {
    const cleaned = sanitizeSnapshot(snapshotFrom(useLibraryStore.getState()));
    useLibraryStore.setState({
      tracks: cleaned.tracks,
      folders: cleaned.folders,
      albums: cleaned.albums,
      playlists: cleaned.playlists,
      smartPlaylists: cleaned.smartPlaylists,
      markersByTrackId: cleaned.markersByTrackId,
    });
    const { tracks, markersByTrackId: currentMarkers } = useLibraryStore.getState();
    const migrated = await migrateTracksToAudioFolder(tracks);
    const extras = await scanAudioFolder(migrated);
    const markersByTrackId = { ...currentMarkers };
    for (const bundle of extras) {
      markersByTrackId[bundle.track.id] = bundle.markers;
    }
    useLibraryStore.setState({
      tracks: [...migrated, ...extras.map((bundle) => bundle.track)],
      markersByTrackId,
    });
    if (extras.length > 0 || hadSnapshot) {
      schedulePersist();
    }
  } catch {
    // file system busy (iCloud, Files) — keep snapshot already loaded
  }
}
