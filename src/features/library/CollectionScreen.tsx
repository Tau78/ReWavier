import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';

import { runCloudSync } from '../../cloud/syncEngine';
import { orderedAlbumItemIds } from '../../domain/albumOrder';
import { playableAlbumTrackIds, versionFolderById, type AlbumListReorderItem } from '../../domain/albumVersions';
import { isDownloaded } from '../../domain/audioFormats';
import { formatDownloadPercent } from '../../domain/downloadProgress';
import type { Album, AlbumVersionFolder, CollectionKind } from '../../domain/library';
import { isSeparatorId, isVersionFolderId } from '../../domain/library';
import type { Track } from '../../domain/models';
import { recoverAudioRelative } from '../../files/libraryUris';
import type { RootStackParamList } from '../../navigation/types';
import { useDownloadProgressStore } from '../../store/downloadProgressStore';
import { flushLibraryPersist, useLibraryStore } from '../../store/libraryStore';
import { usePlayerStore } from '../../store/playerStore';
import { isSyncInFlight, useSyncStore } from '../../store/syncStore';
import { colors, layout } from '../../theme/colors';
import { EmptyGraphic, KindRow } from '../../theme/graphics';
import { CollectionMarkers } from './CollectionMarkers';
import { AlbumHero } from './AlbumHero';
import { AlbumDocuments } from './AlbumDocuments';
import { AlbumNotes } from './AlbumNotes';
import { AlbumSeparatorRow, SEPARATOR_ROW_HEIGHT } from './AlbumSeparatorRow';
import { CollectionPlayer } from './CollectionPlayer';
import { ensurePlayableAndOpen, openTrack, playQueue } from './openTrack';
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
  const canReorder = kind !== 'smart';
  const album = kind === 'album' ? albums.find((item) => item.id === id) : undefined;
  const isDriveAlbum = album?.origin === 'drive';
  const syncStatus = useSyncStore((s) => s.status);
  const syncMessage = useSyncStore((s) => s.message);
  const [pulling, setPulling] = useState(false);
  const driveSyncRef = useRef(false);
  const heldFileUriRef = useRef<Map<string, string>>(new Map());
  const downloadActive = useDownloadProgressStore((s) => s.active);
  const downloadPercent = useDownloadProgressStore((s) => s.percent);
  const refreshFromDrive = useCallback(async () => {
    if (!isDriveAlbum || driveSyncRef.current || isSyncInFlight(useSyncStore.getState())) {
      return;
    }
    driveSyncRef.current = true;
    try {
      await flushLibraryPersist();
      useLibraryStore.getState().reattachLocalAudio();
      if (isSyncInFlight(useSyncStore.getState())) {
        return;
      }
      await runCloudSync();
    } catch (error) {
      Alert.alert(
        'Drive',
        error instanceof Error ? error.message : 'Non riesco a ricontrollare la cartella.',
      );
    } finally {
      driveSyncRef.current = false;
    }
  }, [isDriveAlbum]);
  useFocusEffect(
    useCallback(() => {
      if (isDriveAlbum) {
        void refreshFromDrive();
      }
    }, [isDriveAlbum, refreshFromDrive]),
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
        ? `${smartPlaylists.find((item) => item.id === id)?.conditions.length ?? 0} regole`
        : `${tracks.length} tracce`;

  const startCollectionDownload = () => {
    if (displayTracks.length === 0) {
      Alert.alert('Download', 'Non c’è nessun brano da scaricare.');
      return;
    }
    if (displayTracks.length > 0 && displayTracks.every((track) => isDownloaded(track))) {
      Alert.alert(
        'Sul telefono',
        kind === 'folder'
          ? 'Tutti i brani di questa playlist sono già qui.'
          : 'Tutti i brani di questo album sono già qui.',
      );
      return;
    }
    void useLibraryStore
      .getState()
      .downloadCollection(kind === 'folder' ? 'folder' : 'album', id)
      .catch((error) => {
        Alert.alert('Download', error instanceof Error ? error.message : 'Download non riuscito');
      });
  };
  const allOnPhone =
    displayTracks.length > 0 && displayTracks.every((track) => isDownloaded(track));
  const downloadGlyph = downloadActive
    ? formatDownloadPercent(downloadPercent)
    : displayTracks.some((track) => downloadingIds[track.id] != null)
      ? '…'
      : allOnPhone
        ? '✓'
        : '↓';

  const playAlbum = () => {
    if (isPlayingThisAlbum) {
      usePlayerStore.getState().pause();
      return;
    }
    if (playerTrackId && tracks.some((track) => track.id === playerTrackId)) {
      usePlayerStore.getState().play();
      return;
    }
    if (playQueue(trackIds)) {
      return;
    }
    Alert.alert(
      'Ascolto',
      tracks.length === 0
        ? 'Questo album è vuoto. Aggiungi un audio e poi tocca Play.'
        : 'Nessuna traccia è ancora ascoltabile. Scaricala sul telefono e riprova.',
    );
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
                downloadActive
                  ? `Download ${formatDownloadPercent(downloadPercent)}`
                  : allOnPhone
                    ? 'Album già sul telefono'
                    : 'Scarica album'
              }
            >
              <Text
                style={[
                  styles.plusGlyph,
                  downloadActive && styles.percentGlyph,
                  allOnPhone && styles.downloadDone,
                ]}
              >
                {downloadGlyph}
              </Text>
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
              accessibilityLabel={
                downloadActive
                  ? `Download ${formatDownloadPercent(downloadPercent)}`
                  : allOnPhone
                    ? 'Playlist già sul telefono'
                    : 'Scarica playlist'
              }
            >
              <Text
                style={[
                  styles.plusGlyph,
                  downloadActive && styles.percentGlyph,
                  allOnPhone && styles.downloadDone,
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
                setPulling(true);
                void refreshFromDrive().finally(() => setPulling(false));
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
        {downloadActive && (kind === 'album' || kind === 'folder') ? (
          <View style={styles.downloadBox}>
            <Text style={styles.downloadHint}>
              Sto scaricando… {formatDownloadPercent(downloadPercent)}
            </Text>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${downloadPercent}%` }]} />
            </View>
          </View>
        ) : null}
        {album ? <Text style={styles.sectionLabel}>Tracce</Text> : null}
        {isDriveAlbum ? (
          <Text style={[styles.hint, styles.hintInScroll]}>
            {syncStatus === 'syncing'
              ? 'Cerco i brani nuovi nella cartella Drive…'
              : syncMessage?.startsWith('Album aggiornato')
                ? syncMessage
                : 'Trascina in basso per cercare i brani nuovi nella cartella Drive.'}
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
                    playerTrackId={playerTrackId}
                    noteCountOf={(trackId) =>
                      (markersByTrackId[trackId] ?? []).filter((marker) => marker.hidden !== true).length
                    }
                    downloadingOf={(trackId) => downloadingIds[trackId] != null}
                    onToggle={() =>
                      setOpenVersionIds((current) => ({
                        ...current,
                        [item.folder.id]: !current[item.folder.id],
                      }))
                    }
                    onPlayChosen={() => {
                      const chosenId = item.folder.chosenId;
                      void ensurePlayableAndOpen(chosenId, trackIds, { autoPlay: true }).then((opened) => {
                        if (!opened) {
                          Alert.alert('Ascolto', 'Questo brano non è ancora arrivato. Riprova tra un attimo.');
                        }
                      });
                    }}
                    onPlayVersion={(track) => {
                      useLibraryStore.getState().chooseAlbumVersion(id, item.folder.id, track.id);
                      void ensurePlayableAndOpen(track.id, trackIds, { autoPlay: true }).then((opened) => {
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
                      onPress={() => {
                        useLibraryStore.getState().chooseAlbumVersion(id, item.folderId, item.track.id);
                        void ensurePlayableAndOpen(item.track.id, trackIds, { autoPlay: true }).then(
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
                    onPress={() => {
                      void ensurePlayableAndOpen(
                        item.track.id,
                        trackIds,
                        kind === 'album' || kind === 'folder' ? { autoPlay: true } : undefined,
                      ).then((opened) => {
                        if (opened) {
                          if (kind !== 'album' && kind !== 'folder') {
                            navigation.navigate('Player');
                          }
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
      {kind === 'album' || kind === 'folder' ? <CollectionPlayer trackIds={trackIds} /> : null}
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
  percentGlyph: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 0,
  },
  downloadBox: {
    marginBottom: 12,
  },
  downloadHint: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  barTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surfaceRaised,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: 3,
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
  scroll: {
    paddingHorizontal: 16,
    paddingBottom: 32,
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
