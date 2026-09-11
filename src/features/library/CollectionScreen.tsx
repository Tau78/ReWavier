import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  peekDriveAlbum,
  refreshAlbumDriveRole,
  syncDriveAlbum,
  type DriveAlbumPeek,
  type SyncDriveAlbumResult,
} from '../../cloud/syncEngine';
import { canWriteWithRole, folderRoleLine, roleOfAlbum } from '../../domain/folderRole';
import { orderedAlbumItemIds } from '../../domain/albumOrder';
import { playableAlbumTrackIds, versionFolderById, type AlbumListReorderItem } from '../../domain/albumVersions';
import { isDownloaded } from '../../domain/audioFormats';
import {
  collectionDownloadGlyph,
  collectionDownloadLabel,
  collectionDownloadVisual,
  isDownloadPausedError,
} from '../../domain/collectionDownloadVisual';
import type { Album, AlbumVersionFolder, CollectionKind } from '../../domain/library';
import { collectionResumeKey } from '../../domain/playbackResume';
import { isSeparatorId, isVersionFolderId } from '../../domain/library';
import type { Track } from '../../domain/models';
import { recoverAudioRelative } from '../../files/libraryUris';
import { hydratePlaybackPersist } from '../../files/playbackPersist';
import type { RootStackParamList } from '../../navigation/types';
import { isCollectionDownloadBusy, useDownloadProgressStore } from '../../store/downloadProgressStore';
import { flushLibraryPersist, useLibraryStore } from '../../store/libraryStore';
import { usePlayerStore } from '../../store/playerStore';
import { useSyncStore } from '../../store/syncStore';
import { colors, layout } from '../../theme/colors';
import { EmptyGraphic, KindRow } from '../../theme/graphics';
import { CollectionMarkers } from './CollectionMarkers';
import { AlbumHero } from './AlbumHero';
import { AlbumDocuments } from './AlbumDocuments';
import { AlbumNotes } from './AlbumNotes';
import { AlbumSeparatorRow, SEPARATOR_ROW_HEIGHT } from './AlbumSeparatorRow';
import { CollectionPlayer } from './CollectionPlayer';
import { ensurePlayableAndOpen, playQueue, restoreCollectionPlayback } from './openTrack';
import { ReorderableTrackList } from './ReorderableTrackList';
import { TrackRow } from './TrackRow';
import { VersionFolderRow } from './VersionFolderRow';
import { useLibraryActions } from './useLibraryActions';

type ListItem =
  | { id: string; type: 'track'; track: Track; rowHeight?: number; draggable?: boolean }
  | { id: string; type: 'separator'; name: string; rowHeight: number; draggable?: boolean }
  | {
      id: string;
      type: 'versions';
      folder: AlbumVersionFolder;
      rowHeight?: number;
      draggable?: boolean;
    }
  | {
      id: string;
      type: 'version-track';
      track: Track;
      folderId: string;
      rowHeight?: number;
      draggable?: boolean;
    };

const VERSION_HEADER_ROW = 60;

function albumListItems(
  album: Album,
  tracks: Track[],
  openVersionIds: Record<string, boolean>,
): ListItem[] {
  const byId = new Map(tracks.map((track) => [track.id, track]));
  const names = new Map((album.separators ?? []).map((item) => [item.id, item.name]));
  const items: ListItem[] = [];
  for (const itemId of orderedAlbumItemIds(album, tracks)) {
    const name = names.get(itemId);
    if (name != null || isSeparatorId(itemId)) {
      items.push({
        id: itemId,
        type: 'separator',
        name: name ?? 'Separatore',
        rowHeight: SEPARATOR_ROW_HEIGHT,
      });
      continue;
    }
    const folder = versionFolderById(album, itemId);
    if (folder) {
      const open = openVersionIds[folder.id] === true;
      items.push({
        id: itemId,
        type: 'versions',
        folder,
        rowHeight: VERSION_HEADER_ROW,
        // Open headers stay put so children are not orphaned; close the cartella to move the pack.
        draggable: !open,
      });
      if (open) {
        for (const trackId of folder.trackIds) {
          const track = byId.get(trackId);
          if (track) {
            items.push({
              id: track.id,
              type: 'version-track',
              track,
              folderId: folder.id,
            });
          }
        }
      }
      continue;
    }
    if (isVersionFolderId(itemId)) {
      continue;
    }
    const track = byId.get(itemId);
    if (track) {
      items.push({ id: itemId, type: 'track', track });
    }
  }
  return items;
}

type Nav = NativeStackNavigationProp<RootStackParamList, 'Collection'>;
type Route = RouteProp<RootStackParamList, 'Collection'>;

