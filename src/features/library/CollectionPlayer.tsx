import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatTimecode } from '../../domain/models';
import type { RootStackParamList } from '../../navigation/types';
import { usePlayerStore } from '../../store/playerStore';
import { colors, layout } from '../../theme/colors';
import { NoteBubble } from '../notes/NoteBubble';
import { AddNoteButton } from '../player/AddNoteButton';
import { PlaybackControls } from '../player/PlaybackControls';
import { TrackOverviewWaveform } from './TrackOverviewWaveform';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function CollectionPlayer({ trackIds }: { trackIds: string[] }) {
  const navigation = useNavigation<Nav>();
  const focused = useIsFocused();
  const track = usePlayerStore((s) => s.track);
  const positionMs = usePlayerStore((s) => s.positionMs);
  const inCollection = Boolean(track.id) && trackIds.includes(track.id);

  if (trackIds.length === 0 || !inCollection) {
    return null;
  }

  return (
    <SafeAreaView edges={['bottom']} style={styles.dock}>
      <Pressable
        onPress={() => navigation.navigate('Player')}
        hitSlop={layout.hitSlop}
        accessibilityRole="button"
        accessibilityLabel={`${track.title}. Apri il lettore grande`}
        style={styles.header}
      >
        <View style={styles.headerText}>
          <Text style={styles.title} numberOfLines={1}>
            {track.title}
          </Text>
          <Text style={styles.artist} numberOfLines={1}>
            {track.artist}
          </Text>
        </View>
        <Text style={styles.timecode} numberOfLines={1}>
          {formatTimecode(positionMs)}
          <Text style={styles.timecodeSep}> / </Text>
          {formatTimecode(track.durationMs)}
        </Text>
      </Pressable>

      <View style={styles.wave}>
        <TrackOverviewWaveform />
      </View>

      <PlaybackControls />
      <AddNoteButton />
      {focused ? <NoteBubble /> : null}
    </SafeAreaView>
  );
}

const mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

const styles = StyleSheet.create({
  dock: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 10,
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
  timecode: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
    fontFamily: mono,
    fontVariant: ['tabular-nums'],
    marginTop: 4,
  },
  timecodeSep: {
    color: colors.textMuted,
  },
  wave: {
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
});
