import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';

import { albumTrackCount, type CollectionKind } from '../../domain/library';
import { resolveLibraryUri } from '../../files/libraryUris';
import type { RootStackParamList } from '../../navigation/types';
import { isDemoUser } from '../../auth/demoAccount';
import { runCloudSync } from '../../cloud/syncEngine';
import { useLibraryStore } from '../../store/libraryStore';
import { useSessionStore } from '../../store/sessionStore';
import { libraryNeedsBanner, useSyncStore } from '../../store/syncStore';
import { colors, layout } from '../../theme/colors';
import { AlbumMark, BrandMark, EmptyGraphic, FolderMark, ScreenAura } from '../../theme/graphics';
import {
  HomeDraggableTrack,
  HomeDropTargetBox,
  remesureDropTargets,
  targetAtPoint,
  type HomeDropTarget,
} from './homeDrop';
import { openTrack } from './openTrack';
import { TrackRow } from './TrackRow';
import { useLibraryActions } from './useLibraryActions';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Library'>;

function Section({
  title,
  icon,
  actionLabel,
  onAction,
  collapsible,
  defaultCollapsed = false,
  forceExpanded,
  collapsedMeta,
  children,
}: {
  title: string;
  icon?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  forceExpanded?: boolean;
  collapsedMeta?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(!defaultCollapsed);
  const expanded = forceExpanded || !collapsible || open;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Pressable
          onPress={collapsible ? () => setOpen((value) => !value) : undefined}
          disabled={!collapsible}
          style={styles.cardTitleHit}
          accessibilityRole={collapsible ? 'button' : undefined}
          accessibilityLabel={
            collapsible ? `${title}, ${expanded ? 'aperto' : 'chiuso'}` : undefined
          }
          accessibilityHint={collapsible ? 'Tocca per aprire o chiudere' : undefined}
        >
          {icon}
          <Text style={styles.cardLabel}>{title}</Text>
        </Pressable>
        <View style={styles.cardHeaderRight}>
          {collapsible && !expanded && collapsedMeta ? (
            <Text style={styles.collapsedMeta}>{collapsedMeta}</Text>
          ) : null}
          {collapsible ? (
            <Text style={[styles.chevron, expanded && styles.chevronOpen]}>›</Text>
          ) : null}
          {actionLabel && onAction ? (
            <Pressable onPress={onAction} hitSlop={layout.hitSlop}>
              <Text style={styles.cardAction}>{actionLabel}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      {expanded ? children : null}
    </View>
  );
}

function CollectionRow({
  name,
  meta,
  imageUri,
  onPress,
  onLongPress,
}: {
  name: string;
  meta: string;
  imageUri?: string;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const letter = (name.trim()[0] || '?').toUpperCase();
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={280}
      style={({ pressed }) => [styles.collectionRow, pressed && styles.pressed]}
    >
      {imageUri !== undefined ? (
        imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.thumb} resizeMode="cover" />
        ) : (
          <View style={styles.thumbFallback}>
            <Text style={styles.thumbLetter}>{letter}</Text>
          </View>
        )
      ) : null}
      <Text style={styles.collectionName}>{name}</Text>
      <Text style={styles.collectionMeta}>{meta}</Text>
    </Pressable>
  );
}

