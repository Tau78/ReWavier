import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';

import { canWriteWithRole, FOLDER_READ_ONLY_MESSAGE } from '../../domain/folderRole';
import { albumTrackCount, type CollectionKind } from '../../domain/library';
import { noteAuthorDots } from '../../domain/markers';
import { resolveLibraryUri } from '../../files/libraryUris';
import type { RootStackParamList } from '../../navigation/types';
import { isDemoUser } from '../../auth/demoAccount';
import { runCloudSync } from '../../cloud/syncEngine';
import { albumRoleForAlbumId, useLibraryStore } from '../../store/libraryStore';
import { useSessionStore } from '../../store/sessionStore';
import { libraryNeedsBanner, useSyncStore } from '../../store/syncStore';
import { colors, DeepBackdrop, GlassCard, layout } from '../../theme';
import { AlbumMark, BrandMark, EmptyGraphic, FolderMark, ScreenAura } from '../../theme/graphics';
import { CollectionPlayer } from '../library/CollectionPlayer';
import { LibrarySearch, matchesLibrarySearch } from '../library/LibrarySearch';
import {
  HomeDraggableTrack,
  HomeDropTargetBox,
  remesureDropTargets,
  targetAtPoint,
  type HomeDropTarget,
} from '../library/homeDrop';
import { ensurePlayableAndOpen } from '../library/openTrack';
import { TrackRow } from '../library/TrackRow';
import { useLibraryActions } from '../library/useLibraryActions';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Home'>;

function greetingForHour(hour: number): string {
  if (hour < 12) {
    return 'Buongiorno';
  }
  if (hour < 18) {
    return 'Buon pomeriggio';
  }
  return 'Buonasera';
}

