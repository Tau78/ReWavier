import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { RootStackParamList } from '../../navigation/types';
import { useLibraryStore } from '../../store/libraryStore';
import { colors, DeepBackdrop, GlassCard, layout } from '../../theme';
import { EmptyGraphic } from '../../theme/graphics';
import { CollectionPlayer } from './CollectionPlayer';
import { openTrack } from './openTrack';
import { TrackRow } from './TrackRow';
import { useLibraryActions } from './useLibraryActions';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Library'>;

export function LibraryScreen() {
  const navigation = useNavigation<Nav>();
  const tracks = useLibraryStore((s) => s.tracks);
  const markersByTrackId = useLibraryStore((s) => s.markersByTrackId);
  const downloadingIds = useLibraryStore((s) => s.downloadingIds);
  const actions = useLibraryActions(null, (kind, id) => {
    navigation.navigate('Collection', { kind, id });
  });

  const play = (trackId: string) => {
    if (openTrack(trackId, tracks.map((track) => track.id))) {
      return;
    }
    Alert.alert('Scarica', 'Questa traccia non è ancora sul telefono. Tocca ↓ per il download offline.');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <DeepBackdrop />
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={layout.hitSlop}
          accessibilityRole="button"
          accessibilityLabel="Indietro"
        >
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <View>
          <Text style={styles.title}>Libreria</Text>
          <Text style={styles.subtitle}>Tutti i file sul telefono</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <GlassCard style={styles.card}>
          {tracks.length === 0 ? (
            <Pressable
              onPress={() => {
                void actions.importAudio(null);
              }}
              style={({ pressed }) => [styles.emptyImport, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Carica audio"
            >
              <EmptyGraphic />
              <Text style={styles.emptyTitle}>Nessun audio in libreria</Text>
              <Text style={styles.emptyHint}>
                Tocca Carica audio, oppure metti i file in File → ReWavier → Audio.
              </Text>
              <Text style={styles.emptyAction}>Carica audio</Text>
            </Pressable>
          ) : (
            tracks.map((track) => (
              <TrackRow
                key={track.id}
                track={track}
                noteCount={
                  (markersByTrackId[track.id] ?? []).filter((marker) => marker.hidden !== true).length
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
            ))
          )}
        </GlassCard>
      </ScrollView>
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
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
  },
  back: {
    color: colors.textMuted,
    fontSize: 34,
    lineHeight: 36,
    width: 28,
    marginTop: -4,
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
    fontSize: 14,
  },
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
  },
  card: {
    paddingBottom: 4,
  },
  emptyImport: {
    paddingHorizontal: 14,
    paddingVertical: 20,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  emptyHint: {
    marginTop: 8,
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
