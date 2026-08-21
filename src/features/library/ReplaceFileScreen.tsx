import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatTimecode } from '../../domain/models';
import { copyReplacementAudio, pickReplacementAudio } from '../../files/libraryFiles';
import type { RootStackParamList } from '../../navigation/types';
import { ensurePeaks } from '../../audio/extractPeaks';
import { useLibraryStore } from '../../store/libraryStore';
import { usePlayerStore } from '../../store/playerStore';
import { colors, layout } from '../../theme/colors';
import { KindRow } from '../../theme/graphics';

type Nav = NativeStackNavigationProp<RootStackParamList, 'ReplaceFile'>;
type Route = RouteProp<RootStackParamList, 'ReplaceFile'>;

export function ReplaceFileScreen() {
  const navigation = useNavigation<Nav>();
  const { trackId: initialTrackId, albumId } = useRoute<Route>().params ?? {};
  const tracks = useLibraryStore((s) => s.tracks);
  const albums = useLibraryStore((s) => s.albums);
  const markersByTrackId = useLibraryStore((s) => s.markersByTrackId);

  const albumTracks = useMemo(() => {
    if (!albumId) {
      return tracks;
    }
    const album = albums.find((item) => item.id === albumId);
    if (!album) {
      return [];
    }
    return album.trackIds
      .map((id) => tracks.find((track) => track.id === id))
      .filter((track): track is NonNullable<typeof track> => track != null);
  }, [albumId, albums, tracks]);

  const [trackId, setTrackId] = useState(initialTrackId ?? albumTracks[0]?.id ?? null);
  const [picked, setPicked] = useState<{ uri: string; name: string } | null>(null);
  const [keepIds, setKeepIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (trackId) {
      setKeepIds(new Set((markersByTrackId[trackId] ?? []).map((marker) => marker.id)));
    }
  }, [trackId]);

  const track = tracks.find((item) => item.id === trackId) ?? null;
  const markers = track ? (markersByTrackId[track.id] ?? []) : [];

  const selectTrack = (id: string) => {
    setTrackId(id);
    setPicked(null);
    setKeepIds(new Set((markersByTrackId[id] ?? []).map((marker) => marker.id)));
  };

  const toggleKeep = (id: string) => {
    setKeepIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const onPick = () => {
    void (async () => {
      try {
        const file = await pickReplacementAudio();
        if (!file || !trackId) {
          return;
        }
        setPicked(file);
        if (keepIds.size === 0) {
          setKeepIds(new Set((markersByTrackId[trackId] ?? []).map((marker) => marker.id)));
        }
      } catch (error) {
        Alert.alert('File', error instanceof Error ? error.message : 'Riprova');
      }
    })();
  };

  const onSend = () => {
    if (!track || !picked) {
      return;
    }
    void (async () => {
      setBusy(true);
      try {
        const fileUri = await copyReplacementAudio(
          picked.uri,
          track.sourceFileName ?? picked.name,
        );
        useLibraryStore.getState().replaceTrackFile(track.id, fileUri, [...keepIds]);
        const next = useLibraryStore.getState().getTrack(track.id);
        if (next) {
          void ensurePeaks(next).catch(() => undefined);
          if (usePlayerStore.getState().track.id === next.id) {
            const nextMarkers = useLibraryStore.getState().markersByTrackId[next.id] ?? [];
            usePlayerStore.getState().loadTrack(next, nextMarkers);
          }
        }
        Alert.alert(
          'File sostituito',
          `${track.sourceFileName ?? track.title} è aggiornato (stesso nome). I marker non flaggati sono in Hide. Se l’album è su Drive, alla sync il file in nuvola verrà sovrascritto con lo stesso nome.`,
        );
        navigation.goBack();
      } catch (error) {
        Alert.alert('Sostituzione', error instanceof Error ? error.message : 'Riprova');
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={layout.hitSlop}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <View>
          <KindRow label="Album" />
          <Text style={styles.title}>Sostituisci file</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.step}>1. Quale file vuoi sostituire</Text>
        <View style={styles.card}>
          {albumTracks.length === 0 ? (
            <Text style={styles.empty}>Nessuna traccia.</Text>
          ) : (
            albumTracks.map((item) => (
              <Pressable
                key={item.id}
                onPress={() => selectTrack(item.id)}
                style={[styles.row, trackId === item.id && styles.rowOn]}
              >
                <Text style={styles.rowTitle}>{item.title}</Text>
                <Text style={styles.rowMeta}>{item.sourceFileName ?? item.artist}</Text>
              </Pressable>
            ))
          )}
        </View>

        <Text style={styles.step}>2. Nuova versione</Text>
        <Pressable onPress={onPick} style={styles.pick}>
          <Text style={styles.pickLabel}>
            {picked ? picked.name : 'Scegli il nuovo audio'}
          </Text>
        </Pressable>
        <Text style={styles.hint}>
          Verrà caricato con lo stesso nome ({track?.sourceFileName ?? 'nome attuale'}), al
          posto del file corrente.
        </Text>

        <Text style={styles.step}>3. Quali marker vuoi mantenere</Text>
        <Text style={styles.hint}>
          Flaggati restano visibili. Gli altri vanno in Hide (storico).
        </Text>
        <View style={styles.card}>
          {markers.length === 0 ? (
            <Text style={styles.empty}>Nessun marker su questa traccia.</Text>
          ) : (
            markers.map((marker) => {
              const on = keepIds.has(marker.id);
              return (
                <Pressable
                  key={marker.id}
                  onPress={() => toggleKeep(marker.id)}
                  style={styles.markerRow}
                >
                  <View style={[styles.box, on && styles.boxOn]} />
                  <View style={styles.markerMeta}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {marker.text || 'Senza testo'}
                    </Text>
                    <Text style={styles.rowMeta}>
                      {formatTimecode(marker.timestampMs)}
                      {marker.hidden ? ' · già Hide' : ''}
                      {marker.authorName ? ` · ${marker.authorName}` : ''}
                    </Text>
                  </View>
                </Pressable>
              );
            })
          )}
        </View>

        <Pressable
          onPress={onSend}
          disabled={!track || !picked || busy}
          style={[styles.send, (!track || !picked || busy) && styles.sendOff]}
        >
          <Text style={styles.sendLabel}>Invia</Text>
        </Pressable>
      </ScrollView>
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
    paddingBottom: 12,
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
  },
  scroll: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  step: {
    marginTop: 16,
    marginBottom: 8,
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  hint: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 8,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowOn: {
    backgroundColor: colors.surfaceRaised,
  },
  rowTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  rowMeta: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: 12,
  },
  empty: {
    color: colors.textMuted,
    fontSize: 14,
    padding: 16,
  },
  pick: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 8,
  },
  pickLabel: {
    color: colors.accent,
    fontSize: 16,
    fontWeight: '700',
  },
  markerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  box: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border,
  },
  boxOn: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  markerMeta: {
    flex: 1,
    minWidth: 0,
  },
  send: {
    marginTop: 24,
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  sendOff: {
    opacity: 0.4,
  },
  sendLabel: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
});
