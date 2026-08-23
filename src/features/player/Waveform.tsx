import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';

import { isMarkerHidden, markerColor } from '../../domain/markers';
import {
  clampTime,
  formatTimecode,
  isCustomRange,
  resolveTrackRange,
  type Marker,
} from '../../domain/models';
import { usePlayerStore } from '../../store/playerStore';
import { colors } from '../../theme/colors';

const OVERVIEW_HEIGHT = 48;
const ZOOM_HEIGHT = 120;
const DEFAULT_DETAIL_MS = 12_000;
const MIN_WINDOW_MS = 800;
const DRAG_THRESHOLD = 8;
const PIN_HIT = 44;
const HANDLE_HIT = 28;
const PLAYHEAD_HALF = 7;

function clampWindowMs(ms: number, durationMs: number): number {
  return Math.min(Math.max(durationMs, 1), Math.max(MIN_WINDOW_MS, ms));
}

function getTimeWindow(positionMs: number, durationMs: number, windowMs: number) {
  const spanMs = clampWindowMs(windowMs, durationMs);
  if (durationMs <= spanMs) {
    return { startMs: 0, endMs: durationMs, spanMs: durationMs };
  }
  const half = spanMs / 2;
  let startMs = positionMs - half;
  let endMs = positionMs + half;
  if (startMs < 0) {
    startMs = 0;
    endMs = spanMs;
  } else if (endMs > durationMs) {
    endMs = durationMs;
    startMs = durationMs - spanMs;
  }
  return { startMs, endMs, spanMs: endMs - startMs };
}

function formatWindowSeconds(ms: number): string {
  if (ms >= 9_500) {
    return `${Math.round(ms / 1000)}s`;
  }
  const seconds = ms / 1000;
  return `${seconds.toFixed(seconds >= 2 ? 0 : 1)}s`;
}

function markerAuthorName(marker: Marker): string {
  const name = marker.authorName?.trim();
  return name || 'Tu';
}

function markerPreview(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (!flat) {
    return '';
  }
  if (flat.length <= 56) {
    return flat;
  }
  return `${flat.slice(0, 55).trim()}…`;
}

