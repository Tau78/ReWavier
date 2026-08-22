import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';

import { isMarkerHidden, markerColor } from '../../domain/markers';
import { clampTime, formatTimecode } from '../../domain/models';
import { usePlayerStore } from '../../store/playerStore';
import { colors } from '../../theme/colors';

const HEIGHT = 48;

function samplePeaks(peaks: number[], barCount: number): number[] {
  if (peaks.length === 0 || barCount <= 0) {
    return [];
  }
  const last = peaks.length - 1;
  const out: number[] = [];
  for (let i = 0; i < barCount; i++) {
    const t = barCount === 1 ? 0 : i / (barCount - 1);
    const idx = Math.max(0, Math.min(last, t * last));
    const lo = Math.floor(idx);
    const hi = Math.min(last, lo + 1);
    const frac = idx - lo;
    const a = peaks[lo] ?? 0;
    const b = peaks[hi] ?? a;
    out.push(a + (b - a) * frac);
  }
  return out;
}

export function TrackOverviewWaveform() {
  const peaks = usePlayerStore((s) => s.peaks);
  const markers = usePlayerStore((s) => s.markers);
  const showHidden = usePlayerStore((s) => s.showHidden);
  const positionMs = usePlayerStore((s) => s.positionMs);
  const durationMs = Math.max(usePlayerStore((s) => s.track.durationMs), 1);
  const seekTo = usePlayerStore((s) => s.seekTo);
  const openMarker = usePlayerStore((s) => s.openMarker);
  const [width, setWidth] = useState(0);

  const visiblePins = useMemo(
    () => (showHidden ? markers : markers.filter((marker) => !isMarkerHidden(marker))),
    [markers, showHidden],
  );
  const bars = useMemo(() => {
    const count = width > 0 ? Math.max(48, Math.floor(width / 3.4)) : 0;
    return samplePeaks(peaks, count);
  }, [peaks, width]);
  const playedRatio = positionMs / durationMs;

  const onLayout = (event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    if (next > 0 && next !== width) {
      setWidth(next);
    }
  };

  const seekFromEvent = (event: GestureResponderEvent) => {
    if (width <= 0) {
      return;
    }
    const ratio = Math.max(0, Math.min(1, event.nativeEvent.locationX / width));
    seekTo(clampTime(ratio * durationMs, durationMs));
  };

  return (
    <View style={styles.card}>
      <Pressable
        onLayout={onLayout}
        onPress={seekFromEvent}
        style={styles.track}
        accessibilityRole="adjustable"
        accessibilityLabel="Forma d'onda"
        accessibilityHint="Tocca per andare a quel punto. I puntini sono gli appunti."
      >
        <View style={styles.bars} pointerEvents="none">
          {bars.map((amp, i) => {
            const played = (i + 0.5) / bars.length <= playedRatio;
            return (
              <View
                key={i}
                style={[
                  styles.bar,
                  {
                    height: Math.max(3, amp * (HEIGHT - 10)),
                    backgroundColor: played ? colors.waveformPlayed : colors.waveform,
                    opacity: played ? 1 : 0.72,
                  },
                ]}
              />
            );
          })}
        </View>
        {visiblePins.map((marker) => {
          const left = (marker.timestampMs / durationMs) * 100;
          if (left < -4 || left > 104) {
            return null;
          }
          return (
            <Pressable
              key={marker.id}
              onPress={() => openMarker(marker.id)}
              hitSlop={8}
              style={[
                styles.dot,
                {
                  left: `${left}%`,
                  backgroundColor: markerColor(marker),
                  opacity: marker.hidden ? 0.4 : 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Appunto a ${formatTimecode(marker.timestampMs)}`}
            />
          );
        })}
        <View pointerEvents="none" style={[styles.playhead, { left: `${playedRatio * 100}%` }]}>
          <View style={styles.playheadNub} />
          <View style={styles.playheadLine} />
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  track: {
    height: HEIGHT,
    overflow: 'hidden',
    borderRadius: 8,
    backgroundColor: colors.surfaceRaised,
  },
  bars: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  bar: {
    width: 2,
    borderRadius: 1,
    alignSelf: 'center',
  },
  dot: {
    position: 'absolute',
    bottom: 5,
    width: 7,
    height: 7,
    marginLeft: -3.5,
    borderRadius: 4,
    backgroundColor: colors.marker,
    borderWidth: 1,
    borderColor: colors.background,
    zIndex: 3,
  },
  playhead: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 12,
    marginLeft: -6,
    alignItems: 'center',
    zIndex: 4,
  },
  playheadNub: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: colors.waveformPlayed,
  },
  playheadLine: {
    flex: 1,
    width: 2,
    backgroundColor: colors.waveformPlayed,
    borderRadius: 1,
    opacity: 0.95,
  },
});