export function LibraryScreen() {
  const navigation = useNavigation<Nav>();
  const tracks = useLibraryStore((s) => s.tracks);
  const albums = useLibraryStore((s) => s.albums);
  const playlists = useLibraryStore((s) => s.playlists);
  const markersByTrackId = useLibraryStore((s) => s.markersByTrackId);
  const downloadingIds = useLibraryStore((s) => s.downloadingIds);
  const foldersIn = useLibraryStore((s) => s.foldersIn);
  const actions = useLibraryActions(null, (kind, id) => {
    navigation.navigate('Collection', { kind, id });
  });
  const rootFolders = foldersIn(null);

  const user = useSessionStore((s) => s.user);
  const demoAccount = isDemoUser(user);
  const syncStatus = useSyncStore((s) => s.status);
  const syncMessage = useSyncStore((s) => s.message);
  const pendingReviews = useSyncStore((s) => s.pendingReviews);
  const needsFolderLink = useSyncStore((s) => s.needsFolderLink);
  const needsFileRefresh = useSyncStore((s) => s.needsFileRefresh);
  const [query, setQuery] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);
  const dropRects = useRef(new Map<string, { x: number; y: number; w: number; h: number }>());
  const dropNodes = useRef(new Map<string, View | null>());
  const scrollRef = useRef<ScrollView>(null);
  const scrollHost = useRef<View>(null);
  const scrollY = useRef(0);
  const scrollBox = useRef({ y: 0, height: 0 });

  const dropTargets = useMemo<HomeDropTarget[]>(() => {
    const folders = rootFolders.map((folder) => ({
      key: `folder:${folder.id}`,
      kind: 'folder' as const,
      id: folder.id,
      name: folder.name,
      trackIds: folder.trackIds,
    }));
    const albumTargets = albums.map((album) => ({
      key: `album:${album.id}`,
      kind: 'album' as const,
      id: album.id,
      name: album.name,
      trackIds: album.trackIds,
    }));
    return [...folders, ...albumTargets];
  }, [rootFolders, albums]);

  const filteredTracks = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return tracks;
    }
    return tracks.filter(
      (track) =>
        track.title.toLowerCase().includes(q) ||
        track.artist.toLowerCase().includes(q),
    );
  }, [query, tracks]);

  const openCollection = (kind: CollectionKind, id: string) => {
    navigation.navigate('Collection', { kind, id });
  };

  const autoScroll = useCallback((pageY: number) => {
    const box = scrollBox.current;
    if (box.height <= 0) {
      return;
    }
    const edge = 72;
    let next = scrollY.current;
    if (pageY < box.y + edge) {
      next = Math.max(0, scrollY.current - 22);
    } else if (pageY > box.y + box.height - edge) {
      next = scrollY.current + 22;
    } else {
      return;
    }
    scrollY.current = next;
    scrollRef.current?.scrollTo({ y: next, animated: false });
  }, []);

  const onTrackDragMove = useCallback(
    (trackId: string, pageX: number, pageY: number) => {
      setDragId(trackId);
      setGhost({ x: pageX, y: pageY });
      autoScroll(pageY);
      remesureDropTargets(dropNodes, dropRects);
      const hit = targetAtPoint(pageX, pageY, dropRects.current, dropTargets);
      setHoverKey(hit?.key ?? null);
    },
    [autoScroll, dropTargets],
  );

  const onTrackDragEnd = useCallback(
    (trackId: string, pageX: number, pageY: number) => {
      const hit = targetAtPoint(pageX, pageY, dropRects.current, dropTargets);
      setDragId(null);
      setHoverKey(null);
      setGhost(null);
      if (!hit) {
        return;
      }
      const track = useLibraryStore.getState().getTrack(trackId);
      const title = track?.title ?? 'Questa traccia';
      if (hit.trackIds.includes(trackId)) {
        Alert.alert('Già presente', `${title} è già in ${hit.name}.`);
        return;
      }
      if (hit.kind === 'folder') {
        const result = useLibraryStore.getState().addTrackToFolder(trackId, hit.id);
        if (result === 'exists') {
          Alert.alert('Già presente', `${title} è già in ${hit.name}.`);
        }
        return;
      }
      useLibraryStore.getState().addTracksToAlbum(hit.id, [trackId]);
    },
    [dropTargets],
  );

  const onHomeScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollY.current = event.nativeEvent.contentOffset.y;
    remesureDropTargets(dropNodes, dropRects);
  };

  const play = (trackId: string) => {
    if (openTrack(trackId, filteredTracks.map((track) => track.id))) {
      navigation.navigate('Player');
      return;
    }
    Alert.alert('Scarica', 'Questa traccia non è ancora sul telefono. Tocca ↓ per il download offline.');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScreenAura />
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <BrandMark size="sm" />
          <View>
            <Text style={styles.title}>Libreria</Text>
            <Text style={styles.subtitle}>Cartelle e album</Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => actions.openCreateMenu()}
            style={({ pressed }) => [styles.gear, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Nuovo"
          >
            <Text style={styles.importGlyph}>＋</Text>
          </Pressable>
          <Pressable
            onPress={() => navigation.navigate('Settings')}
            style={({ pressed }) => [styles.gear, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Impostazioni"
          >
            <Text style={styles.gearGlyph}>⚙</Text>
          </Pressable>
        </View>
      </View>

      {!demoAccount &&
      libraryNeedsBanner({
        status: syncStatus,
        message: syncMessage,
        pendingReviews,
        needsFolderLink,
        needsFileRefresh,
      }) ? (
        <Pressable
          onPress={() => {
            if (pendingReviews.length > 0) {
              navigation.navigate('SyncReview');
              return;
            }
            if (needsFolderLink) {
              navigation.navigate('DriveFolder', {});
              return;
            }
            void runCloudSync();
          }}
          style={styles.banner}
        >
          <Text style={styles.bannerText}>
            {syncStatus === 'syncing'
              ? 'Allineo i brani…'
              : pendingReviews.length > 0
                ? `${pendingReviews[0]?.title} è stato aggiornato. Tocca per rivedere i marker.`
                : syncMessage ||
                  (needsFolderLink
                    ? 'Collega la cartella Drive per la sync automatica.'
                    : 'Tocca per ricontrollare Drive.')}
          </Text>
        </Pressable>
      ) : null}

      <TextInput
        style={styles.search}
        value={query}
        onChangeText={setQuery}
        placeholder="Cerca tracce…"
        placeholderTextColor={colors.textMuted}
        selectionColor={colors.accent}
        autoCorrect={false}
      />

      <View
        ref={scrollHost}
        style={styles.scrollHost}
        onLayout={() => {
          scrollHost.current?.measureInWindow((_x: number, y: number, _w: number, h: number) => {
            scrollBox.current = { y, height: h };
          });
        }}
      >
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={!dragId}
        onScroll={onHomeScroll}
        scrollEventThrottle={16}
      >
        <Section
          title="Cartelle"
          icon={<FolderMark />}
          actionLabel="Nuova"
          onAction={() => actions.newFolder(null)}
        >
          {rootFolders.length === 0 ? (
            <Text style={styles.emptyHint}>Nessuna cartella. Tocca Nuova per crearne una.</Text>
          ) : (
            rootFolders.map((folder) => {
              const childCount = foldersIn(folder.id).length;
              return (
              <HomeDropTargetBox
                key={folder.id}
                dropKey={`folder:${folder.id}`}
                highlighted={hoverKey === `folder:${folder.id}`}
                rects={dropRects}
                nodes={dropNodes}
              >
                <CollectionRow
                  name={folder.name}
                  meta={
                    childCount > 0
                      ? `${childCount} cartelle · ${folder.trackIds.length} tracce`
                      : `${folder.trackIds.length} tracce`
                  }
                  onPress={() => openCollection('folder', folder.id)}
                  onLongPress={() => actions.openFolderMenu(folder)}
                />
              </HomeDropTargetBox>
              );
            })
          )}
        </Section>

        <Section
          title="Album"
          icon={<AlbumMark />}
          actionLabel="Nuova"
          onAction={() => actions.openAlbumCreateMenu()}
        >
          {albums.length === 0 ? (
            <Text style={styles.emptyHint}>
              Tocca Nuova: album sul telefono, oppure da una cartella Cloud.
            </Text>
          ) : (
            albums.map((album) => (
              <HomeDropTargetBox
                key={album.id}
                dropKey={`album:${album.id}`}
                highlighted={hoverKey === `album:${album.id}`}
                rects={dropRects}
                nodes={dropNodes}
              >
                <CollectionRow
                  name={album.name}
                  imageUri={resolveLibraryUri(album.artworkUri) ?? ''}
                  meta={
                    album.origin === 'drive'
                      ? `Drive · ${albumTrackCount(album.trackIds)} tracce`
                      : album.artist || `${albumTrackCount(album.trackIds)} tracce`
                  }
                  onPress={() => openCollection('album', album.id)}
                  onLongPress={() => actions.openAlbumMenu(album.id)}
                />
              </HomeDropTargetBox>
            ))
          )}
        </Section>

        {playlists.length > 0 ? (
          <Section
            title="Playlist"
            actionLabel="Nuova"
            onAction={() => actions.newPlaylist()}
          >
            {playlists.map((playlist) => (
              <CollectionRow
                key={playlist.id}
                name={playlist.name}
                meta={`${playlist.trackIds.length} tracce`}
                onPress={() => openCollection('playlist', playlist.id)}
                onLongPress={() => actions.openPlaylistMenu(playlist.id)}
              />
            ))}
          </Section>
        ) : null}

        <Section
          title="Tutte le tracce"
          icon={<BrandMark size="xs" />}
          collapsible
          defaultCollapsed
          forceExpanded={query.trim().length > 0}
          collapsedMeta={
            filteredTracks.length === 1 ? '1 traccia' : `${filteredTracks.length} tracce`
          }
        >
          {filteredTracks.length > 0 && dropTargets.length > 0 ? (
            <Text style={styles.dragHint}>
              Tieni premuto una traccia e trascinala in una cartella o in un album.
            </Text>
          ) : null}
          {filteredTracks.length === 0 ? (
            <Pressable
              onPress={() => {
                void actions.importAudio(null);
              }}
              style={({ pressed }) => [styles.emptyImport, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Carica audio"
            >
              {query.trim() ? null : <EmptyGraphic />}
              <Text style={styles.emptyTitle}>
                {query.trim() ? 'Nessun risultato' : 'Nessun audio in libreria'}
              </Text>
              <Text style={styles.emptyHint}>
                {query.trim()
                  ? 'Prova un altro nome.'
                  : 'Tocca Carica audio, oppure metti i file in File → ReWavier → Audio.'}
              </Text>
              {query.trim() ? null : <Text style={styles.emptyAction}>Carica audio</Text>}
            </Pressable>
          ) : (
            filteredTracks.map((track) => (
              <HomeDraggableTrack
                key={track.id}
                trackId={track.id}
                onMove={onTrackDragMove}
                onEnd={onTrackDragEnd}
              >
                <TrackRow
                  track={track}
                  active={dragId === track.id}
                  noteCount={
                    (markersByTrackId[track.id] ?? []).filter((marker) => marker.hidden !== true)
                      .length
                  }
                  downloading={downloadingIds[track.id] != null}
                  onPress={() => play(track.id)}
                  onArtwork={() => actions.pickTrackArtwork(track)}
                  onMenu={() => actions.openTrackMenu(track)}
                  onDownload={() => {
                    void useLibraryStore.getState().downloadTrack(track.id).catch((error) => {
                      Alert.alert(
                        'Download',
                        error instanceof Error ? error.message : 'Download non riuscito',
                      );
                    });
                  }}
                />
              </HomeDraggableTrack>
            ))
          )}
        </Section>
      </ScrollView>
      </View>
      {dragId && ghost ? (
        <View pointerEvents="none" style={styles.ghostLayer}>
          <View style={[styles.ghostCard, { top: ghost.y - 36, left: 20, right: 20 }]}>
            <Text style={styles.ghostTitle} numberOfLines={1}>
              {tracks.find((track) => track.id === dragId)?.title ?? 'Traccia'}
            </Text>
            <Text style={styles.ghostHint}>
              {hoverKey ? 'Rilascia per aggiungere' : 'Portala su una cartella o un album'}
            </Text>
          </View>
        </View>
      ) : null}
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
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.6,
  },
  subtitle: {
    marginTop: 3,
    color: colors.textMuted,
    fontSize: 14,
  },
  gear: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gearGlyph: {
    color: colors.text,
    fontSize: 20,
  },
  importGlyph: {
    color: colors.accent,
    fontSize: 22,
    fontWeight: '600',
    marginTop: -2,
  },
  banner: {
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  bannerText: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  search: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    color: colors.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  scrollHost: {
    flex: 1,
  },
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 32,
    gap: 12,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
    paddingBottom: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 6,
    gap: 10,
  },
  cardTitleHit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  cardHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  collapsedMeta: {
    color: colors.textMuted,
    fontSize: 12,
  },
  chevron: {
    color: colors.textMuted,
    fontSize: 20,
    lineHeight: 22,
    marginTop: -1,
  },
  chevronOpen: {
    transform: [{ rotate: '90deg' }],
  },
  cardAction: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '700',
  },
  collectionRow: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: 6,
    backgroundColor: colors.surfaceRaised,
  },
  thumbFallback: {
    width: 44,
    height: 44,
    borderRadius: 6,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbLetter: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  collectionName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  collectionMeta: {
    color: colors.textMuted,
    fontSize: 12,
  },
  emptyImport: {
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  dragHint: {
    paddingHorizontal: 14,
    paddingTop: 4,
    paddingBottom: 2,
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  emptyHint: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  ghostLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
  },
  ghostCard: {
    position: 'absolute',
    backgroundColor: colors.surfaceRaised,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  ghostTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  ghostHint: {
    marginTop: 3,
    color: colors.textMuted,
    fontSize: 13,
  },
  emptyAction: {
    marginTop: 12,
    color: colors.accent,
    fontSize: 15,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.7,
  },
});
