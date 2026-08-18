import { StatusBar } from 'expo-status-bar';
import { Platform, SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { formatTimecode } from '../../domain/models';
import { NoteBubble } from '../notes/NoteBubble';
import { usePlayerStore } from '../../store/playerStore';
import { colors } from '../../theme/colors';
import { AddNoteButton } from './AddNoteButton';
import { PlaybackControls } from './PlaybackControls';
import { Waveform } from './Waveform';

export function PlayerScreen() {
  const track = usePlayerStore((s) => s.track);
  const positionMs = usePlayerStore((s) => s.positionMs);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={1}>
          {track.title}
        </Text>
        <Text style={styles.artist} numberOfLines={1}>
          {track.artist}
        </Text>
      </View>

      <View style={styles.timecodeRow}>
        <Text style={styles.timecodeNow}>{formatTimecode(positionMs)}</Text>
        <Text style={styles.timecodeSep}> / </Text>
        <Text style={styles.timecodeTotal}>{formatTimecode(track.durationMs)}</Text>
      </View>

      <View style={styles.wave}>
        <Waveform />
      </View>

      <PlaybackControls />
      <AddNoteButton />
      <NoteBubble />
    </SafeAreaView>
  );
}

const mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
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
  timecodeRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 12,
  },
  timecodeNow: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '600',
    fontFamily: mono,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.6,
  },
  timecodeSep: {
    color: colors.textMuted,
    fontSize: 18,
    fontFamily: mono,
  },
  timecodeTotal: {
    color: colors.textMuted,
    fontSize: 16,
    fontFamily: mono,
    fontVariant: ['tabular-nums'],
  },
  wave: {
    flex: 1,
    paddingHorizontal: 16,
    minHeight: 200,
  },
});
