import { useMemo, useState, type ReactNode } from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
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
import { useSyncStore } from '../../store/syncStore';
import { colors, layout } from '../../theme/colors';
import { BrandMark, EmptyGraphic, ScreenAura } from '../../theme/graphics';
import { openTrack } from './openTrack';
import { TrackRow } from './TrackRow';
import { useLibraryActions } from './useLibraryActions';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Library'>;

function Section({
  title,
  actionLabel,
  onAction,
  children,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  children: ReactNode;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardLabel}>{title}</Text>
        {actionLabel && onAction ? (
          <Pressable onPress={onAction} hitSlop={layout.hitSlop}>
            <Text style={styles.cardAction}>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
      {children}
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
      (syncMessage || pendingReviews.length > 0 || needsFolderLink || needsFileRefresh) ? (
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

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <Section
          title="Cartelle"
          actionLabel="Nuova"
          onAction={() => actions.newFolder(null)}
        >
          {rootFolders.length === 0 ? (
            <Text style={styles.emptyHint}>Nessuna cartella. Tocca Nuova per crearne una.</Text>
          ) : (
            rootFolders.map((folder) => {
              const childCount = foldersIn(folder.id).length;
              return (
              <CollectionRow
                key={folder.id}
                name={folder.name}
                meta={
                  childCount > 0
                    ? `${childCount} cartelle · ${folder.trackIds.length} tracce`
                    : `${folder.trackIds.length} tracce`
                }
                onPress={() => openCollection('folder', folder.id)}
                onLongPress={() => actions.openFolderMenu(folder)}
              />
              );
            })
          )}
        </Section>

        <Section
          title="Album"
          actionLabel="Nuova"
          onAction={() => actions.openAlbumCreateMenu()}
        >
          {albums.length === 0 ? (
            <Text style={styles.emptyHint}>
              Tocca Nuova: album sul telefono, oppure da una cartella Cloud.
            </Text>
          ) : (
            albums.map((album) => (
              <CollectionRow
                key={album.id}
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

        <Section title="Tutte le tracce">
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
              <TrackRow
                key={track.id}
                track={track}
                noteCount={
                  (markersByTrackId[track.id] ?? []).filter((marker) => marker.hidden !== true)
                    .length
                }
                downloading={downloadingIds[track.id] != null}
                onPress={() => play(track.id)}
                onLongPress={() => actions.openTrackMenu(track)}
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
            ))
          )}
        </Section>
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
  emptyHint: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
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
