import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatTimecode } from '../../domain/models';
import type { RootStackParamList } from '../../navigation/types';
import { usePlayerStore } from '../../store/playerStore';
import { colors } from '../../theme/colors';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * Linguetta in basso: titolo + tempo. Tap → apre il player grande.
 * Controlli e + restano solo sul PlayerScreen.
 * Mostrata quando c’è un brano in riproduzione, anche se non è nella raccolta aperta.
 */
export function CollectionPlayer() {
  const navigation = useNavigation<Nav>();
  const track = usePlayerStore((s) => s.track);
  const positionMs = usePlayerStore((s) => s.positionMs);
  const isPlaying = usePlayerStore((s) => s.isPlaying);

  if (!track.id) {
    return null;
  }

  return (
    <SafeAreaView edges={['bottom']} style={styles.dock}>
      <View style={styles.handleRow} pointerEvents="none">
        <View style={styles.handle} />
      </View>
      <Pressable
        onPress={() => navigation.navigate('Player')}
        accessibilityRole="button"
        accessibilityLabel={`${track.title}. Apri il lettore`}
        style={({ pressed }) => [styles.tab, pressed && styles.tabPressed]}
      >
        <View style={styles.textCol}>
          <Text style={styles.title} numberOfLines={1}>
            {track.title}
          </Text>
          <Text style={styles.artist} numberOfLines={1}>
            {track.artist}
          </Text>
        </View>
        <View style={styles.metaCol}>
          <Text style={styles.playing}>{isPlaying ? 'In ascolto' : 'In pausa'}</Text>
          <Text style={styles.timecode} numberOfLines={1}>
            {formatTimecode(positionMs)}
            <Text style={styles.timecodeSep}> / </Text>
            {formatTimecode(track.durationMs)}
          </Text>
        </View>
      </Pressable>
    </SafeAreaView>
  );
}

const mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

const styles = StyleSheet.create({
  dock: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  handleRow: {
    alignItems: 'center',
    paddingTop: 8,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 10,
    minHeight: 56,
  },
  tabPressed: {
    opacity: 0.75,
  },
  textCol: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  artist: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '500',
  },
  metaCol: {
    alignItems: 'flex-end',
    maxWidth: '42%',
  },
  playing: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 2,
  },
  timecode: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
    fontFamily: mono,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  timecodeSep: {
    color: colors.textMuted,
  },
});
