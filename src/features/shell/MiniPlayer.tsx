import { useRef } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from 'react-native';
import { useNavigation, useNavigationState } from '@react-navigation/native';
import type { NavigationState } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BlurView } from 'expo-blur';

import { resolveLibraryUri } from '../../files/libraryUris';
import type { RootStackParamList } from '../../navigation/types';
import { usePlayerStore } from '../../store/playerStore';
import { colors } from '../../theme/colors';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const COVER = 42;
const BTN = 36;
const ROW = 58;

function routeTreeHasPlayer(state: NavigationState | undefined): boolean {
  if (!state) {
    return false;
  }
  const route = state.routes[state.index];
  if (!route) {
    return false;
  }
  if (route.name === 'Player') {
    return true;
  }
  return routeTreeHasPlayer(route.state as NavigationState | undefined);
}

function ancestorHasPlayer(navigation: { getState: () => NavigationState | undefined; getParent: () => unknown }): boolean {
  let current: { getState: () => NavigationState | undefined; getParent: () => unknown } | undefined = navigation;
  while (current) {
    if (routeTreeHasPlayer(current.getState())) {
      return true;
    }
    current = current.getParent() as typeof current | undefined;
  }
  return false;
}

function PlayGlyph({ paused }: { paused: boolean }) {
  if (paused) {
    return (
      <View style={styles.pauseGlyph} accessibilityElementsHidden>
        <View style={styles.pauseBar} />
        <View style={styles.pauseBar} />
      </View>
    );
  }
  return <View style={styles.playGlyph} accessibilityElementsHidden />;
}

/**
 * Compact now-playing bar for the app shell (above the tab bar).
 * Reads `usePlayerStore`. Hidden when there is no track or when the full Player is showing.
 * Do not mount this on `PlayerScreen` — the locked player must stay unchanged.
 */
export function MiniPlayer() {
  const navigation = useNavigation<Nav>();
  const onFullPlayer = useNavigationState((state) => {
    if (routeTreeHasPlayer(state)) {
      return true;
    }
    return ancestorHasPlayer(navigation);
  });

  const track = usePlayerStore((s) => s.track);
  const positionMs = usePlayerStore((s) => s.positionMs);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const play = usePlayerStore((s) => s.play);
  const pause = usePlayerStore((s) => s.pause);
  const skipBy = usePlayerStore((s) => s.skipBy);
  const seekTo = usePlayerStore((s) => s.seekTo);

  const barWidthRef = useRef(1);

  if (onFullPlayer || !track.id) {
    return null;
  }

  const artworkUri = resolveLibraryUri(track.artworkUri);
  const letter = (track.title.trim()[0] || '?').toUpperCase();
  const duration = Math.max(track.durationMs, 1);
  const progress = Math.max(0, Math.min(1, positionMs / duration));

  const openPlayer = () => {
    navigation.navigate('Player');
  };

  const onProgressLayout = (event: LayoutChangeEvent) => {
    barWidthRef.current = Math.max(event.nativeEvent.layout.width, 1);
  };

  const onSeek = (event: GestureResponderEvent) => {
    const ratio = Math.max(0, Math.min(1, event.nativeEvent.locationX / barWidthRef.current));
    seekTo(ratio * duration);
  };

  return (
    <View style={styles.wrap} accessibilityRole="none">
      <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
      <View pointerEvents="none" style={styles.tint} />

      <View style={styles.row}>
        <Pressable
          onPress={openPlayer}
          style={({ pressed }) => [styles.open, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Apri il lettore"
        >
          {artworkUri ? (
            <Image source={{ uri: artworkUri }} style={styles.cover} resizeMode="cover" />
          ) : (
            <View style={styles.coverFallback}>
              <Text style={styles.letter}>{letter}</Text>
            </View>
          )}
          <View style={styles.meta}>
            <Text style={styles.title} numberOfLines={1}>
              {track.title}
            </Text>
            <Text style={styles.artist} numberOfLines={1}>
              {track.artist}
            </Text>
          </View>
        </Pressable>

        <Pressable
          onPress={() => (isPlaying ? pause() : play())}
          style={({ pressed }) => [styles.playBtn, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? 'Pausa' : 'Riproduci'}
          hitSlop={8}
        >
          <PlayGlyph paused={isPlaying} />
        </Pressable>

        <Pressable
          onPress={() => skipBy(1, { autoPlay: true })}
          style={({ pressed }) => [styles.nextBtn, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Brano successivo"
          hitSlop={8}
        >
          <Text style={styles.nextGlyph} accessibilityElementsHidden>
            ››
          </Text>
        </Pressable>
      </View>

      <Pressable
        onPress={onSeek}
        onLayout={onProgressLayout}
        style={styles.progressHit}
        accessibilityElementsHidden
      >
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: 'rgba(26, 26, 30, 0.82)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255, 255, 255, 0.10)',
    overflow: 'hidden',
  },
  tint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(26, 26, 30, 0.45)',
  },
  row: {
    height: ROW,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    gap: 8,
  },
  open: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cover: {
    width: COVER,
    height: COVER,
    borderRadius: 6,
    backgroundColor: colors.surfaceRaised,
  },
  coverFallback: {
    width: COVER,
    height: COVER,
    borderRadius: 6,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  letter: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  meta: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  artist: {
    marginTop: 1,
    color: colors.textMuted,
    fontSize: 12,
  },
  playBtn: {
    width: BTN,
    height: BTN,
    borderRadius: BTN / 2,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextBtn: {
    width: BTN,
    height: BTN,
    borderRadius: BTN / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextGlyph: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
    marginTop: -2,
  },
  playGlyph: {
    width: 0,
    height: 0,
    marginLeft: 2,
    borderTopWidth: 6,
    borderBottomWidth: 6,
    borderLeftWidth: 10,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: colors.text,
  },
  pauseGlyph: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  pauseBar: {
    width: 3,
    height: 12,
    borderRadius: 1,
    backgroundColor: colors.text,
  },
  pressed: {
    opacity: 0.72,
  },
  progressHit: {
    height: 10,
    justifyContent: 'flex-end',
  },
  progressTrack: {
    height: 3,
    backgroundColor: 'rgba(142, 142, 147, 0.35)',
  },
  progressFill: {
    height: 3,
    backgroundColor: colors.accent,
  },
});