function Section({
  title,
  icon,
  actionLabel,
  onAction,
  children,
  flush,
}: {
  title: string;
  icon?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  children: ReactNode;
  flush?: boolean;
}) {
  return (
    <GlassCard style={[styles.card, flush && styles.cardFlush]}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleHit}>
          {icon}
          <Text style={styles.cardLabel}>{title}</Text>
        </View>
        {actionLabel && onAction ? (
          <Pressable onPress={onAction} hitSlop={layout.hitSlop}>
            <Text style={styles.cardAction}>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </GlassCard>
  );
}

function StatPill({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.statPill}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function QuickAction({
  icon,
  label,
  onPress,
}: {
  icon: ReactNode;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.quickAction, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={styles.quickIcon}>{icon}</View>
      <Text style={styles.quickLabel}>{label}</Text>
    </Pressable>
  );
}

function AlbumTile({
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
      style={({ pressed }) => [styles.albumTile, pressed && styles.pressed]}
    >
      {imageUri ? (
        <Image source={{ uri: imageUri }} style={styles.albumArt} resizeMode="cover" />
      ) : (
        <LinearGradient
          colors={['rgba(74, 158, 255, 0.28)', 'rgba(255, 107, 53, 0.22)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.albumArtFallback}
        >
          <Text style={styles.albumLetter}>{letter}</Text>
        </LinearGradient>
      )}
      <Text style={styles.albumName} numberOfLines={2}>
        {name}
      </Text>
      <Text style={styles.albumMeta} numberOfLines={1}>
        {meta}
      </Text>
    </Pressable>
  );
}

function CollectionRow({
  name,
  meta,
  imageUri,
  onPress,
  onLongPress,
  divider,
}: {
  name: string;
  meta: string;
  imageUri?: string;
  onPress: () => void;
  onLongPress?: () => void;
  divider?: boolean;
}) {
  const letter = (name.trim()[0] || '?').toUpperCase();
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={280}
      style={({ pressed }) => [
        styles.collectionRow,
        divider && styles.collectionRowDivider,
        pressed && styles.collectionRowPressed,
      ]}
    >
      {imageUri !== undefined ? (
        imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.thumb} resizeMode="cover" />
        ) : (
          <LinearGradient
            colors={['rgba(74, 158, 255, 0.24)', 'rgba(42, 16, 64, 0.55)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.thumbFallback}
          >
            <Text style={styles.thumbLetter}>{letter}</Text>
          </LinearGradient>
        )
      ) : (
        <View style={styles.playlistIcon}>
          <FolderMark size={20} />
        </View>
      )}
      <View style={styles.collectionText}>
        <Text style={styles.collectionName} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.collectionMeta} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

export function HomeScreen() {
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
  const dragIdRef = useRef<string | null>(null);
  const hoverKeyRef = useRef<string | null>(null);
  const lastRemesureAt = useRef(0);
  const lastGhostAt = useRef(0);
  const latestGhost = useRef<{ x: number; y: number } | null>(null);
  const ghostTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const q = query.trim().toLowerCase();
  const visibleFolders = useMemo(() => {
    if (!q) {
      return rootFolders;
    }
    return rootFolders.filter((folder) => matchesLibrarySearch(q, folder.name));
  }, [q, rootFolders]);
  const visibleAlbums = useMemo(() => {
    if (!q) {
      return albums;
    }
    return albums.filter((album) => matchesLibrarySearch(q, album.name, album.artist));
  }, [albums, q]);
  const visiblePlaylists = useMemo(() => {
    if (!q) {
      return playlists;
    }
    return playlists.filter((playlist) => matchesLibrarySearch(q, playlist.name));
  }, [playlists, q]);
  const matchingTracks = useMemo(() => {
    if (!q) {
      return [];
    }
    return tracks.filter((track) => matchesLibrarySearch(q, track.title, track.artist));
  }, [q, tracks]);

  const playlistCount = rootFolders.length + playlists.length;
  const greeting = greetingForHour(new Date().getHours());
  const firstName = user?.displayName?.trim().split(/\s+/)[0] ?? '';
  const headline = firstName ? `${greeting}, ${firstName}` : greeting;

  const searchEmpty =
    q.length > 0 &&
    visibleFolders.length === 0 &&
    visibleAlbums.length === 0 &&
    visiblePlaylists.length === 0 &&
    matchingTracks.length === 0;

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

  const clearGhostTimer = useCallback(() => {
    if (ghostTimer.current) {
      clearTimeout(ghostTimer.current);
      ghostTimer.current = null;
    }
  }, []);

  const flushGhost = useCallback(() => {
    const next = latestGhost.current;
    if (!next) {
      return;
    }
    lastGhostAt.current = Date.now();
    setGhost(next);
  }, []);

  const onTrackDragMove = useCallback(
    (trackId: string, pageX: number, pageY: number) => {
      if (dragIdRef.current !== trackId) {
        dragIdRef.current = trackId;
        setDragId(trackId);
        lastRemesureAt.current = 0;
      }

      latestGhost.current = { x: pageX, y: pageY };
      const now = Date.now();
      const ghostElapsed = now - lastGhostAt.current;
      if (ghostElapsed >= 40) {
        clearGhostTimer();
        flushGhost();
      } else if (!ghostTimer.current) {
        ghostTimer.current = setTimeout(() => {
          ghostTimer.current = null;
          flushGhost();
        }, 40 - ghostElapsed);
      }

      autoScroll(pageY);

      if (now - lastRemesureAt.current >= 100) {
        lastRemesureAt.current = now;
        remesureDropTargets(dropNodes, dropRects);
      }

      const hit = targetAtPoint(pageX, pageY, dropRects.current, dropTargets);
      const nextKey = hit?.key ?? null;
      if (hoverKeyRef.current !== nextKey) {
        hoverKeyRef.current = nextKey;
        setHoverKey(nextKey);
      }
    },
    [autoScroll, clearGhostTimer, dropTargets, flushGhost],
  );

  const onTrackDragEnd = useCallback(
    (trackId: string, pageX: number, pageY: number) => {
      clearGhostTimer();
      latestGhost.current = null;
      lastGhostAt.current = 0;
      lastRemesureAt.current = 0;
      const hit = targetAtPoint(pageX, pageY, dropRects.current, dropTargets);
      dragIdRef.current = null;
      hoverKeyRef.current = null;
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
      if (!canWriteWithRole(albumRoleForAlbumId(hit.id))) {
        Alert.alert(FOLDER_READ_ONLY_MESSAGE);
        return;
      }
      useLibraryStore.getState().addTracksToAlbum(hit.id, [trackId]);
    },
    [clearGhostTimer, dropTargets],
  );

  const onHomeScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollY.current = event.nativeEvent.contentOffset.y;
    remesureDropTargets(dropNodes, dropRects);
  };

  const play = (trackId: string) => {
    void ensurePlayableAndOpen(trackId, matchingTracks.map((track) => track.id)).then((opened) => {
      if (!opened) {
        Alert.alert('Ascolto', 'Questo brano non è ancora arrivato. Riprova tra un attimo.');
      }
    });
  };

  const playlistRows = useMemo(() => {
    const rows: Array<{
      key: string;
      kind: 'folder' | 'playlist';
      id: string;
      name: string;
      meta: string;
    }> = [];
    for (const folder of visibleFolders) {
      const childCount = foldersIn(folder.id).length;
      rows.push({
        key: `folder:${folder.id}`,
        kind: 'folder',
        id: folder.id,
        name: folder.name,
        meta:
          childCount > 0
            ? `${childCount} playlist · ${folder.trackIds.length} tracce`
            : `${folder.trackIds.length} tracce`,
      });
    }
    for (const playlist of visiblePlaylists) {
      rows.push({
        key: `playlist:${playlist.id}`,
        kind: 'playlist',
        id: playlist.id,
        name: playlist.name,
        meta: `${playlist.trackIds.length} tracce`,
      });
    }
    return rows;
  }, [foldersIn, visibleFolders, visiblePlaylists]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <DeepBackdrop />
      <ScreenAura />
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <BrandMark size="sm" />
          <View style={styles.titleText}>
            <Text style={styles.title}>{headline}</Text>
            <Text style={styles.subtitle}>
              {q
                ? 'Risultati di ricerca'
                : `${albums.length} album · ${playlistCount} playlist · ${tracks.length} brani`}
            </Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => navigation.navigate('Help')}
            style={({ pressed }) => [styles.headerBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Guida"
          >
            <Text style={styles.headerBtnGlyph}>?</Text>
          </Pressable>
          <Pressable
            onPress={() => actions.openCreateMenu()}
            style={({ pressed }) => [styles.headerBtn, styles.headerBtnAccent, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Nuovo"
          >
            <Text style={styles.headerBtnAccentGlyph}>＋</Text>
          </Pressable>
          <Pressable
            onPress={() => navigation.navigate('Settings')}
            style={({ pressed }) => [styles.headerBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Impostazioni"
          >
            <Text style={styles.headerBtnGlyph}>⚙</Text>
          </Pressable>
        </View>
      </View>

      {!q ? (
        <View style={styles.statsRow}>
          <StatPill label="Album" value={albums.length} />
          <StatPill label="Playlist" value={playlistCount} />
          <StatPill label="Brani" value={tracks.length} />
        </View>
      ) : null}

      {!q ? (
        <View style={styles.quickRow}>
          <QuickAction icon={<FolderMark size={18} />} label="Playlist" onPress={() => actions.newFolder(null)} />
          <QuickAction icon={<AlbumMark size={18} />} label="Album" onPress={() => actions.openAlbumCreateMenu()} />
          <QuickAction
            icon={<BrandMark size="xs" />}
            label="Libreria"
            onPress={() => navigation.navigate('Library')}
          />
        </View>
      ) : null}

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

      <View style={styles.searchWrap}>
        <Text style={styles.searchIcon} accessibilityElementsHidden>
          ⌕
        </Text>
        <LibrarySearch value={query} onChangeText={setQuery} style={styles.searchInput} />
      </View>

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
          {searchEmpty ? (
            <GlassCard style={styles.emptyCard}>
              <EmptyGraphic />
              <Text style={styles.emptyTitle}>Nessun risultato</Text>
              <Text style={styles.emptyHint}>Prova un altro nome di playlist, album o brano.</Text>
            </GlassCard>
          ) : (
            <>
              {!q || visibleAlbums.length > 0 ? (
                <Section
                  title="Album"
                  icon={<AlbumMark />}
                  actionLabel="Nuova"
                  onAction={() => actions.openAlbumCreateMenu()}
                  flush={visibleAlbums.length > 0}
                >
                  {visibleAlbums.length === 0 ? (
                    <Pressable
                      onPress={() => actions.openAlbumCreateMenu()}
                      style={({ pressed }) => [styles.emptyCreate, pressed && styles.pressed]}
                    >
                      <EmptyGraphic />
                      <Text style={styles.emptyTitle}>Crea il tuo primo album</Text>
                      <Text style={styles.emptyHint}>
                        Sul telefono o da una cartella Cloud. Tocca qui per iniziare.
                      </Text>
                    </Pressable>
                  ) : (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.albumScroll}
                      keyboardShouldPersistTaps="handled"
                    >
                      {visibleAlbums.map((album) => (
                        <HomeDropTargetBox
                          key={album.id}
                          dropKey={`album:${album.id}`}
                          highlighted={hoverKey === `album:${album.id}`}
                          rects={dropRects}
                          nodes={dropNodes}
                        >
                          <AlbumTile
                            name={album.name}
                            imageUri={resolveLibraryUri(album.artworkUri) ?? ''}
                            meta={
                              album.origin === 'drive'
                                ? `Drive · ${albumTrackCount(album.trackIds, album.versionFolders)} tracce`
                                : album.artist ||
                                  `${albumTrackCount(album.trackIds, album.versionFolders)} tracce`
                            }
                            onPress={() => openCollection('album', album.id)}
                            onLongPress={() => actions.openAlbumMenu(album.id)}
                          />
                        </HomeDropTargetBox>
                      ))}
                    </ScrollView>
                  )}
                </Section>
              ) : null}

              {!q || visibleFolders.length > 0 || visiblePlaylists.length > 0 ? (
                <Section
                  title="Playlist"
                  icon={<FolderMark />}
                  actionLabel="Nuova"
                  onAction={() => actions.newFolder(null)}
                >
                  {playlistRows.length === 0 ? (
                    <Pressable
                      onPress={() => actions.newFolder(null)}
                      style={({ pressed }) => [styles.emptyCreate, pressed && styles.pressed]}
                    >
                      <EmptyGraphic />
                      <Text style={styles.emptyTitle}>Organizza con le playlist</Text>
                      <Text style={styles.emptyHint}>Raggruppa i brani per prova, lezione o setlist.</Text>
                    </Pressable>
                  ) : (
                    playlistRows.map((row, index) => {
                      const content = (
                        <CollectionRow
                          name={row.name}
                          meta={row.meta}
                          divider={index < playlistRows.length - 1}
                          onPress={() => openCollection(row.kind, row.id)}
                          onLongPress={() => {
                            if (row.kind === 'folder') {
                              const folder = rootFolders.find((item) => item.id === row.id);
                              if (folder) {
                                actions.openFolderMenu(folder);
                              }
                              return;
                            }
                            actions.openPlaylistMenu(row.id);
                          }}
                        />
                      );
                      if (row.kind === 'folder') {
                        return (
                          <HomeDropTargetBox
                            key={row.key}
                            dropKey={row.key}
                            highlighted={hoverKey === row.key}
                            rects={dropRects}
                            nodes={dropNodes}
                          >
                            {content}
                          </HomeDropTargetBox>
                        );
                      }
                      return <View key={row.key}>{content}</View>;
                    })
                  )}
                </Section>
              ) : null}

              {!q ? (
                <GlassCard style={styles.libraryCard}>
                  <Pressable
                    onPress={() => navigation.navigate('Library')}
                    style={({ pressed }) => [styles.libraryHit, pressed && styles.pressed]}
                    accessibilityRole="button"
                    accessibilityLabel="Apri la libreria"
                  >
                    <LinearGradient
                      colors={[colors.waveform, colors.accent]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.libraryAccent}
                    />
                    <View style={styles.libraryIconWrap}>
                      <BrandMark size="sm" />
                    </View>
                    <View style={styles.libraryText}>
                      <Text style={styles.cardLabel}>Libreria</Text>
                      <Text style={styles.libraryTitle}>Tutti i file</Text>
                      <Text style={styles.libraryMeta}>
                        {tracks.length === 1 ? '1 file sul telefono' : `${tracks.length} file sul telefono`}
                      </Text>
                    </View>
                    <View style={styles.libraryChevron}>
                      <Text style={styles.libraryChevronGlyph}>›</Text>
                    </View>
                  </Pressable>
                </GlassCard>
              ) : matchingTracks.length > 0 ? (
                <Section title="Brani">
                  {matchingTracks.length > 0 && dropTargets.length > 0 ? (
                    <Text style={styles.dragHint}>
                      Tieni premuto una traccia e trascinala in una playlist o in un album.
                    </Text>
                  ) : null}
                  {matchingTracks.map((track) => (
                    <HomeDraggableTrack
                      key={track.id}
                      trackId={track.id}
                      onMove={onTrackDragMove}
                      onEnd={onTrackDragEnd}
                    >
                      <TrackRow
                        track={track}
                        active={dragId === track.id}
                        noteAuthors={noteAuthorDots(markersByTrackId[track.id] ?? [])}
                        downloading={downloadingIds[track.id] != null}
                        swipeEnabled={dragId == null}
                        onPress={() => play(track.id)}
                        onArtwork={() => actions.pickTrackArtwork(track)}
                        onMenu={() => actions.openTrackMenu(track)}
                        onSwipeDelete={() => actions.confirmDeleteTrack(track)}
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
                  ))}
                </Section>
              ) : null}
            </>
          )}
        </ScrollView>
      </View>
      {dragId && ghost ? (
        <View pointerEvents="none" style={styles.ghostLayer}>
          <View style={[styles.ghostCard, { top: ghost.y - 36, left: 20, right: 20 }]}>
            <Text style={styles.ghostTitle} numberOfLines={1}>
              {tracks.find((track) => track.id === dragId)?.title ?? 'Traccia'}
            </Text>
            <Text style={styles.ghostHint}>
              {hoverKey ? 'Rilascia per aggiungere' : 'Portala su una playlist o un album'}
            </Text>
          </View>
        </View>
      ) : null}
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
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
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
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
  },
  titleText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  subtitle: {
    marginTop: 3,
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  headerBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBtnAccent: {
    backgroundColor: 'rgba(255, 107, 53, 0.14)',
    borderColor: 'rgba(255, 107, 53, 0.35)',
  },
  headerBtnGlyph: {
    color: colors.text,
    fontSize: 20,
  },
  headerBtnAccentGlyph: {
    color: colors.accent,
    fontSize: 22,
    fontWeight: '600',
    marginTop: -2,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 2,
  },
  statPill: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: 'rgba(26, 26, 30, 0.72)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  quickRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
  },
  quickAction: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: 'rgba(26, 26, 30, 0.72)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 6,
  },
  quickIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLabel: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
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
  searchWrap: {
    position: 'relative',
    marginTop: 8,
  },
  searchIcon: {
    position: 'absolute',
    left: 28,
    top: 22,
    zIndex: 1,
    color: colors.textMuted,
    fontSize: 18,
    lineHeight: 18,
  },
  searchInput: {
    paddingLeft: 38,
  },
  scrollHost: {
    flex: 1,
  },
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
    gap: 14,
  },
  card: {
    paddingBottom: 4,
  },
  cardFlush: {
    paddingBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 10,
  },
  cardTitleHit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  cardLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  cardAction: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '700',
  },
  albumScroll: {
    paddingHorizontal: 14,
    paddingBottom: 2,
    gap: 12,
  },
  albumTile: {
    width: 118,
  },
  albumArt: {
    width: 118,
    height: 118,
    borderRadius: 12,
    backgroundColor: colors.surfaceRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
  },
  albumArtFallback: {
    width: 118,
    height: 118,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
  },
  albumLetter: {
    color: colors.text,
    fontSize: 34,
    fontWeight: '700',
  },
  albumName: {
    marginTop: 8,
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 18,
  },
  albumMeta: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: 12,
  },
  libraryCard: {
    overflow: 'hidden',
  },
  libraryHit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 16,
    position: 'relative',
  },
  libraryAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  libraryIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  libraryText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  libraryTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  libraryMeta: {
    color: colors.textMuted,
    fontSize: 13,
  },
  libraryChevron: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  libraryChevronGlyph: {
    color: colors.textMuted,
    fontSize: 18,
    lineHeight: 20,
    marginTop: -1,
  },
  collectionRow: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  collectionRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.glassBorder,
  },
  collectionRowPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  thumb: {
    width: 46,
    height: 46,
    borderRadius: 10,
    backgroundColor: colors.surfaceRaised,
  },
  thumbFallback: {
    width: 46,
    height: 46,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbLetter: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  playlistIcon: {
    width: 46,
    height: 46,
    borderRadius: 10,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  collectionText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  collectionName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  collectionMeta: {
    color: colors.textMuted,
    fontSize: 12,
  },
  chevron: {
    color: colors.textMuted,
    fontSize: 20,
    lineHeight: 22,
  },
  dragHint: {
    paddingHorizontal: 14,
    paddingTop: 4,
    paddingBottom: 2,
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  emptyCard: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 28,
    gap: 6,
  },
  emptyCreate: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 22,
    gap: 6,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptyHint: {
    paddingHorizontal: 8,
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
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
  pressed: {
    opacity: 0.7,
  },
});
