import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatTimecode } from '../../domain/models';
import { fileCreatedAtMs, formatFileCreatedAt } from '../../files/fileCreatedAt';
import type { RootStackParamList } from '../../navigation/types';
import { useLibraryStore } from '../../store/libraryStore';
import { usePlayerStore } from '../../store/playerStore';
import { colors, layout } from '../../theme/colors';
import { NoteBubble } from '../notes/NoteBubble';
import { AddNoteButton } from '../player/AddNoteButton';
import { PlaybackControls } from '../player/PlaybackControls';
import { Waveform } from '../player/Waveform';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type MetaMode = 'duration' | 'created';

/**
 * Player in pagina (Home / Libreria / album).
 * Linguetta: cicla ridotto (solo titolo/tempo) ↔ grande (onda 12s + una riga di comandi).
 * Tap sul titolo → apre la pagina audio (PlayerScreen).
 */
export function CollectionPlayer() {
  const navigation = useNavigation<Nav>();
  const focused = useIsFocused();
  const track = usePlayerStore((s) => s.track);
  const positionMs = usePlayerStore((s) => s.positionMs);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const dockExpanded = usePlayerStore((s) => s.dockExpanded);
  const setDockExpanded = usePlayerStore((s) => s.setDockExpanded);
  const toggleDockExpanded = usePlayerStore((s) => s.toggleDockExpanded);
  const libraryTrack = useLibraryStore((s) => (track.id ? s.getTrack(track.id) : undefined));
  const [metaMode, setMetaMode] = useState<MetaMode>('duration');
  const [createdLabel, setCreatedLabel] = useState<string | null>(null);

  useEffect(() => {
    setMetaMode('duration');
    const source = libraryTrack ?? track;
    const ms = fileCreatedAtMs(source);
    setCreatedLabel(ms != null ? formatFileCreatedAt(ms) : null);
  }, [track.id, libraryTrack?.fileUri, libraryTrack?.inboxUri, libraryTrack?.downloadedAt]);

  const openFullPage = () => {
    navigation.navigate('Player');
  };

  const stripGesture = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .activeOffsetY([-24, 24])
        .failOffsetX([-28, 28])
        .onEnd((e) => {
          if (e.translationY < -56 || e.velocityY < -400) {
            setDockExpanded(true);
            return;
          }
          if (e.translationY > 56 || e.velocityY > 400) {
            setDockExpanded(false);
          }
        }),
    [setDockExpanded],
  );

  if (!track.id) {
    return null;
  }

  const showCreated = metaMode === 'created' && createdLabel != null;

  return (
    <SafeAreaView edges={['bottom']} style={styles.dock}>
      <GestureDetector gesture={stripGesture}>
        <View>
          <Pressable
            onPress={toggleDockExpanded}
            accessibilityRole="button"
            accessibilityLabel={
              dockExpanded ? 'Riduci il player' : 'Espandi il player'
            }
            style={styles.handleRow}
          >
            <View style={styles.handle} />
          </Pressable>

          <View style={styles.header}>
            <Pressable
              onPress={openFullPage}
              hitSlop={layout.hitSlop}
              accessibilityRole="button"
              accessibilityLabel={`${track.title}. Apri la pagina dell’audio`}
              style={styles.headerText}
            >
              <Text style={styles.title} numberOfLines={1}>
                {track.title}
              </Text>
              <Text style={styles.artist} numberOfLines={1}>
                {track.artist}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                if (!dockExpanded) {
                  toggleDockExpanded();
                  return;
                }
                if (!createdLabel) {
                  return;
                }
                setMetaMode((mode) => (mode === 'duration' ? 'created' : 'duration'));
              }}
              hitSlop={layout.hitSlop}
              accessibilityRole="button"
              accessibilityLabel={
                !dockExpanded
                  ? isPlaying
                    ? 'In ascolto. Tocca per espandere'
                    : 'In pausa. Tocca per espandere'
                  : showCreated
                    ? `Creato il ${createdLabel}. Tocca per la durata`
                    : createdLabel
                      ? `Durata ${formatTimecode(track.durationMs)}. Tocca per la data del file`
                      : `Durata ${formatTimecode(track.durationMs)}`
              }
              style={styles.timecodeHit}
            >
              {!dockExpanded ? (
                <View style={styles.metaCol}>
                  <Text style={styles.playing}>{isPlaying ? 'In ascolto' : 'In pausa'}</Text>
                  <Text style={styles.timecode} numberOfLines={1}>
                    {formatTimecode(positionMs)}
                    <Text style={styles.timecodeSep}> / </Text>
                    {formatTimecode(track.durationMs)}
                  </Text>
                </View>
              ) : showCreated ? (
                <Text style={styles.timecode} numberOfLines={1}>
                  {createdLabel}
                </Text>
              ) : (
                <Text style={styles.timecode} numberOfLines={1}>
                  {formatTimecode(positionMs)}
                  <Text style={styles.timecodeSep}> / </Text>
                  {formatTimecode(track.durationMs)}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </GestureDetector>

      {dockExpanded ? (
        <>
          <View style={styles.wave}>
            <Waveform compact />
          </View>
          <PlaybackControls center={<AddNoteButton inline />} />
          {focused ? <NoteBubble /> : null}
        </>
      ) : null}
    </SafeAreaView>
  );
}

const mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

const styles = StyleSheet.create({
  dock: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 18,
  },
  handleRow: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 4,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.textMuted,
    opacity: 0.55,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  artist: {
    marginTop: 3,
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '500',
  },
  timecodeHit: {
    marginTop: 4,
    maxWidth: '46%',
  },
  metaCol: {
    alignItems: 'flex-end',
  },
  playing: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 2,
    textAlign: 'right',
  },
  timecode: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
    fontFamily: mono,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  timecodeSep: {
    color: colors.textMuted,
  },
  wave: {
    height: 164,
    paddingHorizontal: 16,
  },
});
