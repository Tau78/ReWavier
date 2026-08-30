import { useMemo } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { albumTrackCount, type CollectionKind } from '../../domain/library';
import { resolveLibraryUri } from '../../files/libraryUris';
import type { MainTabNavigation } from '../../navigation/types';
import { useLibraryStore } from '../../store/libraryStore';
import { usePlayerStore } from '../../store/playerStore';
import { colors, DeepBackdrop, EmptyGraphic, GlassCard } from '../../theme';
import { HeroCovers } from '../library/HeroCovers';
import { openTrack } from '../library/openTrack';
import { useLibraryActions } from '../library/useLibraryActions';

type Nav = MainTabNavigation<'Home'>;

export function HomeScreen() {
  const navigation = useNavigation<Nav>();
  const tracks = useLibraryStore((s) => s.tracks);
  const albums = useLibraryStore((s) => s.albums);
  const playlists = useLibraryStore((s) => s.playlists);
  const playing = usePlayerStore((s) => s.track);
  const queueIds = usePlayerStore((s) => s.queueIds);
  const actions = useLibraryActions(null, (kind, id) => {
    navigation.navigate('Collection', { kind, id });
  });

  const hasContent = albums.length > 0 || playlists.length > 0 || tracks.length > 0;

  const recentTracks = useMemo(() => {
    const ids = queueIds.length > 0 ? queueIds : playing.id ? [playing.id] : [];
    const seen = new Set<string>();
    const next = [];
    for (const id of ids) {
      if (seen.has(id)) {
        continue;
      }
      const track = tracks.find((item) => item.id === id);
      if (!track) {
        continue;
      }
      seen.add(id);
      next.push(track);
      if (next.length >= 5) {
        break;
      }
    }
    return next;
  }, [queueIds, playing.id, tracks]);

  const albumPreview = albums.slice(0, 4);

  const openCollection = (kind: CollectionKind, id: string) => {
    navigation.navigate('Collection', { kind, id });
  };

  const play = (trackId: string) => {
    if (openTrack(trackId)) {
      navigation.navigate('Player');
      return;
    }
    Alert.alert('Non ancora sul telefono', 'Questo brano non è ancora scaricato. Aprilo dalla libreria.');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <DeepBackdrop />
      <View style={styles.header}>
        <Text style={styles.title}>Inizio</Text>
        <Text style={styles.subtitle}>Tocca una copertina per aprire un album o un brano.</Text>
      </View>

      {!hasContent ? (
        <View style={styles.emptyWrap}>
          <GlassCard style={styles.emptyCard}>
            <Pressable
              onPress={() => {
                void actions.importAudio(null);
              }}
              style={({ pressed }) => [styles.emptyHit, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Carica audio"
            >
              <EmptyGraphic />
              <Text style={styles.emptyTitle}>Non c’è ancora musica qui.</Text>
              <Text style={styles.emptyHint}>Tocca Carica audio per mettere i brani sul telefono.</Text>
              <Text style={styles.emptyAction}>Carica audio</Text>
            </Pressable>
          </GlassCard>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <HeroCovers
            albums={albums}
            playlists={playlists}
            tracks={tracks}
            onPressAlbum={(id) => openCollection('album', id)}
            onPressPlaylist={(id) => openCollection('playlist', id)}
            onPressTrack={play}
          />

          {recentTracks.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Ascoltati di recente</Text>
              {recentTracks.map((track) => (
                <Pressable
                  key={track.id}
                  onPress={() => play(track.id)}
                  style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel={`Ascolta ${track.title}`}
                >
                  <Thumb name={track.title} artworkUri={track.artworkUri} />
                  <View style={styles.rowMeta}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {track.title}
                    </Text>
                    <Text style={styles.rowSub} numberOfLines={1}>
                      {track.artist}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          ) : albumPreview.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Album</Text>
              {albumPreview.map((album) => (
                <Pressable
                  key={album.id}
                  onPress={() => openCollection('album', album.id)}
                  style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel={`Apri album ${album.name}`}
                >
                  <Thumb name={album.name} artworkUri={album.artworkUri} />
                  <View style={styles.rowMeta}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {album.name}
                    </Text>
                    <Text style={styles.rowSub} numberOfLines={1}>
                      {album.artist ||
                        `${albumTrackCount(album.trackIds)} ${
                          albumTrackCount(album.trackIds) === 1 ? 'traccia' : 'tracce'
                        }`}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          ) : tracks.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Brani</Text>
              {tracks.slice(0, 5).map((track) => (
                <Pressable
                  key={track.id}
                  onPress={() => play(track.id)}
                  style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel={`Ascolta ${track.title}`}
                >
                  <Thumb name={track.title} artworkUri={track.artworkUri} />
                  <View style={styles.rowMeta}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {track.title}
                    </Text>
                    <Text style={styles.rowSub} numberOfLines={1}>
                      {track.artist}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          ) : null}
        </ScrollView>
      )}
      {actions.modals}
    </SafeAreaView>
  );
}

function Thumb({ name, artworkUri }: { name: string; artworkUri?: string }) {
  const uri = resolveLibraryUri(artworkUri);
  const letter = (name.trim()[0] || '?').toUpperCase();
  if (uri) {
    return <Image source={{ uri }} style={styles.thumb} resizeMode="cover" />;
  }
  return (
    <View style={styles.thumbFallback}>
      <Text style={styles.thumbLetter}>{letter}</Text>
    </View>
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
    paddingBottom: 12,
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
  emptyWrap: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  emptyCard: {
    paddingBottom: 8,
  },
  emptyHit: {
    paddingHorizontal: 20,
    paddingVertical: 28,
    alignItems: 'center',
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptyHint: {
    marginTop: 8,
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  emptyAction: {
    marginTop: 16,
    color: colors.accent,
    fontSize: 15,
    fontWeight: '700',
  },
  scroll: {
    paddingBottom: 140,
    gap: 8,
  },
  section: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  rowMeta: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  rowSub: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: 13,
  },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: 6,
    backgroundColor: colors.surface,
  },
  thumbFallback: {
    width: 44,
    height: 44,
    borderRadius: 6,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbLetter: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.7,
  },
});
