import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { isMarkerHidden, isPlaceholderMarker } from '../../domain/markers';
import type { Marker } from '../../domain/models';
import { usePlayerStore } from '../../store/playerStore';
import { colors } from '../../theme/colors';
import { DetailLyricsPanel } from './DetailLyricsPanel';
import { Waveform } from './Waveform';

/**
 * Deck in pagina, sotto l’intestazione già approvata.
 * Faccia 0 cassetta, 1 onda, 2 testo. Lo swipe è solo sulla finestra nera.
 */

const FACE_H = 248;
const VB_W = 340;
const VB_H = 236;
const R_MIN = 17;
const R_MAX = 39;
const MAX_NOTES = 4;
const NOTE_TILT = ['-0.4deg', '0.3deg', '-0.15deg', '0.35deg'] as const;
const INK = '#1a3d86';
const PAPER = '#f4ecd9';
const GLYPH = '#f4f4f5';

const mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });
const hand = Platform.select({ ios: 'Bradley Hand', android: 'serif', default: 'serif' });

const DECK_COLORS = ['#c4c7cb', '#9a9ea2', '#7a7e82', '#8e9296'] as const;
const DECK_STOPS = [0, 0.12, 0.48, 1] as const;
const KEY_STOPS = [0, 0.42, 1] as const;
const KEY_FACE = ['#4a4d52', '#2a2c30', '#16171a'] as const;
const KEY_DOWN = ['#2c2e32', '#1a1b1e', '#101113'] as const;
const ORANGE_FACE = ['#ff9768', '#ff6b35', '#d44816'] as const;
const ORANGE_DOWN = ['#e86a38', '#d45520', '#a33512'] as const;
const PLAY_ON = ['#9dff6a', '#3ea332', '#1c6b22'] as const;
const PLAY_HELD = ['#5cb84a', '#257326', '#124816'] as const;
const PLASTIC = ['rgba(251,248,242,0.55)', 'rgba(207,200,188,0.18)', 'rgba(110,106,100,0.28)'] as const;
const METAL = ['#f5f5f5', '#9a9a9a', '#5c5c5c'] as const;

type MetalColors = readonly [string, string, string];
type Frame = { scale: number; ox: number; oy: number };
type LedMode = 'off' | 'play' | 'loop';
type KeyTone = 'metal' | 'orange' | 'play';
type Rotate = Animated.AnimatedInterpolation<string>;

type LabelLine = { marker: Marker; active: boolean };

let storedAngleL = 18;
let storedAngleR = 64;
let storedCoast = 0;

