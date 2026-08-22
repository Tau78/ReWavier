import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';

import { isDownloaded } from '../../domain/audioFormats';
import type { Album, CollectionKind } from '../../domain/library';
import type { Track } from '../../domain/models';
import type { RootStackParamList } from '../../navigation/types';
import { useLibraryStore } from '../../store/libraryStore';
import { usePlayerStore } from '../../store/playerStore';
import { colors, layout } from '../../theme/colors';
import { EmptyGraphic, KindRow } from '../../theme/graphics';
import { AlbumHero } from './AlbumHero';
import { AlbumNotes } from './AlbumNotes';
import { AlbumSeparatorRow, SEPARATOR_ROW_HEIGHT } from './AlbumSeparatorRow';
import { openTrack, playQueue } from './openTrack';
import { ReorderableTrackList } from './ReorderableTrackList';
import { TrackRow } from './TrackRow';
import { useLibraryActions } from './useLibraryActions';

type ListItem =
  | { id: string; type: 'track'; track: Track; rowHeight?: number }
  | { id: string; type: 'separator'; name: string; rowHeight: number };

function albumListItems(album: Album, tracks: Track[]): ListItem[] {
  const byId = new Map(tracks.map((track) => [track.id, track]));
  const names = new Map((album.separators ?? []).map((item) => [item.id, item.name]));
  const items: ListItem[] = [];
  for (const itemId of album.trackIds) {
    const name = names.get(itemId);
    if (name != null) {
      items.push({ id: itemId, type: 'separator', name, rowHeight: SEPARATOR_ROW_HEIGHT });
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
  folder: 'Cartella',
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
  const canReorder = kind !== 'smart';
  const album = kind === 'album' ? albums.find((item) => item.id === id) : undefined;
  const listItems = useMemo<ListItem[]>(
    () =>
      album
        ? albumListItems(album, tracks)
        : tracks.map((track) => ({ id: track.id, type: 'track' as const, track })),
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

  const playAlbum = () => {
    if (isPlayingThisAlbum) {
      usePlayerStore.getState().pause();
      return;
    }
    if (playerTrackId && tracks.some((track) => track.id === playerTrackId)) {
      usePlayerStore.getState().play();
      return;
    }
    if (playQueue(tracks.map((track) => track.id))) {
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
              onPress={() => {
                void useLibraryStore
                  .getState()
                  .downloadAlbum(id)
                  .catch((error) => {
                    Alert.alert(
                      'Download',
                      error instanceof Error ? error.message : 'Download non riuscito',
                    );
                  });
              }}
              style={({ pressed }) => [styles.plus, pressed && styles.plusPressed]}
              accessibilityRole="button"
              accessibilityLabel="Scarica album"
            >
              <Text
                style={[
                  styles.plusGlyph,
                  tracks.every((track) => isDownloaded(track)) && styles.downloadDone,
                ]}
              >
                {tracks.some((track) => downloadingIds[track.id] != null)
                  ? '…'
                  : tracks.every((track) => isDownloaded(track))
                    ? '✓'
                    : '↓'}
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
          <Pressable
            onPress={() => actions.openFolderCreateMenu()}
            style={({ pressed }) => [styles.plus, pressed && styles.plusPressed]}
            accessibilityRole="button"
            accessibilityLabel="Nuovo"
          >
            <Text style={styles.plusGlyph}>＋</Text>
          </Pressable>
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
      >
        {album ? (
          <>
            <AlbumHero
              album={album}
              trackCount={tracks.length}
              isPlayingThisAlbum={isPlayingThisAlbum}
              onPlay={playAlbum}
            />
            <AlbumNotes albumId={album.id} notes={album.notes} />
          </>
        ) : null}
        {album ? <Text style={styles.sectionLabel}>Tracce</Text> : null}
        {canReorder && listItems.length > 1 ? (
          <Text style={[styles.hint, album && styles.hintInScroll]}>
            {album
              ? 'Tieni premuto e trascina. Il separatore divide, per esempio, le tracce finite dalle bozze.'
              : 'Tieni premuto una traccia e trascinala per riordinare.'}
          </Text>
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
                useLibraryStore.getState().setCollectionOrder(kind, id, itemIds);
              }}
              renderItem={(item) =>
                item.type === 'separator' ? (
                  <AlbumSeparatorRow
                    name={item.name}
                    onPress={() => actions.openSeparatorMenu(id, item.id, item.name)}
                  />
                ) : (
                  <TrackRow
                    track={item.track}
                    noteCount={
                      (markersByTrackId[item.track.id] ?? []).filter((marker) => marker.hidden !== true)
                        .length
                    }
                    downloading={downloadingIds[item.track.id] != null}
                    onPress={() => {
                      if (openTrack(item.track.id, tracks.map((track) => track.id))) {
                        navigation.navigate('Player');
                        return;
                      }
                      Alert.alert(
                        'Scarica',
                        'Questa traccia non è ancora sul telefono. Tocca ↓ per il download offline.',
                      );
                    }}
                    onArtwork={() => actions.pickTrackArtwork(item.track)}
                    onMenu={() => actions.openTrackMenu(item.track)}
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
      </ScrollView>
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
});
