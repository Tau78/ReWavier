import { useIsFocused, useNavigation } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef } from 'react';
import { Alert, Platform, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { formatTimecode } from '../../domain/models';
import { markersNearTime } from '../../domain/practice';
import { NoteBubble } from '../notes/NoteBubble';
import { isPausePromptSuppressed, usePlayerStore } from '../../store/playerStore';
import { colors, layout } from '../../theme/colors';
import { AddNoteButton } from './AddNoteButton';
import { PlaybackControls } from './PlaybackControls';
import { PracticeBar } from './PracticeBar';
import { Waveform } from './Waveform';

/** Swipe down past this → collapse to the library linguetta. */
const DISMISS_DY = 72;

function usePauseNotePrompt() {
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const bubbleVisible = usePlayerStore((s) => s.bubble.visible);
  const trackId = usePlayerStore((s) => s.track.id);
  const loadState = usePlayerStore((s) => s.loadState);
  const focused = useIsFocused();
  const askedThisPause = useRef(false);
  const heardPlay = useRef(false);

  useEffect(() => {
    if (isPlaying) {
      heardPlay.current = true;
      askedThisPause.current = false;
      return;
    }
    if (!heardPlay.current) {
      return;
    }
    if (!focused || bubbleVisible || !trackId || loadState === 'loading' || loadState === 'error') {
      return;
    }
    if (isPausePromptSuppressed()) {
      return;
    }
    const atMs = usePlayerStore.getState().positionMs;
    const timer = setTimeout(() => {
      const state = usePlayerStore.getState();
      if (askedThisPause.current || state.isPlaying || state.bubble.visible) {
        return;
      }
      if (isPausePromptSuppressed()) {
        return;
      }
      if (markersNearTime(state.markers, atMs).length > 0) {
        return;
      }
      askedThisPause.current = true;
      Alert.alert('Segno qui?', `Vuoi un appunto a ${formatTimecode(atMs)}?`, [
        { text: 'No, grazie', style: 'cancel' },
        {
          text: 'Sì',
          onPress: () => usePlayerStore.getState().pressAddNote(),
        },
      ]);
    }, 1500);
    return () => clearTimeout(timer);
  }, [isPlaying, focused, bubbleVisible, trackId, loadState]);
}

export function PlayerScreen() {
  const navigation = useNavigation();
  const focused = useIsFocused();
  const track = usePlayerStore((s) => s.track);
  const positionMs = usePlayerStore((s) => s.positionMs);
  const canGoBack = navigation.canGoBack();
  usePauseNotePrompt();

  const dismissToTab = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    }
  };

  const dismissGesture = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .activeOffsetY(24)
        .failOffsetX([-28, 28])
        .onEnd((e) => {
          if (e.translationY > DISMISS_DY && e.velocityY > -200) {
            dismissToTab();
          }
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [navigation],
  );

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <GestureDetector gesture={dismissGesture}>
        <View>
          <View style={styles.handleRow} pointerEvents="none">
            <View style={styles.handle} />
          </View>
          <View style={styles.header}>
            {canGoBack ? (
              <Pressable
                onPress={() => navigation.goBack()}
                hitSlop={layout.hitSlop}
                accessibilityRole="button"
                accessibilityLabel="Libreria"
                style={styles.back}
              >
                <Text style={styles.backGlyph}>‹</Text>
              </Pressable>
            ) : null}
            <View style={styles.headerText}>
              <Text style={styles.title} numberOfLines={1}>
                {track.title}
              </Text>
              <Text style={styles.artist} numberOfLines={1}>
                {track.artist}
              </Text>
            </View>
          </View>

          <View style={styles.timecodeRow}>
            <Text style={styles.timecodeNow}>{formatTimecode(positionMs)}</Text>
            <Text style={styles.timecodeSep}> / </Text>
            <Text style={styles.timecodeTotal}>{formatTimecode(track.durationMs)}</Text>
          </View>
        </View>
      </GestureDetector>

      <PracticeBar />

      <View style={styles.wave}>
        <Waveform />
      </View>

      <PlaybackControls />
      <AddNoteButton />
      {focused ? <NoteBubble /> : null}
    </SafeAreaView>
  );
}

const mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  handleRow: {
    alignItems: 'center',
    paddingTop: 6,
    paddingBottom: 2,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  back: {
    width: 22,
    marginLeft: -6,
    marginRight: 4,
    marginTop: -2,
  },
  backGlyph: {
    color: colors.textMuted,
    fontSize: 32,
    lineHeight: 32,
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