function clockTenths(ms: number): string {
  const tenthsTotal = Math.floor(Math.max(0, ms) / 100);
  const tenths = tenthsTotal % 10;
  const totalSeconds = Math.floor(tenthsTotal / 10);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}:${String(seconds).padStart(2, '0')}.${tenths}`;
}

function noteStamp(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function reelRadii(positionMs: number, durationMs: number): { supply: number; takeup: number } {
  const progress = durationMs > 0 ? Math.min(1, Math.max(0, positionMs / durationMs)) : 0;
  const span = R_MAX - R_MIN;
  return {
    supply: R_MAX - progress * span,
    takeup: R_MIN + progress * span,
  };
}

/** At most four lines, active note (last one at or just ahead of the playhead) on the last row. */
function labelLines(markers: Marker[], positionMs: number): LabelLine[] {
  const notes = markers
    .filter(
      (marker) =>
        !isMarkerHidden(marker) && !isPlaceholderMarker(marker) && marker.text.trim().length > 0,
    )
    .sort((a, b) => a.timestampMs - b.timestampMs);
  if (notes.length === 0) {
    return [];
  }
  const limit = positionMs + 350;
  let activeIndex = -1;
  for (let i = 0; i < notes.length; i += 1) {
    if (notes[i].timestampMs <= limit) {
      activeIndex = i;
    } else {
      break;
    }
  }
  let start = 0;
  if (notes.length > MAX_NOTES) {
    start = Math.max(
      0,
      activeIndex < 0 ? notes.length - MAX_NOTES : activeIndex - (MAX_NOTES - 1),
    );
    if (start + MAX_NOTES > notes.length) {
      start = notes.length - MAX_NOTES;
    }
  }
  return notes.slice(start, start + MAX_NOTES).map((marker, index) => ({
    marker,
    active: start + index === activeIndex,
  }));
}

function makeFrame(width: number, height: number): Frame {
  const scale = width > 0 && height > 0 ? Math.min(width / VB_W, height / VB_H) : 1;
  return {
    scale,
    ox: (width - VB_W * scale) / 2,
    oy: (height - VB_H * scale) / 2,
  };
}

function place(frame: Frame, x: number, y: number, w: number, h: number): ViewStyle {
  return {
    position: 'absolute',
    left: frame.ox + x * frame.scale,
    top: frame.oy + y * frame.scale,
    width: w * frame.scale,
    height: h * frame.scale,
  };
}

function disk(frame: Frame, cx: number, cy: number, r: number): ViewStyle {
  const d = r * 2 * frame.scale;
  return {
    position: 'absolute',
    left: frame.ox + cx * frame.scale - d / 2,
    top: frame.oy + cy * frame.scale - d / 2,
    width: d,
    height: d,
    borderRadius: d / 2,
  };
}

function polarBar(
  deg: number,
  orbit: number,
  length: number,
  thickness: number,
  center: number,
  color: string,
): ViewStyle {
  const rad = (deg * Math.PI) / 180;
  const x = center + Math.sin(rad) * orbit;
  const y = center - Math.cos(rad) * orbit;
  return {
    position: 'absolute',
    width: thickness,
    height: length,
    left: x - thickness / 2,
    top: y - length / 2,
    borderRadius: Math.min(thickness, length) / 2,
    backgroundColor: color,
    transform: [{ rotate: `${deg}deg` }],
  };
}

function useReelSpin(isPlaying: boolean, supply: number, takeup: number) {
  const spinL = useRef(new Animated.Value(storedAngleL / 360)).current;
  const spinR = useRef(new Animated.Value(storedAngleR / 360)).current;
  const angleL = useRef(storedAngleL);
  const angleR = useRef(storedAngleR);
  const coast = useRef(isPlaying ? 1 : storedCoast);
  const playingRef = useRef(isPlaying);
  const radiiRef = useRef({ supply, takeup });
  playingRef.current = isPlaying;
  radiiRef.current = { supply, takeup };

  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const target = playingRef.current ? 1 : 0;
      const k = target ? 5.5 : 2.2;
      coast.current += (target - coast.current) * (1 - Math.exp(-dt * k));
      if (!playingRef.current && coast.current < 0.004) {
        coast.current = 0;
      }
      const flutter =
        1 +
        (coast.current > 0.02 ? 0.012 * Math.sin(now / 80) + 0.007 * Math.sin(now / 33) : 0);
      const motion = coast.current * flutter * dt * (180 / Math.PI) * 86;
      const radii = radiiRef.current;
      angleL.current += motion / Math.max(radii.supply, 1);
      angleR.current += motion / Math.max(radii.takeup, 1);
      // Fraction of a turn, extended past 1 so the hub never snaps backwards.
      spinL.setValue(angleL.current / 360);
      spinR.setValue(angleR.current / 360);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      storedAngleL = angleL.current;
      storedAngleR = angleR.current;
      storedCoast = coast.current;
    };
  }, [spinL, spinR]);

  const rotateL = useMemo(
    () =>
      spinL.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '360deg'],
        extrapolate: 'extend',
      }),
    [spinL],
  );
  const rotateR = useMemo(
    () =>
      spinR.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '360deg'],
        extrapolate: 'extend',
      }),
    [spinR],
  );
  return { rotateL, rotateR };
}

function Led({ mode }: { mode: LedMode }) {
  return (
    <View
      pointerEvents="none"
      style={[styles.led, mode === 'play' && styles.ledPlay, mode === 'loop' && styles.ledLoop]}
    >
      {mode === 'off' ? <View style={styles.ledGlint} /> : null}
    </View>
  );
}

function DeckKey({
  label,
  onPress,
  glyph,
  caption,
  latched = false,
  tone = 'metal',
  led = 'off',
}: {
  label: string;
  onPress: () => void;
  glyph: ReactNode;
  caption?: string;
  latched?: boolean;
  tone?: KeyTone;
  led?: LedMode;
}) {
  const [held, setHeld] = useState(false);
  const sunk = held || latched;
  let palette: MetalColors = KEY_FACE;
  if (tone === 'orange') {
    palette = held ? ORANGE_DOWN : ORANGE_FACE;
  } else if (tone === 'play' && latched) {
    palette = held ? PLAY_HELD : PLAY_ON;
  } else if (sunk) {
    palette = KEY_DOWN;
  }

  return (
    <View style={styles.slot}>
      <Led mode={led} />
      <Pressable
        onPress={onPress}
        onPressIn={() => setHeld(true)}
        onPressOut={() => setHeld(false)}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={latched ? { selected: true } : undefined}
        android_ripple={{ color: 'rgba(0,0,0,0.28)' }}
        style={[styles.key, sunk && styles.keySunk]}
      >
        <LinearGradient colors={palette} locations={KEY_STOPS} style={StyleSheet.absoluteFill} />
        <View pointerEvents="none" style={sunk ? styles.keyInset : styles.keyHighlight} />
        {glyph}
      </Pressable>
      {caption != null ? (
        <Text style={styles.cap} allowFontScaling={false}>
          {caption}
        </Text>
      ) : (
        <View style={styles.capSpace} />
      )}
    </View>
  );
}

function PlayGlyph({ color = GLYPH }: { color?: string }) {
  return <View style={[styles.playTri, { borderLeftColor: color }]} />;
}

function PauseGlyph({ color = GLYPH }: { color?: string }) {
  return (
    <View style={styles.pauseRow}>
      <View style={[styles.pauseBar, { backgroundColor: color }]} />
      <View style={[styles.pauseBar, { backgroundColor: color }]} />
    </View>
  );
}

function StopGlyph() {
  return <View style={styles.stopSquare} />;
}

function Point({ dir }: { dir: 'left' | 'right' }) {
  const forward = dir === 'right';
  return <View style={[styles.point, forward ? styles.pointRight : styles.pointLeft]} />;
}

function SkipGlyph({ dir }: { dir: 'back' | 'forward' }) {
  const bar = <View style={styles.skipBar} />;
  if (dir === 'back') {
    return (
      <View style={styles.skipGlyph}>
        {bar}
        <Point dir="left" />
        <Point dir="left" />
      </View>
    );
  }
  return (
    <View style={styles.skipGlyph}>
      <Point dir="right" />
      <Point dir="right" />
      {bar}
    </View>
  );
}

function LoopGlyph({ one = false }: { one?: boolean }) {
  return (
    <View style={styles.loopRow}>
      <Text style={styles.loopArrow} allowFontScaling={false}>
        {'\u21bb'}
      </Text>
      {one ? (
        <Text style={styles.loopOne} allowFontScaling={false}>
          1
        </Text>
      ) : null}
    </View>
  );
}

function Hub({ scale, rotate }: { scale: number; rotate: Rotate }) {
  const size = 34 * scale;
  const center = size / 2;
  const spokes = [0, 60, 120, 180, 240, 300];
  return (
    <Animated.View
      pointerEvents="none"
      collapsable={false}
      style={{
        position: 'absolute',
        width: size,
        height: size,
        left: (88 * scale - size) / 2,
        top: (88 * scale - size) / 2,
        transform: [{ rotate }],
      }}
    >
      <View style={hubDisk(30.4 * scale, size, '#f4f1ea')} />
      <View style={hubDisk(27.2 * scale, size, '#ddd8ce')} />
      {spokes.map((deg) => (
        <View
          key={`spoke-${deg}`}
          style={polarBar(deg, 9.7 * scale, 7 * scale, 2.3 * scale, center, '#b7b2a8')}
        />
      ))}
      <View style={hubDisk(12.2 * scale, size, '#161616')} />
      {spokes.map((deg) => (
        <View
          key={`tooth-${deg}`}
          style={polarBar(deg, 5.9 * scale, 3.1 * scale, 2.3 * scale, center, '#f7f4ee')}
        />
      ))}
      <View style={hubDisk(6.6 * scale, size, '#0c0c0c')} />
    </Animated.View>
  );
}

function hubDisk(diameter: number, parent: number, color: string): ViewStyle {
  return {
    position: 'absolute',
    width: diameter,
    height: diameter,
    left: (parent - diameter) / 2,
    top: (parent - diameter) / 2,
    borderRadius: diameter / 2,
    backgroundColor: color,
  };
}

function Reel({
  frame,
  cx,
  cy,
  packR,
  rotate,
}: {
  frame: Frame;
  cx: number;
  cy: number;
  packR: number;
  rotate: Rotate;
}) {
  const win = 88 * frame.scale;
  const pack = packR * 2 * frame.scale;
  return (
    <View
      pointerEvents="none"
      style={[disk(frame, cx, cy, 44), styles.reelWell]}
    >
      <Animated.View
        collapsable={false}
        style={{
          position: 'absolute',
          width: pack,
          height: pack,
          left: (win - pack) / 2,
          top: (win - pack) / 2,
          borderRadius: pack / 2,
          overflow: 'hidden',
          backgroundColor: '#120c09',
          borderWidth: Math.max(1, 1.3 * frame.scale),
          borderColor: '#6a4630',
          transform: [{ rotate }],
        }}
      >
        <View
          style={{
            position: 'absolute',
            width: pack * 0.82,
            height: pack * 0.82,
            left: pack * 0.09,
            top: pack * 0.09,
            borderRadius: pack,
            backgroundColor: '#2a1a12',
          }}
        />
        <View
          style={{
            position: 'absolute',
            width: pack * 0.46,
            height: pack * 0.32,
            left: pack * 0.12,
            top: pack * 0.14,
            borderRadius: pack,
            backgroundColor: 'rgba(90,64,50,0.9)',
            transform: [{ rotate: '-24deg' }],
          }}
        />
        <View style={[styles.tapeLine, { top: pack * 0.28, transform: [{ rotate: '-16deg' }] }]} />
        <View style={[styles.tapeLine, { top: pack * 0.58, transform: [{ rotate: '11deg' }] }]} />
        <View style={[styles.tapeLine, { top: pack * 0.78, transform: [{ rotate: '-8deg' }] }]} />
      </Animated.View>
      <Hub scale={frame.scale} rotate={rotate} />
      <View pointerEvents="none" style={[styles.reelGlass, { borderRadius: win / 2 }]} />
    </View>
  );
}

function Screw({ frame, cx, cy }: { frame: Frame; cx: number; cy: number }) {
  return (
    <View pointerEvents="none" style={[disk(frame, cx, cy, 4.3), styles.screw]}>
      <LinearGradient
        colors={METAL}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.screwH} />
      <View style={styles.screwV} />
    </View>
  );
}

function CassetteLabel({
  frame,
  title,
  lines,
  onNote,
}: {
  frame: Frame;
  title: string;
  lines: LabelLine[];
  onNote: (ms: number) => void;
}) {
  return (
    <View style={[place(frame, VB_W * 0.13, VB_H * 0.05, VB_W * 0.74, VB_H * 0.4), styles.label]}>
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(255,255,255,0.55)', 'rgba(255,255,255,0)']}
        style={styles.labelShine}
      />
      <View style={styles.labelHead}>
        <Text style={styles.labelTitle} numberOfLines={1} allowFontScaling={false}>
          {title}
        </Text>
        <Text style={styles.labelSide} allowFontScaling={false}>
          lato A
        </Text>
      </View>
      <View style={styles.labelLines}>
        {lines.length === 0 ? (
          <Text style={styles.quiet} allowFontScaling={false}>
            Nessun appunto
          </Text>
        ) : (
          lines.map((line, index) => {
            const stamp = noteStamp(line.marker.timestampMs);
            const text = line.marker.text.replace(/\s+/g, ' ').trim();
            return (
              <Pressable
                key={line.marker.id}
                onPress={() => onNote(line.marker.timestampMs)}
                accessibilityRole="button"
                accessibilityLabel={`${stamp}, ${text}`}
                style={[styles.note, { transform: [{ rotate: NOTE_TILT[index] ?? '0deg' }] }]}
              >
                {line.active ? <View pointerEvents="none" style={styles.highlighter} /> : null}
                <Text style={styles.noteTime} allowFontScaling={false}>
                  {stamp}
                </Text>
                <Text style={styles.noteText} numberOfLines={1} allowFontScaling={false}>
                  {text}
                </Text>
              </Pressable>
            );
          })
        )}
      </View>
    </View>
  );
}

function GlassSheen({ playing }: { playing: boolean }) {
  const sheen = useRef(new Animated.Value(0.42)).current;
  useEffect(() => {
    if (!playing) {
      return;
    }
    sheen.setValue(0);
    const loop = Animated.loop(
      Animated.timing(sheen, {
        toValue: 1,
        duration: 4800,
        easing: Easing.linear,
        useNativeDriver: false,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [playing, sheen]);

  const translateX = sheen.interpolate({
    inputRange: [0, 1],
    outputRange: [150, -210],
  });

  return (
    <Animated.View pointerEvents="none" style={[styles.sheen, { transform: [{ translateX }] }]}>
      <LinearGradient
        colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.2)', 'rgba(255,255,255,0)']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.sheenBand}
      />
    </Animated.View>
  );
}

function CassetteFace({
  width,
  height,
  title,
  lines,
  supplyR,
  takeupR,
  rotateL,
  rotateR,
  playing,
  onNote,
}: {
  width: number;
  height: number;
  title: string;
  lines: LabelLine[];
  supplyR: number;
  takeupR: number;
  rotateL: Rotate;
  rotateR: Rotate;
  playing: boolean;
  onNote: (ms: number) => void;
}) {
  const frame = makeFrame(width, height);
  const radius = (n: number) => n * frame.scale;
  return (
    <View style={styles.cassette}>
      <View style={[place(frame, 5, 5, 330, 226), { borderRadius: radius(12), backgroundColor: '#141516' }]} />
      <View
        style={[
          place(frame, 7, 7, 326, 222),
          { borderRadius: radius(11), overflow: 'hidden' },
        ]}
      >
        <LinearGradient colors={PLASTIC} style={StyleSheet.absoluteFill} />
      </View>
      <View
        style={[
          place(frame, 16, 14, 308, 196),
          { borderRadius: radius(5), backgroundColor: '#e8e0d0' },
        ]}
      />
      <Reel frame={frame} cx={98} cy={158} packR={supplyR} rotate={rotateL} />
      <Reel frame={frame} cx={242} cy={158} packR={takeupR} rotate={rotateR} />
      <View pointerEvents="none" style={[disk(frame, 156, 158, 4.2), styles.roller]}>
        <View style={[styles.rollerHole, { width: radius(3), height: radius(3), borderRadius: radius(1.5) }]} />
      </View>
      <View pointerEvents="none" style={[disk(frame, 184, 158, 4.2), styles.roller]}>
        <View style={[styles.rollerHole, { width: radius(3), height: radius(3), borderRadius: radius(1.5) }]} />
      </View>
      <View pointerEvents="none" style={[place(frame, 148, 206, 44, 16), styles.padSlot]}>
        <View style={[placeLocal(frame, 7, 6, 30, 4.5), { backgroundColor: '#1a120e' }]} />
        <View style={[placeLocal(frame, 14, -2, 16, 7), styles.padTongue]}>
          <LinearGradient
            colors={METAL}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </View>
        <View style={[placeLocal(frame, 17, 10, 10, 5), { backgroundColor: '#7a4038' }]} />
      </View>
      {[
        [26, 24],
        [314, 24],
        [26, 198],
        [314, 198],
      ].map(([cx, cy]) => (
        <Screw key={`${cx}-${cy}`} frame={frame} cx={cx} cy={cy} />
      ))}
      <View pointerEvents="none" style={[disk(frame, 28, 72, 4.5), styles.hole]} />
      <View pointerEvents="none" style={[disk(frame, 312, 72, 4.5), styles.hole]} />
      <CassetteLabel frame={frame} title={title} lines={lines} onNote={onNote} />
      <GlassSheen playing={playing} />
    </View>
  );
}

/** Offsets inside the pressure-pad slot, which is already placed in viewBox space. */
function placeLocal(frame: Frame, x: number, y: number, w: number, h: number): ViewStyle {
  return {
    position: 'absolute',
    left: x * frame.scale,
    top: y * frame.scale,
    width: w * frame.scale,
    height: h * frame.scale,
  };
}

const FACE_NAME = ['Mostra la cassetta', 'Mostra l’onda', 'Mostra il testo'] as const;

function useFaceSwipe(face: number, onFace: (index: number) => void) {
  const faceRef = useRef(face);
  const onFaceRef = useRef(onFace);
  onFaceRef.current = onFace;
  useEffect(() => {
    faceRef.current = face;
  }, [face]);
  return useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .activeOffsetX([-24, 24])
        .failOffsetY([-28, 28])
        .onEnd((event) => {
          if (Math.abs(event.translationX) < 36) {
            return;
          }
          const step = event.translationX < 0 ? 1 : -1;
          const next = (faceRef.current + step + 3) % 3;
          faceRef.current = next;
          onFaceRef.current(next);
        }),
    [],
  );
}

function BlackWindow({ face, onFace }: { face: number; onFace: (index: number) => void }) {
  const track = usePlayerStore((s) => s.track);
  const positionMs = usePlayerStore((s) => s.positionMs);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const markers = usePlayerStore((s) => s.markers);
  const playFrom = usePlayerStore((s) => s.playFrom);
  const [box, setBox] = useState(() => ({
    w: Math.max(260, Dimensions.get('window').width - 36),
    h: FACE_H,
  }));
  const radii = reelRadii(positionMs, track.durationMs);
  const { rotateL, rotateR } = useReelSpin(isPlaying, radii.supply, radii.takeup);
  const lines = useMemo(() => labelLines(markers, positionMs), [markers, positionMs]);
  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setBox((prev) =>
      Math.abs(prev.w - width) < 0.5 && Math.abs(prev.h - height) < 0.5 ? prev : { w: width, h: height },
    );
  };

  const swipe = useFaceSwipe(face, onFace);
  const body = (
    <View style={styles.face} onLayout={onLayout}>
      {face === 0 ? (
            <CassetteFace
              width={box.w}
              height={box.h}
              title={track.title}
              lines={lines}
              supplyR={radii.supply}
              takeupR={radii.takeup}
              rotateL={rotateL}
              rotateR={rotateR}
              playing={isPlaying}
              onNote={playFrom}
            />
          ) : null}
          {face === 1 ? (
            <View style={styles.altFace}>
              <Waveform compact />
            </View>
          ) : null}
          {face === 2 ? (
            <View style={styles.altFace}>
              <DetailLyricsPanel trackId={track.id} />
            </View>
          ) : null}
    </View>
  );

  // The wave scrolls sideways. A pan on that face must not also turn the page.
  return (
    <View style={styles.well}>
      {face === 1 ? body : <GestureDetector gesture={swipe}>{body}</GestureDetector>}
    </View>
  );
}

function Meter({ face, onFace }: { face: number; onFace: (index: number) => void }) {
  const positionMs = usePlayerStore((s) => s.positionMs);
  const swipe = useFaceSwipe(face, onFace);
  return (
    <GestureDetector gesture={swipe}>
    <View style={styles.meter}>
      <View style={styles.fluoro}>
        <Text style={styles.fluoroText} allowFontScaling={false}>
          {clockTenths(positionMs)}
        </Text>
      </View>
      <View style={styles.dots}>
        {FACE_NAME.map((label, index) => (
          <Pressable
            key={label}
            onPress={() => onFace(index)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ selected: face === index }}
            style={[styles.dot, face === index && styles.dotOn]}
          />
        ))}
      </View>
    </View>
    </GestureDetector>
  );
}

function KeyTray() {
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const repeatSong = usePlayerStore((s) => s.repeatSong);
  const repeatAlbum = usePlayerStore((s) => s.repeatAlbum);
  const seekBy = usePlayerStore((s) => s.seekBy);
  const play = usePlayerStore((s) => s.play);
  const pause = usePlayerStore((s) => s.pause);
  const stop = usePlayerStore((s) => s.stop);
  const pressAddNote = usePlayerStore((s) => s.pressAddNote);
  const toggleRepeatSong = usePlayerStore((s) => s.toggleRepeatSong);
  const toggleRepeatAlbum = usePlayerStore((s) => s.toggleRepeatAlbum);
  const skipBy = usePlayerStore((s) => s.skipBy);

  const addNote = () => {
    try {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {
      // Haptics may be unavailable on this surface.
    }
    pressAddNote();
  };

  return (
    <View style={styles.tray}>
      <View style={styles.row}>
        <DeckKey
          label="Indietro di 10 secondi"
          onPress={() => seekBy(-10000)}
          glyph={
            <Text style={styles.skipNum} allowFontScaling={false}>
              {'\u221210'}
            </Text>
          }
        />
        <DeckKey
          label="Ripeti questo brano"
          onPress={() => toggleRepeatSong()}
          latched={repeatSong}
          led={repeatSong ? 'loop' : 'off'}
          glyph={<LoopGlyph one />}
        />
        <DeckKey
          label="Aggiungi nota"
          onPress={addNote}
          tone="orange"
          glyph={
            <Text style={styles.plus} allowFontScaling={false}>
              +
            </Text>
          }
        />
        <DeckKey
          label="Ripeti l’album"
          onPress={() => toggleRepeatAlbum()}
          latched={repeatAlbum}
          led={repeatAlbum ? 'loop' : 'off'}
          glyph={<LoopGlyph />}
        />
        <DeckKey
          label="Avanti di 10 secondi"
          onPress={() => seekBy(10000)}
          glyph={
            <Text style={styles.skipNum} allowFontScaling={false}>
              +10
            </Text>
          }
        />
      </View>
      <View style={[styles.row, styles.rowNext]}>
        <DeckKey
          label="Brano prima"
          caption="prima"
          onPress={() => skipBy(-1, { wrap: repeatAlbum })}
          glyph={<SkipGlyph dir="back" />}
        />
        <DeckKey label="Stop" caption="stop" onPress={() => stop()} glyph={<StopGlyph />} />
        <DeckKey
          label={isPlaying ? 'Pausa' : 'Play'}
          caption="play"
          latched={isPlaying}
          led={isPlaying ? 'play' : 'off'}
          onPress={() => (isPlaying ? pause() : play())}
          glyph={isPlaying ? <PauseGlyph /> : <PlayGlyph />}
        />
        <DeckKey
          label="Brano dopo"
          caption="dopo"
          onPress={() => skipBy(1, { wrap: repeatAlbum })}
          glyph={<SkipGlyph dir="forward" />}
        />
      </View>
    </View>
  );
}

export function CassetteDeck() {
  const [face, setFace] = useState(0);
  return (
    <View style={styles.deck}>
      <LinearGradient
        pointerEvents="none"
        colors={DECK_COLORS}
        locations={DECK_STOPS}
        style={StyleSheet.absoluteFill}
      />
      <View pointerEvents="none" style={styles.deckLip} />
      <BlackWindow face={face} onFace={setFace} />
      <Meter face={face} onFace={setFace} />
      <KeyTray />
    </View>
  );
}

const styles = StyleSheet.create({
  deck: {
    backgroundColor: '#8b8e92',
    paddingTop: 10,
    paddingHorizontal: 10,
    paddingBottom: 22,
  },
  deckLip: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  well: {
    backgroundColor: '#050506',
    borderRadius: 8,
    padding: 7,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    overflow: 'hidden',
  },
  face: {
    height: FACE_H,
    borderRadius: 6,
    overflow: 'hidden',
  },
  altFace: {
    flex: 1,
    backgroundColor: '#101114',
    overflow: 'hidden',
    borderRadius: 6,
  },
  cassette: {
    flex: 1,
  },
  reelWell: {
    backgroundColor: '#0c0c0e',
    overflow: 'hidden',
  },
  reelGlass: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  tapeLine: {
    position: 'absolute',
    left: '-10%',
    width: '120%',
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  roller: {
    backgroundColor: '#f4f1ea',
    borderWidth: 1,
    borderColor: '#b9b3a6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rollerHole: {
    backgroundColor: '#8d887c',
  },
  padSlot: {
    backgroundColor: '#121212',
    borderRadius: 1.5,
    overflow: 'visible',
  },
  padTongue: {
    borderRadius: 0.5,
    overflow: 'hidden',
  },
  screw: {
    overflow: 'hidden',
    borderWidth: 0.6,
    borderColor: '#3a3a3a',
  },
  screwH: {
    position: 'absolute',
    left: '18%',
    right: '18%',
    top: '50%',
    height: 1,
    marginTop: -0.5,
    backgroundColor: '#3a3a3a',
  },
  screwV: {
    position: 'absolute',
    top: '18%',
    bottom: '18%',
    left: '50%',
    width: 1,
    marginLeft: -0.5,
    backgroundColor: '#3a3a3a',
  },
  hole: {
    backgroundColor: '#141516',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  label: {
    backgroundColor: PAPER,
    borderRadius: 2,
    overflow: 'hidden',
    paddingTop: 6,
    paddingHorizontal: 8,
    paddingBottom: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(90,60,20,0.16)',
    zIndex: 4,
  },
  labelShine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '46%',
  },
  labelHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
  },
  labelTitle: {
    flex: 1,
    color: INK,
    fontFamily: hand,
    fontSize: 16,
    lineHeight: 18,
    letterSpacing: -0.2,
  },
  labelSide: {
    color: INK,
    opacity: 0.8,
    fontFamily: hand,
    fontSize: 12,
    lineHeight: 14,
  },
  labelLines: {
    marginTop: 2,
  },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 2,
    minHeight: 16,
  },
  highlighter: {
    position: 'absolute',
    left: 2,
    right: 2,
    top: 3,
    bottom: 2,
    backgroundColor: 'rgba(255, 214, 60, 0.7)',
    borderRadius: 1,
  },
  noteTime: {
    width: 38,
    color: INK,
    opacity: 0.9,
    fontFamily: hand,
    fontSize: 14,
    lineHeight: 16,
  },
  noteText: {
    flex: 1,
    color: INK,
    fontFamily: hand,
    fontSize: 14,
    lineHeight: 16,
  },
  quiet: {
    marginTop: 4,
    color: INK,
    opacity: 0.45,
    fontFamily: hand,
    fontSize: 14,
    lineHeight: 17,
  },
  sheen: {
    position: 'absolute',
    top: -24,
    bottom: -24,
    width: 48,
    zIndex: 5,
  },
  sheenBand: {
    flex: 1,
    transform: [{ rotate: '18deg' }],
  },
  meter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    paddingHorizontal: 8,
  },
  fluoro: {
    minWidth: 92,
    backgroundColor: '#070a07',
    borderRadius: 3,
    paddingTop: 3,
    paddingBottom: 2,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.8)',
  },
  fluoroText: {
    color: '#b6ff8a',
    fontFamily: mono,
    fontVariant: ['tabular-nums'],
    fontSize: 15,
    letterSpacing: 1.2,
    textShadowColor: 'rgba(160, 255, 120, 0.85)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 99,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.35)',
  },
  dotOn: {
    width: 16,
    backgroundColor: colors.accent,
    borderTopWidth: 0,
  },
  tray: {
    marginTop: 8,
    marginHorizontal: 4,
    backgroundColor: '#101113',
    borderRadius: 6,
    padding: 7,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.28)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  rowNext: {
    marginTop: 7,
  },
  slot: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    gap: 3,
  },
  led: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.8)',
    alignItems: 'center',
  },
  ledGlint: {
    marginTop: 0.5,
    width: 2.5,
    height: 1.5,
    borderRadius: 1,
    backgroundColor: '#3a3d3a',
  },
  ledPlay: {
    backgroundColor: '#9dff6a',
    borderColor: 'transparent',
    shadowColor: '#9dff6a',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.95,
    shadowRadius: 6,
    elevation: 4,
  },
  ledLoop: {
    backgroundColor: colors.accent,
    borderColor: 'transparent',
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
    elevation: 4,
  },
  key: {
    width: '100%',
    height: 38,
    borderRadius: 3,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  keySunk: {
    transform: [{ translateY: 1 }],
  },
  keyHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.38)',
  },
  keyInset: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  skipNum: {
    color: GLYPH,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.4,
    includeFontPadding: false,
  },
  plus: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '500',
    lineHeight: 26,
    marginTop: -2,
    includeFontPadding: false,
  },
  playTri: {
    width: 0,
    height: 0,
    marginLeft: 2,
    borderTopWidth: 5.5,
    borderBottomWidth: 5.5,
    borderLeftWidth: 9,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: GLYPH,
  },
  pauseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  pauseBar: {
    width: 3,
    height: 10,
    borderRadius: 0.6,
    backgroundColor: GLYPH,
  },
  stopSquare: {
    width: 12,
    height: 12,
    borderRadius: 1,
    backgroundColor: GLYPH,
  },
  skipGlyph: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
  },
  skipBar: {
    width: 2,
    height: 10,
    backgroundColor: GLYPH,
  },
  point: {
    width: 0,
    height: 0,
    borderTopWidth: 5,
    borderBottomWidth: 5,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
  },
  pointLeft: {
    borderRightWidth: 6,
    borderRightColor: GLYPH,
  },
  pointRight: {
    borderLeftWidth: 6,
    borderLeftColor: GLYPH,
  },
  loopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  loopArrow: {
    color: GLYPH,
    fontSize: 18,
    lineHeight: 20,
    includeFontPadding: false,
  },
  loopOne: {
    color: GLYPH,
    fontSize: 9,
    fontWeight: '700',
    marginLeft: -1,
    marginTop: 6,
    includeFontPadding: false,
  },
  cap: {
    fontSize: 9,
    lineHeight: 11,
    letterSpacing: 0.2,
    color: 'rgba(0,0,0,0.55)',
    textShadowColor: 'rgba(255,255,255,0.28)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 0,
    includeFontPadding: false,
  },
  capSpace: {
    height: 11,
  },
});
