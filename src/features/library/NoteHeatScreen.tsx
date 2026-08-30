import { useMemo } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';

import { buildNoteHeat, hottestBins, type NoteHeatBin } from '../../domain/noteHeat';
import type { RootStackParamList } from '../../navigation/types';
import { useLibraryStore } from '../../store/libraryStore';
import { colors, layout } from '../../theme/colors';
import { KindRow } from '../../theme/graphics';
import { openTrack } from './openTrack';

type Nav = NativeStackNavigationProp<RootStackParamList, 'NoteHeat'>;
type Route = RouteProp<RootStackParamList, 'NoteHeat'>;

const BAR_MAX = 72;
const BAR_MIN = 6;

function formatAround(ms: number): string {
  const clamped = Math.max(0, Math.floor(ms));
  const minutes = Math.floor(clamped / 60000);
  const seconds = Math.floor((clamped % 60000) / 1000);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function stretchLabel(bin: NoteHeatBin): string {
  const around = formatAround(Math.floor((bin.startMs + bin.endMs) / 2));
  if (bin.count === 1) {
    return `1 appunto intorno a ${around}`;
  }
  return `${bin.count} appunti intorno a ${around}`;
}

export function NoteHeatScreen() {
  const navigation = useNavigation<Nav>();
  const trackId = useRoute<Route>().params?.trackId;
  const track = useLibraryStore((s) => (trackId ? s.getTrack(trackId) : undefined));
  const markers = useLibraryStore((s) => (trackId ? s.markersByTrackId[trackId] ?? [] : []));

  const heat = useMemo(
    () => buildNoteHeat(Math.max(0, track?.durationMs ?? 0), markers),
    [track?.durationMs, markers],
  );
  const hotRows = useMemo(() => hottestBins(heat.bins), [heat.bins]);

  const goLibrary = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate('Library');
  };

  const playAt = (startAtMs: number) => {
    if (!trackId) {
      return;
    }
    if (!openTrack(trackId, [trackId], { autoPlay: true, startAtMs })) {
      Alert.alert(
        'Scarica',
        'Questa traccia non è ancora sul telefono. Scaricala e riprova.',
      );
      return;
    }
    navigation.navigate('Player');
  };

  if (!trackId) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.emptyBox}>
          <Text style={styles.empty}>Non trovo questa bozza.</Text>
          <Pressable onPress={goLibrary} style={styles.libraryBtn}>
            <Text style={styles.libraryLabel}>Fatto</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable
          onPress={goLibrary}
          hitSlop={layout.hitSlop}
          accessibilityRole="button"
          accessibilityLabel="Indietro"
        >
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <View style={styles.headerText}>
          <KindRow label="Bozza" />
          <Text style={styles.title} numberOfLines={1}>
            Dove hai scritto
          </Text>
          {track?.title ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {track.title}
            </Text>
          ) : null}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {heat.noteCount === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.empty}>Non ci sono appunti su questa bozza.</Text>
            <Pressable
              onPress={goLibrary}
              style={styles.libraryBtn}
              accessibilityRole="button"
              accessibilityLabel="Fatto"
            >
              <Text style={styles.libraryLabel}>Fatto</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Text style={styles.hint}>
              I tratti più alti sono dove hai scritto di più. Tocca uno per ascoltare da lì.
            </Text>
            <View style={styles.strip} accessibilityLabel="Mappa degli appunti sulla bozza">
              {heat.bins.map((bin) => {
                const ratio = heat.maxCount > 0 ? bin.count / heat.maxCount : 0;
                const height = BAR_MIN + (BAR_MAX - BAR_MIN) * ratio;
                const hot = bin.count > 0 && bin.count === heat.maxCount;
                return (
                  <Pressable
                    key={bin.index}
                    onPress={() => playAt(bin.startMs)}
                    style={styles.binHit}
                    accessibilityRole="button"
                    accessibilityLabel={
                      bin.count === 0
                        ? `Nessun appunto intorno a ${formatAround(bin.startMs)}`
                        : stretchLabel(bin)
                    }
                  >
                    <View
                      style={[
                        styles.bin,
                        {
                          height,
                          opacity: bin.count === 0 ? 0.22 : 0.4 + 0.6 * ratio,
                          backgroundColor: hot ? colors.accent : colors.waveform,
                        },
                      ]}
                    />
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.listLabel}>Punti più scritti</Text>
            {hotRows.map((bin) => (
              <Pressable
                key={bin.index}
                onPress={() => playAt(bin.startMs)}
                style={styles.row}
                accessibilityRole="button"
                accessibilityLabel={`${stretchLabel(bin)}. Apri l’audio da lì.`}
              >
                <View
                  style={[
                    styles.swatch,
                    {
                      backgroundColor:
                        bin.count === heat.maxCount ? colors.accent : colors.waveform,
                    },
                  ]}
                />
                <Text style={styles.rowText}>{stretchLabel(bin)}</Text>
              </Pressable>
            ))}

            <Pressable
              onPress={goLibrary}
              style={styles.libraryBtn}
              accessibilityRole="button"
              accessibilityLabel="Fatto"
            >
              <Text style={styles.libraryLabel}>Fatto</Text>
            </Pressable>
          </>
        )}
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
  subtitle: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: 13,
  },
  scroll: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  hint: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  strip: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: BAR_MAX + 8,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 2,
  },
  binHit: {
    flex: 1,
    height: '100%',
    justifyContent: 'flex-end',
  },
  bin: {
    width: '100%',
    borderRadius: 2,
  },
  listLabel: {
    marginTop: 22,
    marginBottom: 8,
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 8,
  },
  swatch: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  rowText: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  emptyBox: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  empty: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  libraryBtn: {
    marginTop: 20,
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  libraryLabel: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
});
