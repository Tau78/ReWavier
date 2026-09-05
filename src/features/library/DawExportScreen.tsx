import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';

import { markersForExport } from '../../domain/export';
import { shareDawExport, type DawTarget } from '../../files/exportDaw';
import type { RootStackParamList } from '../../navigation/types';
import { useLibraryStore } from '../../store/libraryStore';
import { colors, layout } from '../../theme/colors';
import { KindRow } from '../../theme/graphics';

type Nav = NativeStackNavigationProp<RootStackParamList, 'DawExport'>;
type Route = RouteProp<RootStackParamList, 'DawExport'>;

const TARGETS: { id: DawTarget; label: string }[] = [
  { id: 'logic', label: 'Logic' },
  { id: 'ableton', label: 'Ableton' },
  { id: 'reaper', label: 'Reaper' },
];

export function DawExportScreen() {
  const navigation = useNavigation<Nav>();
  const trackId = useRoute<Route>().params?.trackId;
  const tracks = useLibraryStore((s) => s.tracks);
  const markersByTrackId = useLibraryStore((s) => s.markersByTrackId);
  const [busy, setBusy] = useState(false);

  const track = useMemo(
    () => tracks.find((item) => item.id === trackId) ?? null,
    [tracks, trackId],
  );
  const markers = track ? (markersByTrackId[track.id] ?? []) : [];
  const visibleCount = markersForExport(markers).length;

  useEffect(() => {
    if (!trackId || !track) {
      navigation.goBack();
    }
  }, [track, trackId, navigation]);

  if (!track) {
    return null;
  }

  const share = (target: DawTarget) => {
    if (busy) {
      return;
    }
    setBusy(true);
    void shareDawExport(track, markers, target)
      .catch(() => {
        Alert.alert('Salva', 'Non riesco ad aprire il foglio per salvare.');
      })
      .finally(() => {
        setBusy(false);
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
          <KindRow label="Esporta" />
          <Text style={styles.title} numberOfLines={2}>
            {track.title}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.hint}>
          Scegli il programma. Ti si apre il foglio per salvare il file.
        </Text>
        <Text style={styles.count}>
          {visibleCount === 0
            ? 'Non ci sono appunti visibili su questa traccia.'
            : visibleCount === 1
              ? '1 appunto'
              : `${visibleCount} appunti`}
        </Text>
        {TARGETS.map((target) => (
          <Pressable
            key={target.id}
            onPress={() => share(target.id)}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={target.label}
            style={({ pressed }) => [
              styles.button,
              pressed && styles.buttonPressed,
              busy && styles.buttonBusy,
            ]}
          >
            <Text style={styles.buttonLabel}>{target.label}</Text>
          </Pressable>
        ))}
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
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 12,
    gap: 8,
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
  scroll: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  hint: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 8,
  },
  count: {
    color: colors.textMuted,
    fontSize: 13,
    marginBottom: 16,
  },
  button: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 12,
    alignItems: 'center',
  },
  buttonPressed: {
    backgroundColor: colors.surfaceRaised,
  },
  buttonBusy: {
    opacity: 0.55,
  },
  buttonLabel: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
});