const KIND_LABEL: Record<CollectionKind, string> = {
  folder: 'Playlist',
  album: 'Album',
  playlist: 'Playlist',
  smart: 'Condizioni',
};

export function CollectionScreen() {
  const navigation = useNavigation<Nav>();
  const { kind, id } = useRoute<Route>().params;
  const folders = useLibraryStore((s) => s.folders);
  const albums = useLibraryStore((s) => s.albums);
  const playlists = useLibraryStore((s) => s.playlists);
  const smartPlaylists = useLibraryStore((s) => s.smartPlaylists);
  const markersByTrackId = useLibraryStore((s) => s.markersByTrackId);
  const allTracks = useLibraryStore((s) => s.tracks);
  const downloadingIds = useLibraryStore((s) => s.downloadingIds);
  const tracks = useMemo(
    () => useLibraryStore.getState().tracksIn(kind, id),
    [kind, id, folders, albums, playlists, smartPlaylists, markersByTrackId, allTracks],
  );
  const childFolders = useMemo(
    () => (kind === 'folder' ? folders.filter((folder) => folder.parentId === id) : []),
    [kind, id, folders],
  );
  const actions = useLibraryActions(kind === 'folder' ? id : null, (openedKind, openedId) => {
    navigation.push('Collection', { kind: openedKind, id: openedId });
  });

  const title =
    kind === 'folder'
      ? folders.find((item) => item.id === id)?.name
      : kind === 'album'
        ? albums.find((item) => item.id === id)?.name
        : kind === 'playlist'
          ? playlists.find((item) => item.id === id)?.name
          : smartPlaylists.find((item) => item.id === id)?.name;

  const [dragging, setDragging] = useState(false);
  const [openVersionIds, setOpenVersionIds] = useState<Record<string, boolean>>({});
  const album = kind === 'album' ? albums.find((item) => item.id === id) : undefined;
  const albumWritable = canWriteWithRole(roleOfAlbum(album));
  const canReorder = kind !== 'smart' && albumWritable;
  const isDriveAlbum = album?.origin === 'drive';
  const syncStatus = useSyncStore((s) => s.status);
  const syncMessage = useSyncStore((s) => s.message);
  const [pulling, setPulling] = useState(false);
  const [peeking, setPeeking] = useState(false);
  /** True while Aggiorna is checking Drive / importing — drives button spinner + hint. */
  const [albumRefreshBusy, setAlbumRefreshBusy] = useState(false);
  const albumRefreshJobRef = useRef<Promise<void> | null>(null);
  const peekJobRef = useRef<Promise<DriveAlbumPeek> | null>(null);
  const heldFileUriRef = useRef<Map<string, string>>(new Map());
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const downloadActive = useDownloadProgressStore((s) => s.active);
  const downloadMode = useDownloadProgressStore((s) => s.mode);
  const downloadQueueIds = useDownloadProgressStore((s) => s.queueIds);
  const driveNews = useDownloadProgressStore((s) => s.driveNewsById[id] ?? 0);
  const collectionBusy = downloadActive && downloadMode === 'collection';
  const blockedIds = useMemo(
    () => (collectionBusy ? new Set(downloadQueueIds) : new Set<string>()),
    [collectionBusy, downloadQueueIds],
  );
  const peekAlbum = useCallback(async (): Promise<DriveAlbumPeek> => {
    const empty: DriveAlbumPeek = { newRemoteCount: 0, changedTrackIds: [] };
    // Allow peek while syncing — returning empty made Aggiorna look dead.
    if (!isDriveAlbum || isCollectionDownloadBusy()) {
      return empty;
    }
    if (peekJobRef.current) {
      return peekJobRef.current;
    }
    const job = (async () => {
      if (mountedRef.current) {
        setPeeking(true);
      }
      try {
        await flushLibraryPersist();
        useLibraryStore.getState().reattachLocalAudio();
        return await peekDriveAlbum(id);
      } finally {
        if (mountedRef.current) {
          setPeeking(false);
        }
      }
    })();
    peekJobRef.current = job;
    try {
      return await job;
    } finally {
      if (peekJobRef.current === job) {
        peekJobRef.current = null;
      }
    }
  }, [isDriveAlbum, id]);
  const autoUpdateJobRef = useRef<Promise<void> | null>(null);
  const downloadPendingUpdates = useCallback(async (trackIds: string[]) => {
    const playingId = usePlayerStore.getState().track.id;
    const ids = [...new Set(trackIds.filter(Boolean))].filter((trackId) => trackId !== playingId);
    const skippedPlaying = Boolean(playingId && trackIds.includes(playingId));
    if (ids.length === 0 || isCollectionDownloadBusy()) {
      if (skippedPlaying && ids.length === 0) {
        Alert.alert(
          'Aggiorna',
          'Il brano in ascolto non è stato aggiornato. Quando lo fermi, tocca di nuovo Aggiorna.',
        );
      }
      return;
    }
    const progress = useDownloadProgressStore.getState();
    progress.beginCollection(ids);
    try {
      for (const trackId of ids) {
        if (useDownloadProgressStore.getState().pauseRequested) {
          break;
        }
        await useLibraryStore.getState().downloadTrack(trackId, { replace: true });
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    } finally {
      progress.end();
    }
    if (skippedPlaying) {
      Alert.alert(
        'Aggiorna',
        'Il brano in ascolto non è stato aggiornato. Quando lo fermi, tocca di nuovo Aggiorna.',
      );
    }
  }, []);
  const refreshFromDrive = useCallback(async () => {
    try {
      const peek = await peekAlbum();
      // Peek only counts new remotes — import them or the album never grows.
      if (peek.newRemoteCount > 0) {
        await syncDriveAlbum(id);
        void peekDriveAlbum(id).catch(() => undefined);
      }
      const albumTrackIds = new Set(
        useLibraryStore.getState().tracksIn(kind === 'folder' ? 'folder' : 'album', id).map((track) => track.id),
      );
      const pendingIds = [
        ...peek.changedTrackIds,
        ...useLibraryStore
          .getState()
          .tracks.filter((track) => track.pendingRemoteUpdate === true && albumTrackIds.has(track.id))
          .map((track) => track.id),
      ];
      const uniquePending = [...new Set(pendingIds)];
      if (uniquePending.length === 0 || autoUpdateJobRef.current) {
        return;
      }
      const job = (async () => {
        try {
          await downloadPendingUpdates(uniquePending);
        } catch (error) {
          if (!isDownloadPausedError(error)) {
            Alert.alert(
              'Download',
              error instanceof Error ? error.message : 'Download non riuscito',
            );
          }
        } finally {
          if (isDriveAlbum) {
            void peekDriveAlbum(id).catch(() => undefined);
          }
        }
      })().finally(() => {
        if (autoUpdateJobRef.current === job) {
          autoUpdateJobRef.current = null;
        }
      });
      autoUpdateJobRef.current = job;
      await job;
    } catch (error) {
      Alert.alert(
        'Drive',
        error instanceof Error ? error.message : 'Non riesco a ricontrollare la cartella.',
      );
    }
  }, [peekAlbum, downloadPendingUpdates, kind, isDriveAlbum, id]);
  useFocusEffect(
    useCallback(() => {
      if (isDriveAlbum) {
        void refreshAlbumDriveRole(id);
        void refreshFromDrive();
      }
      return () => {
        // Drop in-flight UI flags if the user leaves before peek/pull finishes.
        if (mountedRef.current) {
          setPeeking(false);
          setPulling(false);
        }
      };
    }, [isDriveAlbum, id, refreshFromDrive]),
  );
  const displayTracks = useMemo(() => {
    const held = heldFileUriRef.current;
    const nextHeld = syncStatus === 'syncing' ? new Map(held) : new Map<string, string>();
    const mapped = tracks.map((track) => {
      const recovered = recoverAudioRelative(track);
      const fileUri =
        recovered.fileUri || (syncStatus === 'syncing' ? held.get(track.id) : undefined);
      if (fileUri) {
        nextHeld.set(track.id, fileUri);
        return {
          ...track,
          fileUri,
          inboxUri: recovered.inboxUri ?? track.inboxUri,
          downloaded: true,
        };
      }
      if (isDownloaded(track) && track.fileUri) {
        nextHeld.set(track.id, track.fileUri);
      }
      return track;
    });
    heldFileUriRef.current = nextHeld;
    return mapped;
  }, [tracks, syncStatus]);
  const listItems = useMemo<ListItem[]>(
    () =>
      album
        ? albumListItems(album, displayTracks, openVersionIds)
        : displayTracks.map((track) => ({ id: track.id, type: 'track' as const, track })),
    [album, displayTracks, openVersionIds],
  );
  const listItemsRef = useRef(listItems);
  listItemsRef.current = listItems;
  const trackIds = useMemo(
    () => (album ? playableAlbumTrackIds(album) : tracks.map((track) => track.id)),
    [album, tracks],
  );
  const collectionKey =
    kind === 'album' || kind === 'playlist' || kind === 'folder'
      ? collectionResumeKey(kind, id)
      : undefined;
  useFocusEffect(
    useCallback(() => {
      if (!collectionKey || trackIds.length === 0) {
        return;
      }
      let cancelled = false;
      void hydratePlaybackPersist().then(() => {
        if (!cancelled) {
          restoreCollectionPlayback(collectionKey, trackIds);
        }
      });
      return () => {
        cancelled = true;
      };
    }, [collectionKey, trackIds]),
  );
  const playerTrackId = usePlayerStore((s) => s.track.id);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const isPlayingThisAlbum =
    Boolean(album) && isPlaying && tracks.some((track) => track.id === playerTrackId);
  const subtitle =
    kind === 'album'
      ? album?.origin === 'drive'
        ? `Drive · ${album.trackIds.length} tracce`
        : album?.artist || `${album?.trackIds.length ?? 0} tracce`
      : kind === 'smart'
        ? `${smartPlaylists.find((item) => item.id === id)?.conditions?.length ?? 0} regole`
        : `${tracks.length} tracce`;

  const downloadKind = kind === 'folder' ? 'folder' : 'album';
  const downloadVisual = collectionDownloadVisual({
    active: collectionBusy,
    missingLocal: displayTracks.some((track) => !isDownloaded(track)),
    driveHasNews: driveNews > 0 || displayTracks.some((track) => track.pendingRemoteUpdate === true),
  });
  const downloadButtonBusy = albumRefreshBusy || collectionBusy;
  const alreadyHereMessage =
    kind === 'folder'
      ? 'Tutti i brani di questa playlist sono già qui.'
      : 'Tutti i brani di questo album sono già qui.';
  const reportCollectionError = (error: unknown) => {
    if (isDownloadPausedError(error)) {
      return;
    }
    Alert.alert('Download', error instanceof Error ? error.message : 'Download non riuscito');
  };
  const applyCollectionNews = (options?: { fromButton?: boolean }) => {
    const fromButton = options?.fromButton === true;
    const progress = useDownloadProgressStore.getState();
    if (progress.active && progress.mode === 'collection') {
      progress.requestPause();
      return;
    }
    if (albumRefreshJobRef.current) {
      return;
    }
    const job = (async () => {
      if (mountedRef.current) {
        setAlbumRefreshBusy(true);
      }
      const trackCountBefore = useLibraryStore
        .getState()
        .tracksIn(kind === 'folder' ? 'folder' : 'album', id).length;
      try {
        let syncResult: SyncDriveAlbumResult = {
          added: 0,
          removed: 0,
          versioned: 0,
          notesPulled: 0,
        };
        if (isDriveAlbum) {
          syncResult = await syncDriveAlbum(id);
        }
        if (!mountedRef.current) {
          return;
        }
        if (syncResult.skipped === 'no-google') {
          if (fromButton) {
            Alert.alert('Drive', 'Collega Google per aggiornare questo album.');
          }
          return;
        }
        if (useDownloadProgressStore.getState().pauseRequested) {
          return;
        }
        const playingId = usePlayerStore.getState().track.id;
        const inAlbum = new Set(
          useLibraryStore
            .getState()
            .tracksIn(kind === 'folder' ? 'folder' : 'album', id)
            .map((track) => track.id),
        );
        const pendingAll = useLibraryStore
          .getState()
          .tracks.filter(
            (track) =>
              inAlbum.has(track.id) &&
              (!isDownloaded(track) || track.pendingRemoteUpdate === true),
          );
        const skippedPlaying = Boolean(
          playingId && pendingAll.some((track) => track.id === playingId),
        );
        const pending = pendingAll.filter((track) => track.id !== playingId);
        let didDownload = false;
        if (pending.length > 0) {
          progress.beginCollection(pending.map((track) => track.id));
          try {
            if (!useDownloadProgressStore.getState().pauseRequested) {
              await useLibraryStore.getState().downloadCollection(downloadKind, id, {
                reuseSession: true,
              });
              didDownload = true;
            }
          } finally {
            progress.end();
          }
        }
        if (isDriveAlbum) {
          void peekDriveAlbum(id).catch(() => undefined);
        }
        if (!mountedRef.current || !fromButton) {
          return;
        }
        const trackCountAfter = useLibraryStore
          .getState()
          .tracksIn(kind === 'folder' ? 'folder' : 'album', id).length;
        const addedNow = Math.max(syncResult.added, trackCountAfter - trackCountBefore);
        if (skippedPlaying) {
          Alert.alert(
            'Aggiorna',
            'Il brano in ascolto non è stato aggiornato. Quando lo fermi, tocca di nuovo Aggiorna.',
          );
          return;
        }
        if (addedNow > 0) {
          Alert.alert(
            'Drive',
            addedNow === 1
              ? 'Ho aggiunto 1 brano nuovo dall’album su Drive.'
              : `Ho aggiunto ${addedNow} brani nuovi dall’album su Drive.`,
          );
          return;
        }
        if (didDownload || syncResult.versioned > 0) {
          Alert.alert('Drive', 'Album aggiornato. I brani nuovi o modificati sono sul telefono.');
          return;
        }
        if (syncResult.notesPulled > 0) {
          Alert.alert(
            'Drive',
            syncResult.notesPulled === 1
              ? 'Ho portato 1 appunto nuovo dai compagni.'
              : `Ho portato ${syncResult.notesPulled} appunti nuovi dai compagni.`,
          );
          return;
        }
        Alert.alert('Sul telefono', alreadyHereMessage);
      } catch (error) {
        useDownloadProgressStore.getState().end();
        if (mountedRef.current) {
          reportCollectionError(error);
        }
      } finally {
        if (mountedRef.current) {
          setAlbumRefreshBusy(false);
        }
      }
    })().finally(() => {
      if (albumRefreshJobRef.current === job) {
        albumRefreshJobRef.current = null;
      }
    });
    albumRefreshJobRef.current = job;
  };
  const startCollectionDownload = () => {
    if (downloadVisual === 'pause') {
      useDownloadProgressStore.getState().requestPause();
      return;
    }
    if (downloadButtonBusy) {
      return;
    }
    // Drive album: always run full check+import (✓ used to only peek and skip new files).
    if (isDriveAlbum && (downloadVisual === 'done' || downloadVisual === 'update')) {
      applyCollectionNews({ fromButton: true });
      return;
    }
    if (displayTracks.length === 0) {
      Alert.alert('Download', 'Non c’è nessun brano da scaricare.');
      return;
    }
    void useLibraryStore
      .getState()
      .downloadCollection(downloadKind, id)
      .catch(reportCollectionError);
  };
  const downloadGlyph = collectionDownloadGlyph(downloadVisual);
  const downloadLabel = collectionDownloadLabel(downloadVisual, downloadKind);
  const warnBlocked = () => {
    Alert.alert('Ascolto', 'Aspetta: questo brano si sta aggiornando.');
  };

  const playAlbum = () => {
    if (isPlayingThisAlbum) {
      usePlayerStore.getState().pause();
      return;
    }
    if (playerTrackId && tracks.some((track) => track.id === playerTrackId)) {
      usePlayerStore.getState().play();
      return;
    }
    void hydratePlaybackPersist().then(() => {
      if (playQueue(trackIds, collectionKey ? { collectionKey } : undefined)) {
        return;
      }
      Alert.alert(
        'Ascolto',
        tracks.length === 0
          ? 'Questo album è vuoto. Aggiungi un audio e poi tocca Play.'
          : 'Nessuna traccia è ancora ascoltabile. Scaricala sul telefono e riprova.',
      );
    });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={layout.hitSlop}
          accessibilityRole="button"
          accessibilityLabel="Indietro"
        >
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <View style={styles.headerText}>
          <KindRow label={KIND_LABEL[kind]} />
          {kind === 'album' ? null : (
            <>
              <Text style={styles.title} numberOfLines={1}>
                {title ?? 'Senza nome'}
              </Text>
              <Text style={styles.subtitle}>{subtitle}</Text>
            </>
          )}
        </View>
        {kind === 'smart' ? (
          <Pressable
            onPress={() => navigation.navigate('Conditions', { id })}
            hitSlop={layout.hitSlop}
          >
            <Text style={styles.edit}>Modifica</Text>
          </Pressable>
        ) : kind === 'album' ? (
          <View style={styles.headerButtons}>
            <Pressable
              onPress={startCollectionDownload}
              style={({ pressed }) => [styles.plus, pressed && styles.plusPressed]}
              accessibilityRole="button"
              accessibilityLabel={
                downloadButtonBusy
                  ? albumRefreshBusy && !collectionBusy
                    ? 'Sto controllando Drive'
                    : 'Download in corso'
                  : downloadLabel
              }
              disabled={downloadButtonBusy && downloadVisual !== 'pause'}
            >
              {downloadButtonBusy && downloadVisual !== 'pause' ? (
                <ActivityIndicator color={colors.accent} />
              ) : (
                <Text
                  style={[
                    styles.plusGlyph,
                    downloadVisual === 'pause' && styles.pauseGlyph,
                    downloadVisual === 'done' && styles.downloadDone,
                  ]}
                >
                  {downloadGlyph}
                </Text>
              )}
            </Pressable>
            <Pressable
              onPress={() => actions.openAlbumMenu(id)}
              style={({ pressed }) => [styles.plus, pressed && styles.plusPressed]}
              accessibilityRole="button"
              accessibilityLabel="Album"
            >
              <Text style={styles.plusGlyph}>＋</Text>
            </Pressable>
          </View>
        ) : kind === 'folder' ? (
          <View style={styles.headerButtons}>
            <Pressable
              onPress={startCollectionDownload}
              style={({ pressed }) => [styles.plus, pressed && styles.plusPressed]}
              accessibilityRole="button"
              accessibilityLabel={downloadLabel}
            >
              <Text
                style={[
                  styles.plusGlyph,
                  downloadVisual === 'pause' && styles.pauseGlyph,
                  downloadVisual === 'done' && styles.downloadDone,
                ]}
              >
                {downloadGlyph}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => actions.openFolderCreateMenu()}
              style={({ pressed }) => [styles.plus, pressed && styles.plusPressed]}
              accessibilityRole="button"
              accessibilityLabel="Nuovo"
            >
              <Text style={styles.plusGlyph}>＋</Text>
            </Pressable>
          </View>
        ) : kind === 'playlist' ? (
          <Pressable
            onPress={() => actions.openPlaylistMenu(id)}
            style={({ pressed }) => [styles.plus, pressed && styles.plusPressed]}
            accessibilityRole="button"
            accessibilityLabel="Playlist"
          >
            <Text style={styles.plusGlyph}>⋯</Text>
          </Pressable>
        ) : (
          <View style={styles.editSpacer} />
        )}
      </View>

      <View style={styles.scrollHost}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        scrollEnabled={!dragging}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={
          isDriveAlbum ? (
            <RefreshControl
              refreshing={pulling}
              onRefresh={() => {
                if (!mountedRef.current || albumRefreshBusy || albumRefreshJobRef.current) {
                  return;
                }
                setPulling(true);
                // Full album refresh (import new + download changes), not peek-only.
                applyCollectionNews({ fromButton: false });
                const wait = albumRefreshJobRef.current;
                void (wait ?? Promise.resolve()).finally(() => {
                  if (mountedRef.current) {
                    setPulling(false);
                  }
                });
              }}
              tintColor={colors.accent}
              colors={[colors.accent]}
            />
          ) : undefined
        }
      >
        {album ? (
          <AlbumHero
            album={album}
            trackCount={tracks.length}
            isPlayingThisAlbum={isPlayingThisAlbum}
            onPlay={playAlbum}
          />
        ) : null}
        {album?.driveFolderId ? (
          <Text style={[styles.hint, styles.hintInScroll, styles.roleLine]}>
            {folderRoleLine(roleOfAlbum(album))}
          </Text>
        ) : null}
        {album ? <Text style={styles.sectionLabel}>Tracce</Text> : null}
        {isDriveAlbum ? (
          <Text style={[styles.hint, styles.hintInScroll]}>
            {albumRefreshBusy || syncStatus === 'syncing' || peeking
              ? collectionBusy
                ? 'Sto scaricando i brani sul telefono…'
                : 'Sto controllando la cartella Drive…'
              : downloadVisual === 'update'
                ? 'C’è qualcosa di nuovo su Drive. Tocca Aggiorna in alto a destra.'
                : syncMessage?.startsWith('Album aggiornato')
                  ? syncMessage
                  : 'Tocca Aggiorna in alto a destra, o trascina in basso, per cercare i brani nuovi.'}
          </Text>
        ) : null}
        {canReorder && listItems.length > 1 ? (
          <Text style={[styles.hint, album && styles.hintInScroll]}>
            {album
              ? 'Tieni premuto e trascina per riordinare. Porta un brano fuori dalla cartella di versioni per staccarlo. Porta un brano sopra un altro per metterli insieme.'
              : 'Tieni premuto una traccia e trascinala per riordinare.'}
          </Text>
        ) : null}
        {canReorder && listItems.length > 1 ? (
          <Pressable
            onPress={() => useLibraryStore.getState().sortCollectionAlphabetically(kind, id)}
            style={({ pressed }) => [styles.sortBtn, pressed && styles.sortBtnPressed]}
            accessibilityRole="button"
            accessibilityLabel="Riordina in ordine alfabetico"
          >
            <Text style={styles.sortGlyph}>A→Z</Text>
            <Text style={styles.sortLabel}>Ordina per nome</Text>
          </Pressable>
        ) : null}
        {childFolders.length > 0 ? (
          <View style={[styles.card, styles.cardGap]}>
            {childFolders.map((folder) => (
              <Pressable
                key={folder.id}
                onPress={() => navigation.push('Collection', { kind: 'folder', id: folder.id })}
                onLongPress={() => actions.openFolderMenu(folder)}
                delayLongPress={280}
                style={styles.subfolder}
              >
                <Text style={styles.subfolderName}>{folder.name}</Text>
                <Text style={styles.subfolderMeta}>{folder.trackIds.length} tracce</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <View style={styles.card}>
          {listItems.length === 0 ? (
            <View style={styles.emptyBox}>
              <EmptyGraphic />
              <Text style={styles.empty}>
                {kind === 'smart'
                  ? 'Nessuna traccia soddisfa queste condizioni.'
                  : 'Questa raccolta è vuota. Tieni premuto per i comandi, o importa un audio.'}
              </Text>
            </View>
          ) : (
            <ReorderableTrackList
              items={listItems}
              enabled={canReorder}
              onDraggingChange={setDragging}
              onReorder={(itemIds) => {
                if (!album) {
                  useLibraryStore.getState().setCollectionOrder(kind, id, itemIds);
                  return;
                }
                const meta = new Map(listItemsRef.current.map((item) => [item.id, item]));
                const reorderItems: AlbumListReorderItem[] = itemIds.map((itemId) => {
                  const item = meta.get(itemId);
                  if (item?.type === 'version-track') {
                    return { id: itemId, kind: 'version-track', folderId: item.folderId };
                  }
                  return { id: itemId, kind: 'top' };
                });
                useLibraryStore.getState().reorderAlbumList(id, reorderItems);
              }}
              onDropOn={
                album
                  ? (sourceId, targetId) =>
                      useLibraryStore.getState().dropAlbumVersion(album.id, sourceId, targetId)
                  : undefined
              }
              renderItem={(item) =>
                item.type === 'separator' ? (
                  <AlbumSeparatorRow
                    name={item.name}
                    onPress={() => actions.openSeparatorMenu(id, item.id, item.name)}
                  />
                ) : item.type === 'versions' ? (
                  <VersionFolderRow
                    folder={item.folder}
                    tracks={item.folder.trackIds
                      .map((trackId) => tracks.find((track) => track.id === trackId))
                      .filter((track): track is Track => track != null)}
                    open={openVersionIds[item.folder.id] === true}
                    embedChildren={false}
                    swipeEnabled={!dragging}
                    playerTrackId={playerTrackId}
                    noteCountOf={(trackId) =>
                      (markersByTrackId[trackId] ?? []).filter((marker) => marker.hidden !== true).length
                    }
                    downloadingOf={(trackId) => downloadingIds[trackId] != null}
                    blockedOf={(trackId) => blockedIds.has(trackId)}
                    onToggle={() =>
                      setOpenVersionIds((current) => ({
                        ...current,
                        [item.folder.id]: !current[item.folder.id],
                      }))
                    }
                    onPlayChosen={() => {
                      const chosenId = item.folder.chosenId;
                      if (blockedIds.has(chosenId)) {
                        warnBlocked();
                        return;
                      }
                      void ensurePlayableAndOpen(chosenId, trackIds, {
                        autoPlay: true,
                        resumeKey: collectionKey,
                      }).then((opened) => {
                        if (!opened) {
                          Alert.alert('Ascolto', 'Questo brano non è ancora arrivato. Riprova tra un attimo.');
                        }
                      });
                    }}
                    onPlayVersion={(track) => {
                      if (blockedIds.has(track.id)) {
                        warnBlocked();
                        return;
                      }
                      useLibraryStore.getState().chooseAlbumVersion(id, item.folder.id, track.id);
                      void ensurePlayableAndOpen(track.id, trackIds, {
                        autoPlay: true,
                        resumeKey: collectionKey,
                      }).then((opened) => {
                        if (!opened) {
                          Alert.alert('Ascolto', 'Questo brano non è ancora arrivato. Riprova tra un attimo.');
                        }
                      });
                    }}
                    onMenu={() => actions.openVersionFolderMenu(id, item.folder)}
                    onVersionMenu={(track) => actions.openTrackMenu(track)}
                    onSwipeDelete={(track) => actions.confirmDeleteTrack(track)}
                  />
                ) : item.type === 'version-track' ? (
                  <View style={styles.versionChild}>
                    <TrackRow
                      track={item.track}
                      active={
                        item.track.id === playerTrackId ||
                        versionFolderById(album!, item.folderId)?.chosenId === item.track.id
                      }
                      noteCount={
                        (markersByTrackId[item.track.id] ?? []).filter((marker) => marker.hidden !== true)
                          .length
                      }
                      downloading={downloadingIds[item.track.id] != null}
                      blocked={blockedIds.has(item.track.id)}
                      swipeEnabled={!dragging}
                      onPress={() => {
                        if (blockedIds.has(item.track.id)) {
                          warnBlocked();
                          return;
                        }
                        useLibraryStore.getState().chooseAlbumVersion(id, item.folderId, item.track.id);
                        void ensurePlayableAndOpen(item.track.id, trackIds, {
                          autoPlay: true,
                          resumeKey: collectionKey,
                        }).then(
                          (opened) => {
                            if (!opened) {
                              Alert.alert(
                                'Ascolto',
                                'Questo brano non è ancora arrivato. Riprova tra un attimo.',
                              );
                            }
                          },
                        );
                      }}
                      onArtwork={() => actions.pickTrackArtwork(item.track)}
                      onMenu={() => actions.openTrackMenu(item.track)}
                      onSwipeDelete={() => actions.confirmDeleteTrack(item.track)}
                      onDownload={() => {
                        void useLibraryStore.getState().downloadTrack(item.track.id).catch((error) => {
                          Alert.alert(
                            'Download',
                            error instanceof Error ? error.message : 'Download non riuscito',
                          );
                        });
                      }}
                    />
                  </View>
                ) : (
                  <TrackRow
                    track={item.track}
                    active={item.track.id === playerTrackId}
                    noteCount={
                      (markersByTrackId[item.track.id] ?? []).filter((marker) => marker.hidden !== true)
                        .length
                    }
                    downloading={downloadingIds[item.track.id] != null}
                    blocked={blockedIds.has(item.track.id)}
                    swipeEnabled={!dragging}
                    onPress={() => {
                      if (blockedIds.has(item.track.id)) {
                        warnBlocked();
                        return;
                      }
                      void ensurePlayableAndOpen(item.track.id, trackIds, {
                        autoPlay: kind === 'album' || kind === 'folder',
                        resumeKey: collectionKey,
                      }).then((opened) => {
                        if (opened) {
                          usePlayerStore.getState().setDockExpanded(true);
                          return;
                        }
                        Alert.alert(
                          'Ascolto',
                          'Questo brano non è ancora arrivato. Riprova tra un attimo.',
                        );
                      });
                    }}
                    onArtwork={() => actions.pickTrackArtwork(item.track)}
                    onMenu={() => actions.openTrackMenu(item.track)}
                    onSwipeDelete={() => actions.confirmDeleteTrack(item.track)}
                    onDownload={() => {
                      void useLibraryStore.getState().downloadTrack(item.track.id).catch((error) => {
                        Alert.alert(
                          'Download',
                          error instanceof Error ? error.message : 'Download non riuscito',
                        );
                      });
                    }}
                  />
                )
              }
            />
          )}
        </View>
        {album ? (
          <>
            <AlbumNotes albumId={album.id} notes={album.notes} />
            <AlbumDocuments documents={album.documents ?? []} />
          </>
        ) : null}
        {kind === 'album' || kind === 'folder' ? (
          <CollectionMarkers tracks={tracks} markersByTrackId={markersByTrackId} />
        ) : null}
      </ScrollView>
      </View>
      <CollectionPlayer />
      {actions.modals}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 10,
    gap: 4,
  },
  back: {
    color: colors.textMuted,
    fontSize: 34,
    lineHeight: 36,
    width: 28,
    marginTop: -4,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  subtitle: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: 13,
  },
  edit: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '700',
    marginTop: 18,
  },
  plus: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginTop: 4,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusPressed: {
    opacity: 0.7,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  plusGlyph: {
    color: colors.accent,
    fontSize: 22,
    fontWeight: '600',
    marginTop: -2,
  },
  downloadDone: {
    color: '#34C759',
  },
  pauseGlyph: {
    fontSize: 16,
    marginTop: 0,
  },
  editSpacer: {
    width: 28,
  },
  hint: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  hintInScroll: {
    paddingHorizontal: 4,
  },
  roleLine: {
    textAlign: 'center',
    paddingBottom: 12,
    marginTop: -8,
  },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  sortBtnPressed: {
    opacity: 0.7,
  },
  sortGlyph: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '700',
  },
  sortLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  sectionLabel: {
    paddingHorizontal: 4,
    paddingBottom: 8,
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  scrollHost: {
    flex: 1,
  },
  scroll: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  cardGap: {
    marginBottom: 12,
  },
  subfolder: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  subfolderName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  subfolderMeta: {
    color: colors.textMuted,
    fontSize: 12,
  },
  emptyBox: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  empty: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  versionChild: {
    paddingLeft: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