function useWaveformGestures(
  width: number,
  viewStartMs: number,
  viewSpanMs: number,
  setSpanMs: (ms: number) => void,
  minMs: number,
  maxMs: number,
) {
  const startSpan = useRef(viewSpanMs);
  const spanRef = useRef(viewSpanMs);
  const minRef = useRef(minMs);
  const maxRef = useRef(maxMs);
  const widthRef = useRef(width);
  const viewStartRef = useRef(viewStartMs);
  const scrubOrigin = useRef(0);
  spanRef.current = viewSpanMs;
  minRef.current = minMs;
  maxRef.current = maxMs;
  widthRef.current = width;
  viewStartRef.current = viewStartMs;

  return useMemo(() => {
    const pinch = Gesture.Pinch()
      .runOnJS(true)
      .onStart(() => {
        startSpan.current = spanRef.current;
      })
      .onUpdate((event) => {
        const scale = event.scale > 0 ? event.scale : 1;
        setSpanMs(Math.min(maxRef.current, Math.max(minRef.current, startSpan.current / scale)));
      });

    const pan = Gesture.Pan()
      .runOnJS(true)
      .activeOffsetX([-10, 10])
      .failOffsetY([-24, 24])
      .onStart(() => {
        scrubOrigin.current = usePlayerStore.getState().positionMs;
      })
      .onUpdate((event) => {
        const w = widthRef.current;
        const span = spanRef.current;
        if (w <= 0 || span <= 0) {
          return;
        }
        usePlayerStore.getState().seekTo(scrubOrigin.current - (event.translationX / w) * span);
      });

    const tap = Gesture.Tap()
      .runOnJS(true)
      .onEnd((event) => {
        const w = widthRef.current;
        const span = spanRef.current;
        if (w <= 0 || span <= 0) {
          return;
        }
        const ratio = Math.max(0, Math.min(1, event.x / w));
        usePlayerStore.getState().seekTo(viewStartRef.current + ratio * span);
      });

    return Gesture.Simultaneous(pinch, Gesture.Exclusive(pan, tap));
  }, [setSpanMs]);
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

function pxPerMs(width: number, durationMs: number, windowMs: number): number {
  return width / Math.min(windowMs, Math.max(durationMs, 1));
}

function tapeSpanFor(windowMs: number, durationMs: number): number {
  return Math.min(Math.max(windowMs * 3, windowMs), Math.max(durationMs, 1));
}

function tapeStartFor(
  positionMs: number,
  durationMs: number,
  current: number,
  windowMs: number,
): number {
  const span = tapeSpanFor(windowMs, durationMs);
  const pad = windowMs * 0.65;
  const maxStart = Math.max(0, durationMs - span);
  if (durationMs <= span) {
    return 0;
  }
  const left = positionMs - current;
  const right = current + span - positionMs;
  if (left >= pad && right >= pad && current <= maxStart) {
    return current;
  }
  return Math.max(0, Math.min(maxStart, positionMs - span / 2));
}

function playheadOffsetPx(
  positionMs: number,
  durationMs: number,
  width: number,
  windowMs: number,
): number {
  const scale = pxPerMs(width, durationMs, windowMs);
  const half = width / 2;
  if (durationMs <= windowMs) {
    return positionMs * (width / Math.max(durationMs, 1));
  }
  if (positionMs * scale < half) {
    return positionMs * scale;
  }
  if ((durationMs - positionMs) * scale < half) {
    return width - (durationMs - positionMs) * scale;
  }
  return half;
}

function tapeTranslateX(
  positionMs: number,
  tapeStartMs: number,
  durationMs: number,
  width: number,
  windowMs: number,
): number {
  return (
    playheadOffsetPx(positionMs, durationMs, width, windowMs) -
    (positionMs - tapeStartMs) * pxPerMs(width, durationMs, windowMs)
  );
}

function PeakBars({
  values,
  height,
  playedRatio,
  barWidth,
  rowWidth,
}: {
  values: number[];
  height: number;
  playedRatio: number;
  barWidth: number;
  rowWidth?: number;
}) {
  return (
    <View
      style={[styles.barsRow, { height }, rowWidth != null ? { width: rowWidth } : { flex: 1 }]}
      pointerEvents="none"
    >
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
  tapeStartMs,
  tapeSpanMs,
  tapeWidth,
  px,
  durationMs,
}: {
  marker: Marker;
  tapeStartMs: number;
  tapeSpanMs: number;
  tapeWidth: number;
  px: number;
  durationMs: number;
}) {
  const openMarker = usePlayerStore((s) => s.openMarker);
  const moveMarker = usePlayerStore((s) => s.moveMarker);
  const [dragMs, setDragMs] = useState<number | null>(null);

  const latest = useRef({ marker, tapeStartMs, tapeSpanMs, px, durationMs });
  latest.current = { marker, tapeStartMs, tapeSpanMs, px, durationMs };

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
        const { px: scale, durationMs: dur } = latest.current;
        if (scale <= 0) {
          return;
        }
        if (Math.abs(gesture.dx) >= DRAG_THRESHOLD || Math.abs(gesture.dy) >= DRAG_THRESHOLD) {
          didDrag.current = true;
        }
        setDragMs(clampTime(originMs.current + gesture.dx / scale, dur));
      },
      onPanResponderRelease: (_, gesture) => {
        const { marker: m, px: scale, durationMs: dur } = latest.current;
        if (!didDrag.current) {
          setDragMs(null);
          openMarker(m.id);
          return;
        }
        const next = clampTime(originMs.current + (scale > 0 ? gesture.dx / scale : 0), dur);
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
  const onTape =
    displayMs >= tapeStartMs - 40 && displayMs <= tapeStartMs + tapeSpanMs + 40;
  if (!onTape && dragMs == null) {
    return null;
  }

  const left = (displayMs - tapeStartMs) * px;
  const dragging = dragMs != null && didDrag.current;
  const author = markerAuthorName(marker);
  const preview = markerPreview(marker.text);
  const says = author === 'Tu' ? 'Tu dici:' : `${author} dice:`;
  const flipLeft = tapeWidth > 0 && left > tapeWidth * 0.58;

  return (
    <View
      style={[styles.zoomPinWrap, { left }, dragging && styles.zoomPinDragging]}
      {...pan.panHandlers}
      accessibilityRole="adjustable"
      accessibilityLabel={`${says} ${preview || formatTimecode(displayMs)}`}
      accessibilityHint="Tocca per aprire, trascina per spostare"
    >
      {dragging ? <Text style={styles.dragTime}>{formatTimecode(displayMs)}</Text> : null}
      {!dragging ? (
        <View
          pointerEvents="none"
          style={[
            styles.pinBubble,
            { borderColor: pinColor },
            flipLeft ? styles.pinBubbleLeft : styles.pinBubbleRight,
            marker.hidden && styles.pinHidden,
          ]}
        >
          <Text style={[styles.pinBubbleWho, { color: pinColor }]} numberOfLines={1}>
            {says}
          </Text>
          {preview ? (
            <Text style={styles.pinBubbleText} numberOfLines={2}>
              {preview}
            </Text>
          ) : null}
        </View>
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

function RangeHandle({
  side,
  timeMs,
  durationMs,
  trackWidth,
  windowStartMs,
  windowSpanMs,
  seekWhileDrag,
  leftPx,
}: {
  side: 'start' | 'end';
  timeMs: number;
  durationMs: number;
  trackWidth: number;
  windowStartMs?: number;
  windowSpanMs?: number;
  seekWhileDrag: boolean;
  leftPx?: number;
}) {
  const setStartMs = usePlayerStore((s) => s.setStartMs);
  const setEndMs = usePlayerStore((s) => s.setEndMs);
  const pause = usePlayerStore((s) => s.pause);

  const latest = useRef({
    timeMs,
    durationMs,
    trackWidth,
    windowStartMs,
    windowSpanMs,
    side,
    seekWhileDrag,
  });
  latest.current = {
    timeMs,
    durationMs,
    trackWidth,
    windowStartMs,
    windowSpanMs,
    side,
    seekWhileDrag,
  };
  const originMs = useRef(timeMs);

  const apply = (dx: number, persist: boolean) => {
    const { durationMs: dur, trackWidth: w, windowSpanMs: span, side: which, seekWhileDrag: scrub } =
      latest.current;
    if (w <= 0) {
      return;
    }
    const scale = span != null && span > 0 ? span / w : dur / w;
    const next = clampTime(originMs.current + dx * scale, dur);
    const options = { persist, seek: persist || scrub };
    if (which === 'start') {
      setStartMs(next, options);
    } else {
      setEndMs(next, options);
    }
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        originMs.current = latest.current.timeMs;
        pause();
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      },
      onPanResponderMove: (_, gesture) => {
        apply(gesture.dx, false);
      },
      onPanResponderRelease: (_, gesture) => {
        apply(gesture.dx, true);
      },
      onPanResponderTerminate: (_, gesture) => {
        apply(gesture.dx, true);
      },
    }),
  ).current;

  const start = windowStartMs ?? 0;
  const span = windowSpanMs ?? durationMs;
  if (span <= 0 || timeMs < start - 80 || timeMs > start + span + 80) {
    return null;
  }
  const leftStyle =
    leftPx != null
      ? { left: leftPx }
      : { left: `${((timeMs - start) / span) * 100}%` as `${number}%` };

  return (
    <View
      style={[styles.handleHit, leftStyle]}
      {...pan.panHandlers}
      accessibilityRole="adjustable"
      accessibilityLabel={side === 'start' ? 'Inizio' : 'Fine'}
      accessibilityHint="Trascina per scegliere dove parte o dove finisce"
    >
      <View style={[styles.handleBody, side === 'start' ? styles.handleStart : styles.handleEnd]}>
        <View style={styles.handleGrip} />
      </View>
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
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const openMarker = usePlayerStore((s) => s.openMarker);
  const playFrom = usePlayerStore((s) => s.playFrom);
  const cuePoints = useMemo(
    () => [...visiblePins].sort((a, b) => a.timestampMs - b.timestampMs),
    [visiblePins],
  );

  const [overviewWidth, setOverviewWidth] = useState(0);
  const [zoomWidth, setZoomWidth] = useState(0);
  const [tapeStartMs, setTapeStartMs] = useState(0);
  const [detailWindowMs, setDetailWindowMs] = useState(DEFAULT_DETAIL_MS);
  const [overviewWindowMs, setOverviewWindowMs] = useState(Number.MAX_SAFE_INTEGER);

  const translateX = useRef(new Animated.Value(0)).current;
  const playheadX = useRef(new Animated.Value(0)).current;
  const tapeStartRef = useRef(0);
  const lastDetailSpan = useRef(DEFAULT_DETAIL_MS);

  const durationMs = Math.max(track.durationMs, 1);
  const detailSpan = clampWindowMs(detailWindowMs, durationMs);
  const overviewSpan = clampWindowMs(overviewWindowMs, durationMs);
  const range = resolveTrackRange(track);
  const customRange = isCustomRange(range, track.durationMs);
  const window = useMemo(
    () => getTimeWindow(positionMs, durationMs, detailSpan),
    [positionMs, durationMs, detailSpan],
  );
  const overviewView = useMemo(
    () => getTimeWindow(positionMs, durationMs, overviewSpan),
    [positionMs, durationMs, overviewSpan],
  );

  useEffect(() => {
    setDetailWindowMs(Math.min(DEFAULT_DETAIL_MS, Math.max(track.durationMs, 1)));
    setOverviewWindowMs(Number.MAX_SAFE_INTEGER);
    tapeStartRef.current = 0;
    setTapeStartMs(0);
  }, [track.id]);

  const tapeSpanMs = tapeSpanFor(detailSpan, durationMs);
  const scale = zoomWidth > 0 ? pxPerMs(zoomWidth, durationMs, detailSpan) : 0;
  const tapeWidth = tapeSpanMs * scale;

  const overviewGestures = useWaveformGestures(
    overviewWidth,
    overviewView.startMs,
    overviewView.spanMs,
    setOverviewWindowMs,
    MIN_WINDOW_MS,
    durationMs,
  );
  const detailGestures = useWaveformGestures(
    zoomWidth,
    window.startMs,
    window.spanMs,
    setDetailWindowMs,
    MIN_WINDOW_MS,
    durationMs,
  );

  useEffect(() => {
    const nextTape = tapeStartFor(positionMs, durationMs, tapeStartRef.current, detailSpan);
    const tapeChanged = nextTape !== tapeStartRef.current;
    const spanChanged = lastDetailSpan.current !== detailSpan;
    lastDetailSpan.current = detailSpan;
    if (tapeChanged) {
      tapeStartRef.current = nextTape;
      setTapeStartMs(nextTape);
    }
    if (zoomWidth <= 0) {
      return;
    }
    const tx = tapeTranslateX(positionMs, nextTape, durationMs, zoomWidth, detailSpan);
    const hx = playheadOffsetPx(positionMs, durationMs, zoomWidth, detailSpan) - PLAYHEAD_HALF;
    if (isPlaying && !tapeChanged && !spanChanged) {
      Animated.parallel([
        Animated.timing(translateX, {
          toValue: tx,
          duration: 52,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(playheadX, {
          toValue: hx,
          duration: 52,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }
    translateX.setValue(tx);
    playheadX.setValue(hx);
  }, [positionMs, isPlaying, zoomWidth, durationMs, detailSpan, translateX, playheadX]);

  const overviewBars = useMemo(() => {
    const count = overviewWidth > 0 ? Math.max(48, Math.floor(overviewWidth / 3.4)) : 0;
    return samplePeaks(
      peaks,
      overviewView.startMs / durationMs,
      overviewView.endMs / durationMs,
      count,
    );
  }, [peaks, overviewWidth, overviewView.startMs, overviewView.endMs, durationMs]);

  const zoomBars = useMemo(() => {
    const count = tapeWidth > 0 ? Math.max(40, Math.floor(tapeWidth / 4.2)) : 0;
    return samplePeaks(peaks, tapeStartMs / durationMs, (tapeStartMs + tapeSpanMs) / durationMs, count);
  }, [peaks, tapeWidth, tapeStartMs, tapeSpanMs, durationMs]);

  const overviewPlayed =
    overviewView.spanMs > 0 ? (positionMs - overviewView.startMs) / overviewView.spanMs : 0;
  const zoomPlayed = tapeSpanMs > 0 ? (positionMs - tapeStartMs) / tapeSpanMs : 0;
  const playheadOverviewPct = overviewPlayed * 100;
  const windowLeftPct =
    overviewView.spanMs > 0
      ? ((window.startMs - overviewView.startMs) / overviewView.spanMs) * 100
      : 0;
  const windowWidthPct =
    overviewView.spanMs > 0 ? (window.spanMs / overviewView.spanMs) * 100 : 100;
  const rangeLeftPct =
    overviewView.spanMs > 0
      ? ((range.startMs - overviewView.startMs) / overviewView.spanMs) * 100
      : 0;
  const rangeWidthPct =
    overviewView.spanMs > 0
      ? ((range.endMs - range.startMs) / overviewView.spanMs) * 100
      : 100;

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
          <Text style={styles.cardLabel}>
            {overviewSpan < durationMs - 1
              ? `Panoramica · ${formatWindowSeconds(overviewSpan)}`
              : 'Panoramica'}
          </Text>
          <View style={styles.cardMetaRow}>
            <Pressable onPress={toggleShowHidden} hitSlop={8} accessibilityRole="button">
              <Text style={[styles.cardMeta, showHidden && styles.hideOn]}>Hide</Text>
            </Pressable>
            <Text style={styles.cardMeta}>
              {customRange
                ? `${formatTimecode(range.startMs)} – ${formatTimecode(range.endMs)}`
                : formatTimecode(track.durationMs)}
            </Text>
          </View>
        </View>
        <GestureDetector gesture={overviewGestures}>
        <View style={styles.overviewWrap}>
          <View
            onLayout={onOverviewLayout}
            style={styles.overviewTrack}
            accessibilityRole="adjustable"
            accessibilityLabel="Forma d'onda panoramica"
            accessibilityHint="Trascina per scorrere. Tocca per andare a quel punto. Pizzica per ingrandire."
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
            <View pointerEvents="none" style={[styles.rangeDim, { width: `${rangeLeftPct}%` }]} />
            <View
              pointerEvents="none"
              style={[
                styles.rangeDim,
                { left: `${rangeLeftPct + rangeWidthPct}%`, right: 0 },
              ]}
            />
            <View
              pointerEvents="none"
              style={[
                styles.rangeFrame,
                { left: `${rangeLeftPct}%`, width: `${rangeWidthPct}%` },
              ]}
            />
            {visiblePins.map((marker) => {
              const left =
                overviewView.spanMs > 0
                  ? ((marker.timestampMs - overviewView.startMs) / overviewView.spanMs) * 100
                  : 0;
              if (left < -4 || left > 104) {
                return null;
              }
              return (
                <Pressable
                  key={marker.id}
                  onPress={() => openMarker(marker.id)}
                  hitSlop={8}
                  style={[
                    styles.overviewDot,
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
            <Playhead percent={playheadOverviewPct} tall={false} />
          </View>
          <RangeHandle
            side="start"
            timeMs={range.startMs}
            durationMs={durationMs}
            trackWidth={overviewWidth}
            windowStartMs={overviewView.startMs}
            windowSpanMs={overviewView.spanMs}
            seekWhileDrag
          />
          <RangeHandle
            side="end"
            timeMs={range.endMs}
            durationMs={durationMs}
            trackWidth={overviewWidth}
            windowStartMs={overviewView.startMs}
            windowSpanMs={overviewView.spanMs}
            seekWhileDrag
          />
        </View>
        </GestureDetector>
        {cuePoints.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.cueRow}
            accessibilityLabel="Punti del brano"
          >
            {cuePoints.map((marker) => {
              const preview = markerPreview(marker.text);
              const active = Math.abs(positionMs - marker.timestampMs) < 280;
              const pinColor = markerColor(marker);
              return (
                <Pressable
                  key={marker.id}
                  onPress={() => playFrom(marker.timestampMs)}
                  accessibilityRole="button"
                  accessibilityLabel={`Parti da ${formatTimecode(marker.timestampMs)}${preview ? `. ${preview}` : ''}`}
                  accessibilityHint="Parte da questo punto"
                  style={({ pressed }) => [
                    styles.cueChip,
                    { borderColor: pinColor },
                    active && styles.cueChipActive,
                    pressed && styles.cueChipPressed,
                  ]}
                >
                  <View style={[styles.cueDot, { backgroundColor: pinColor }]} />
                  <View style={styles.cueCopy}>
                    <Text style={styles.cueTime}>{formatTimecode(marker.timestampMs)}</Text>
                    {preview ? (
                      <Text style={styles.cuePreview} numberOfLines={1}>
                        {preview}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}
      </View>

      <View style={[styles.card, styles.zoomCard]}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardLabel}>Dettaglio · {formatWindowSeconds(detailSpan)}</Text>
          <Text style={styles.cardMeta}>
            {formatTimecode(window.startMs)} – {formatTimecode(window.endMs)}
          </Text>
        </View>
        <GestureDetector gesture={detailGestures}>
        <View style={styles.zoomBody}>
          <View onLayout={onZoomLayout} style={styles.zoomTrack}>
            <View
              style={StyleSheet.absoluteFill}
              accessibilityRole="adjustable"
              accessibilityLabel="Forma d'onda ingrandita"
              accessibilityHint="Trascina per scorrere. Tocca per andare a quel punto. Pizzica per ingrandire."
            >
              <Animated.View
                pointerEvents="box-none"
                style={[
                  styles.zoomTape,
                  {
                    width: Math.max(tapeWidth, zoomWidth),
                    transform: [{ translateX }],
                  },
                ]}
              >
                <PeakBars
                  values={zoomBars}
                  height={ZOOM_HEIGHT}
                  playedRatio={zoomPlayed}
                  barWidth={2.5}
                  rowWidth={Math.max(tapeWidth, zoomWidth)}
                />
                {visiblePins.map((marker) => (
                  <ZoomMarkerPin
                    key={marker.id}
                    marker={marker}
                    tapeStartMs={tapeStartMs}
                    tapeSpanMs={tapeSpanMs}
                    tapeWidth={Math.max(tapeWidth, zoomWidth)}
                    px={scale}
                    durationMs={durationMs}
                  />
                ))}
                <RangeHandle
                  side="start"
                  timeMs={range.startMs}
                  durationMs={durationMs}
                  trackWidth={Math.max(tapeWidth, 1)}
                  windowStartMs={tapeStartMs}
                  windowSpanMs={tapeSpanMs}
                  seekWhileDrag={false}
                  leftPx={(range.startMs - tapeStartMs) * scale}
                />
                <RangeHandle
                  side="end"
                  timeMs={range.endMs}
                  durationMs={durationMs}
                  trackWidth={Math.max(tapeWidth, 1)}
                  windowStartMs={tapeStartMs}
                  windowSpanMs={tapeSpanMs}
                  seekWhileDrag={false}
                  leftPx={(range.endMs - tapeStartMs) * scale}
                />
              </Animated.View>
            </View>
            <Animated.View
              pointerEvents="none"
              style={[styles.playhead, styles.playheadTall, { transform: [{ translateX: playheadX }] }]}
            >
              <View style={styles.playheadNub} />
              <View style={styles.playheadLine} />
            </Animated.View>
          </View>
        </View>
        </GestureDetector>
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
  overviewWrap: {
    height: OVERVIEW_HEIGHT + 8,
    justifyContent: 'center',
  },
  cueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 10,
    paddingHorizontal: 2,
  },
  cueChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: 168,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cueChipActive: {
    backgroundColor: colors.surface,
  },
  cueChipPressed: {
    opacity: 0.75,
  },
  cueDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  cueCopy: {
    flexShrink: 1,
    minWidth: 0,
  },
  cueTime: {
    color: colors.text,
    fontSize: 11,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
  cuePreview: {
    marginTop: 1,
    color: colors.textMuted,
    fontSize: 11,
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
  zoomTape: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
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
  rangeDim: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(13,13,15,0.5)',
  },
  rangeFrame: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderWidth: 2,
    borderColor: colors.accent,
    borderRadius: 6,
  },
  handleHit: {
    position: 'absolute',
    top: -2,
    bottom: -2,
    width: HANDLE_HIT,
    marginLeft: -(HANDLE_HIT / 2),
    alignItems: 'center',
    zIndex: 10,
  },
  handleBody: {
    flex: 1,
    width: 10,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.45,
    shadowRadius: 3,
    elevation: 5,
  },
  handleStart: {
    borderTopLeftRadius: 6,
    borderBottomLeftRadius: 6,
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
  },
  handleEnd: {
    borderTopRightRadius: 6,
    borderBottomRightRadius: 6,
    borderTopLeftRadius: 2,
    borderBottomLeftRadius: 2,
  },
  handleGrip: {
    width: 2,
    height: 16,
    borderRadius: 1,
    backgroundColor: colors.text,
    opacity: 0.9,
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
    marginLeft: 0,
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
    overflow: 'visible',
  },
  pinBubble: {
    position: 'absolute',
    top: 0,
    width: 132,
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 5,
    zIndex: 7,
  },
  pinBubbleRight: {
    left: PIN_HIT / 2 + 6,
  },
  pinBubbleLeft: {
    right: PIN_HIT / 2 + 6,
  },
  pinBubbleWho: {
    fontSize: 10,
    fontWeight: '700',
  },
  pinBubbleText: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 14,
    color: colors.text,
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
