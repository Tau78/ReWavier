import { useMemo, useRef, useState } from 'react';
import {
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from 'react-native';

import { isMarkerHidden, markerColor } from '../../domain/markers';
import { clampTime, formatTimecode, type Marker } from '../../domain/models';
import { usePlayerStore } from '../../store/playerStore';
import { colors } from '../../theme/colors';

const OVERVIEW_HEIGHT = 48;
const ZOOM_HEIGHT = 120;
const ZOOM_WINDOW_MS = 12_000;
const DRAG_THRESHOLD = 8;
const PIN_HIT = 44;

function getZoomWindow(positionMs: number, durationMs: number) {
  if (durationMs <= ZOOM_WINDOW_MS) {
    const spanMs = Math.max(durationMs, 1);
    return { startMs: 0, endMs: spanMs, spanMs };
  }
  const half = ZOOM_WINDOW_MS / 2;
  let startMs = positionMs - half;
  let endMs = positionMs + half;
  if (startMs < 0) {
    startMs = 0;
    endMs = ZOOM_WINDOW_MS;
  } else if (endMs > durationMs) {
    endMs = durationMs;
    startMs = durationMs - ZOOM_WINDOW_MS;
  }
  return { startMs, endMs, spanMs: endMs - startMs };
}

function samplePeaks(
  peaks: number[],
  startRatio: number,
  endRatio: number,
  barCount: number,
): number[] {
  if (peaks.length === 0 || barCount <= 0) {
    return [];
  }
  const last = peaks.length - 1;
  const out: number[] = [];
  for (let i = 0; i < barCount; i++) {
    const t = barCount === 1 ? 0 : i / (barCount - 1);
    const ratio = startRatio + (endRatio - startRatio) * t;
    const idx = Math.max(0, Math.min(last, ratio * last));
    const lo = Math.floor(idx);
    const hi = Math.min(last, lo + 1);
    const frac = idx - lo;
    const a = peaks[lo] ?? 0;
    const b = peaks[hi] ?? a;
    out.push(a + (b - a) * frac);
  }
  return out;
}

function PeakBars({
  values,
  height,
  playedRatio,
  barWidth,
}: {
  values: number[];
  height: number;
  playedRatio: number;
  barWidth: number;
}) {
  return (
    <View style={[styles.barsRow, { height }]} pointerEvents="none">
      {values.map((amp, i) => {
        const played = (i + 0.5) / values.length <= playedRatio;
        const barH = Math.max(3, amp * (height - 10));
        return (
          <View
            key={i}
            style={[
              styles.bar,
              {
                width: barWidth,
                height: barH,
                borderRadius: barWidth / 2,
                backgroundColor: played ? colors.waveformPlayed : colors.waveform,
                opacity: played ? 1 : 0.72,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

function Playhead({ percent, tall }: { percent: number; tall: boolean }) {
  const left = Math.max(0, Math.min(100, percent));
  return (
    <View
      pointerEvents="none"
      style={[styles.playhead, { left: `${left}%` }, tall && styles.playheadTall]}
    >
      <View style={styles.playheadNub} />
      <View style={styles.playheadLine} />
    </View>
  );
}

function ZoomMarkerPin({
  marker,
  windowStartMs,
  windowSpanMs,
  durationMs,
  trackWidth,
}: {
  marker: Marker;
  windowStartMs: number;
  windowSpanMs: number;
  durationMs: number;
  trackWidth: number;
}) {
  const openMarker = usePlayerStore((s) => s.openMarker);
  const moveMarker = usePlayerStore((s) => s.moveMarker);
  const [dragMs, setDragMs] = useState<number | null>(null);

  const latest = useRef({
    marker,
    windowStartMs,
    windowSpanMs,
    durationMs,
    trackWidth,
  });
  latest.current = { marker, windowStartMs, windowSpanMs, durationMs, trackWidth };

  const originMs = useRef(marker.timestampMs);
  const didDrag = useRef(false);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        originMs.current = latest.current.marker.timestampMs;
        didDrag.current = false;
        setDragMs(originMs.current);
      },
      onPanResponderMove: (_, gesture) => {
        const { trackWidth: w, windowSpanMs: span, durationMs: dur } = latest.current;
        if (w <= 0 || span <= 0) {
          return;
        }
        if (Math.abs(gesture.dx) >= DRAG_THRESHOLD || Math.abs(gesture.dy) >= DRAG_THRESHOLD) {
          didDrag.current = true;
        }
        setDragMs(clampTime(originMs.current + (gesture.dx / w) * span, dur));
      },
      onPanResponderRelease: (_, gesture) => {
        const { marker: m, trackWidth: w, windowSpanMs: span, durationMs: dur } =
          latest.current;
        if (!didDrag.current) {
          setDragMs(null);
          openMarker(m.id);
          return;
        }
        const next = clampTime(originMs.current + (w > 0 ? (gesture.dx / w) * span : 0), dur);
        setDragMs(null);
        moveMarker(m.id, next);
      },
      onPanResponderTerminate: () => {
        setDragMs(null);
      },
    }),
  ).current;

  const pinColor = markerColor(marker);
  const displayMs = dragMs ?? marker.timestampMs;
  const inWindow =
    displayMs >= windowStartMs - 40 && displayMs <= windowStartMs + windowSpanMs + 40;
  if (!inWindow && dragMs == null) {
    return null;
  }

  const rawPct = windowSpanMs > 0 ? ((displayMs - windowStartMs) / windowSpanMs) * 100 : 0;
  const leftPercent = Math.max(0, Math.min(100, rawPct));
  const dragging = dragMs != null && didDrag.current;

  return (
    <View
      style={[
        styles.zoomPinWrap,
        { left: `${leftPercent}%` },
        dragging && styles.zoomPinDragging,
      ]}
      {...pan.panHandlers}
      accessibilityRole="adjustable"
      accessibilityLabel={`Appunto a ${formatTimecode(displayMs)}`}
      accessibilityHint="Tocca per aprire, trascina per spostare"
    >
      {dragging ? (
        <Text style={styles.dragTime}>{formatTimecode(displayMs)}</Text>
      ) : null}
      <View
        style={[
          styles.pinHead,
          { backgroundColor: pinColor, shadowColor: pinColor },
          dragging && styles.pinHeadActive,
          marker.hidden && styles.pinHidden,
        ]}
      />
      <View
        style={[
          styles.pinStem,
          { backgroundColor: pinColor },
          dragging && styles.pinStemActive,
          marker.hidden && styles.pinHidden,
        ]}
      />
    </View>
  );
}

export function Waveform() {
  const track = usePlayerStore((s) => s.track);
  const peaks = usePlayerStore((s) => s.peaks);
  const markers = usePlayerStore((s) => s.markers);
  const showHidden = usePlayerStore((s) => s.showHidden);
  const toggleShowHidden = usePlayerStore((s) => s.toggleShowHidden);
  const visiblePins = useMemo(
    () => (showHidden ? markers : markers.filter((marker) => !isMarkerHidden(marker))),
    [markers, showHidden],
  );
  const positionMs = usePlayerStore((s) => s.positionMs);
  const seekTo = usePlayerStore((s) => s.seekTo);
  const openMarker = usePlayerStore((s) => s.openMarker);

  const [overviewWidth, setOverviewWidth] = useState(0);
  const [zoomWidth, setZoomWidth] = useState(0);

  const durationMs = Math.max(track.durationMs, 1);
  const window = useMemo(
    () => getZoomWindow(positionMs, durationMs),
    [positionMs, durationMs],
  );

  const overviewBars = useMemo(() => {
    const count = overviewWidth > 0 ? Math.max(48, Math.floor(overviewWidth / 3.4)) : 0;
    return samplePeaks(peaks, 0, 1, count);
  }, [peaks, overviewWidth]);

  const zoomBars = useMemo(() => {
    const count = zoomWidth > 0 ? Math.max(40, Math.floor(zoomWidth / 4.2)) : 0;
    return samplePeaks(peaks, window.startMs / durationMs, window.endMs / durationMs, count);
  }, [peaks, zoomWidth, window.startMs, window.endMs, durationMs]);

  const overviewPlayed = positionMs / durationMs;
  const zoomPlayed = (positionMs - window.startMs) / window.spanMs;
  const playheadOverviewPct = overviewPlayed * 100;
  const playheadZoomPct = zoomPlayed * 100;
  const windowLeftPct = (window.startMs / durationMs) * 100;
  const windowWidthPct = (window.spanMs / durationMs) * 100;

  const seekFromEvent = (
    event: GestureResponderEvent,
    width: number,
    startMs: number,
    spanMs: number,
  ) => {
    if (width <= 0 || spanMs <= 0) {
      return;
    }
    const ratio = Math.max(0, Math.min(1, event.nativeEvent.locationX / width));
    seekTo(clampTime(startMs + ratio * spanMs, durationMs));
  };

  const onOverviewLayout = (event: LayoutChangeEvent) => {
    const w = Math.round(event.nativeEvent.layout.width);
    if (w > 0 && w !== overviewWidth) {
      setOverviewWidth(w);
    }
  };

  const onZoomLayout = (event: LayoutChangeEvent) => {
    const w = Math.round(event.nativeEvent.layout.width);
    if (w > 0 && w !== zoomWidth) {
      setZoomWidth(w);
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardLabel}>Panoramica</Text>
          <View style={styles.cardMetaRow}>
            <Pressable onPress={toggleShowHidden} hitSlop={8} accessibilityRole="button">
              <Text style={[styles.cardMeta, showHidden && styles.hideOn]}>Hide</Text>
            </Pressable>
            <Text style={styles.cardMeta}>{formatTimecode(track.durationMs)}</Text>
          </View>
        </View>
        <Pressable
          onLayout={onOverviewLayout}
          onPress={(e) => seekFromEvent(e, overviewWidth, 0, durationMs)}
          style={styles.overviewTrack}
          accessibilityRole="adjustable"
          accessibilityLabel="Forma d'onda panoramica"
          accessibilityHint="Tocca per andare a quel punto"
        >
          <View
            pointerEvents="none"
            style={[
              styles.windowHighlight,
              { left: `${windowLeftPct}%`, width: `${windowWidthPct}%` },
            ]}
          />
          <PeakBars
            values={overviewBars}
            height={OVERVIEW_HEIGHT}
            playedRatio={overviewPlayed}
            barWidth={2}
          />
          {visiblePins.map((marker) => (
            <Pressable
              key={marker.id}
              onPress={() => openMarker(marker.id)}
              hitSlop={8}
              style={[
                styles.overviewDot,
                {
                  left: `${(marker.timestampMs / durationMs) * 100}%`,
                  backgroundColor: markerColor(marker),
                  opacity: marker.hidden ? 0.4 : 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Appunto a ${formatTimecode(marker.timestampMs)}`}
            />
          ))}
          <Playhead percent={playheadOverviewPct} tall={false} />
        </Pressable>
      </View>

      <View style={[styles.card, styles.zoomCard]}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardLabel}>Dettaglio · 12s</Text>
          <Text style={styles.cardMeta}>
            {formatTimecode(window.startMs)} – {formatTimecode(window.endMs)}
          </Text>
        </View>
        <View style={styles.zoomBody}>
          <Pressable
            onLayout={onZoomLayout}
            onPress={(e) => seekFromEvent(e, zoomWidth, window.startMs, window.spanMs)}
            style={styles.zoomTrack}
            accessibilityRole="adjustable"
            accessibilityLabel="Forma d'onda ingrandita"
            accessibilityHint="Tocca per andare a quel punto"
          >
            <PeakBars
              values={zoomBars}
              height={ZOOM_HEIGHT}
              playedRatio={zoomPlayed}
              barWidth={2.5}
            />
            <Playhead percent={playheadZoomPct} tall />
          </Pressable>
          {visiblePins.map((marker) => (
            <ZoomMarkerPin
              key={marker.id}
              marker={marker}
              windowStartMs={window.startMs}
              windowSpanMs={window.spanMs}
              durationMs={durationMs}
              trackWidth={zoomWidth}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    gap: 12,
    justifyContent: 'center',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
  },
  zoomCard: {
    flex: 1,
    minHeight: ZOOM_HEIGHT + 44,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  cardLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cardMeta: {
    color: colors.textMuted,
    fontSize: 11,
    fontVariant: ['tabular-nums'],
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
  hideOn: {
    color: colors.accent,
    fontWeight: '700',
  },
  pinHidden: {
    opacity: 0.4,
  },
  overviewTrack: {
    height: OVERVIEW_HEIGHT,
    overflow: 'hidden',
    borderRadius: 8,
    backgroundColor: colors.surfaceRaised,
  },
  zoomBody: {
    flex: 1,
    minHeight: ZOOM_HEIGHT,
  },
  zoomTrack: {
    flex: 1,
    minHeight: ZOOM_HEIGHT,
    borderRadius: 10,
    backgroundColor: colors.surfaceRaised,
    overflow: 'hidden',
  },
  barsRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  bar: {
    alignSelf: 'center',
  },
  windowHighlight: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,107,53,0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,107,53,0.45)',
    borderRadius: 6,
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
  playheadTall: {
    width: 14,
    marginLeft: -7,
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
  overviewDot: {
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
  zoomPinWrap: {
    position: 'absolute',
    top: 2,
    bottom: 2,
    width: PIN_HIT,
    marginLeft: -(PIN_HIT / 2),
    alignItems: 'center',
    zIndex: 6,
  },
  zoomPinDragging: {
    zIndex: 8,
  },
  dragTime: {
    position: 'absolute',
    top: 0,
    color: colors.text,
    fontSize: 10,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    backgroundColor: colors.surface,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  pinHead: {
    marginTop: 16,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.marker,
    borderWidth: 2,
    borderColor: colors.text,
    shadowColor: colors.marker,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.55,
    shadowRadius: 4,
    elevation: 4,
  },
  pinHeadActive: {
    width: 18,
    height: 18,
    borderRadius: 9,
    marginTop: 14,
  },
  pinStem: {
    flex: 1,
    width: 2,
    backgroundColor: colors.marker,
    borderRadius: 1,
    marginTop: -1,
    opacity: 0.95,
  },
  pinStemActive: {
    width: 3,
  },
});
