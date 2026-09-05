import { Pressable, StyleSheet, Text, View } from 'react-native';

import { isCustomRange, resolveTrackRange } from '../../domain/models';
import { formatPlaybackRateLabel, PLAYBACK_RATES } from '../../domain/playbackRate';
import { usePlayerStore } from '../../store/playerStore';
import { colors } from '../../theme/colors';

export function PracticeBar() {
  const track = usePlayerStore((s) => s.track);
  const rate = usePlayerStore((s) => s.rate);
  const setRate = usePlayerStore((s) => s.setRate);
  const markLoopA = usePlayerStore((s) => s.markLoopA);
  const markLoopB = usePlayerStore((s) => s.markLoopB);
  const clearLoop = usePlayerStore((s) => s.clearLoop);

  if (!track.id) {
    return null;
  }

  const range = resolveTrackRange(track);
  const loopOn = isCustomRange(range, track.durationMs);
  const aOn = range.startMs > 1;
  const bOn = range.endMs < Math.max(track.durationMs, 0) - 1;

  return (
    <View style={styles.bar}>
      <View style={styles.rates}>
        {PLAYBACK_RATES.map((step) => {
          const selected = step === rate;
          const label = formatPlaybackRateLabel(step);
          return (
            <Pressable
              key={step}
              onPress={() => setRate(step)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`Velocità ${label}`}
              style={({ pressed }) => [
                styles.chip,
                selected && styles.chipOn,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.chipText, selected && styles.chipTextOn]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.loop}>
        <Pressable
          onPress={markLoopA}
          accessibilityRole="button"
          accessibilityState={{ selected: aOn }}
          accessibilityLabel="A: da qui ricomincia"
          style={({ pressed }) => [styles.chip, aOn && styles.chipOn, pressed && styles.pressed]}
        >
          <Text style={[styles.chipText, aOn && styles.chipTextOn]}>A</Text>
        </Pressable>
        <Pressable
          onPress={markLoopB}
          accessibilityRole="button"
          accessibilityState={{ selected: bOn }}
          accessibilityLabel="B: qui finisce"
          style={({ pressed }) => [styles.chip, bOn && styles.chipOn, pressed && styles.pressed]}
        >
          <Text style={[styles.chipText, bOn && styles.chipTextOn]}>B</Text>
        </Pressable>
        <Pressable
          onPress={clearLoop}
          disabled={!loopOn}
          accessibilityRole="button"
          accessibilityState={{ disabled: !loopOn }}
          accessibilityLabel="Togli loop"
          style={({ pressed }) => [
            styles.chip,
            !loopOn && styles.chipOff,
            pressed && loopOn && styles.pressed,
          ]}
        >
          <Text style={[styles.chipText, !loopOn && styles.chipTextOff]}>Togli loop</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 6,
    gap: 6,
  },
  rates: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 3,
    flexGrow: 1,
    minWidth: 0,
  },
  loop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  chip: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 5,
    minHeight: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chipOn: {
    backgroundColor: colors.accent,
  },
  chipOff: {
    opacity: 0.4,
  },
  pressed: {
    opacity: 0.75,
  },
  chipText: {
    color: colors.text,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  chipTextOn: {
    color: colors.background,
  },
  chipTextOff: {
    color: colors.textMuted,
  },
});
