import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { usePlayerStore } from '../../store/playerStore';
import { colors, layout } from '../../theme/colors';

function PlayIcon({ showPause }: { showPause: boolean }) {
  if (showPause) {
    return (
      <View style={styles.pauseGlyph} accessibilityElementsHidden>
        <View style={styles.pauseBar} />
        <View style={styles.pauseBar} />
      </View>
    );
  }
  return <View style={styles.playGlyph} accessibilityElementsHidden />;
}

function StopIcon() {
  return <View style={styles.stopGlyph} accessibilityElementsHidden />;
}

function ControlButton({
  onPress,
  accessibilityLabel,
  label,
  emphasized,
  children,
}: {
  onPress: () => void;
  accessibilityLabel: string;
  label: string;
  emphasized?: boolean;
  children: ReactNode;
}) {
  return (
    <View style={styles.col}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        android_ripple={{
          color: 'rgba(255,255,255,0.16)',
          borderless: true,
          radius: layout.controlSize / 2 + 6,
        }}
        style={({ pressed }) => [
          styles.btn,
          emphasized && styles.btnEmphasized,
          pressed && styles.btnPressed,
        ]}
      >
        {children}
      </Pressable>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

export function PlaybackControls() {
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const play = usePlayerStore((s) => s.play);
  const pause = usePlayerStore((s) => s.pause);
  const stop = usePlayerStore((s) => s.stop);
  const seekBy = usePlayerStore((s) => s.seekBy);

  return (
    <View style={styles.row}>
      <ControlButton
        onPress={() => seekBy(-10_000)}
        accessibilityLabel="Indietro 10s"
        label="−10s"
      >
        <Text style={styles.skipText}>−10</Text>
      </ControlButton>

      <ControlButton onPress={stop} accessibilityLabel="Stop" label="Stop">
        <StopIcon />
      </ControlButton>

      <ControlButton
        onPress={() => (isPlaying ? pause() : play())}
        accessibilityLabel={isPlaying ? 'Pausa' : 'Play'}
        label={isPlaying ? 'Pausa' : 'Play'}
        emphasized
      >
        <PlayIcon showPause={isPlaying} />
      </ControlButton>

      <ControlButton
        onPress={() => seekBy(10_000)}
        accessibilityLabel="Avanti 10s"
        label="+10s"
      >
        <Text style={styles.skipText}>+10</Text>
      </ControlButton>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 18,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  col: {
    alignItems: 'center',
    gap: 8,
  },
  btn: {
    width: layout.controlSize,
    height: layout.controlSize,
    minWidth: 56,
    minHeight: 56,
    borderRadius: layout.controlSize / 2,
    backgroundColor: colors.surfaceRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnEmphasized: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  btnPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.96 }],
  },
  label: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  skipText: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.4,
    fontVariant: ['tabular-nums'],
  },
  stopGlyph: {
    width: 18,
    height: 18,
    borderRadius: 3,
    backgroundColor: colors.text,
  },
  playGlyph: {
    width: 0,
    height: 0,
    marginLeft: 3,
    borderTopWidth: 10,
    borderBottomWidth: 10,
    borderLeftWidth: 16,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: colors.text,
  },
  pauseGlyph: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  pauseBar: {
    width: 5,
    height: 18,
    borderRadius: 1.5,
    backgroundColor: colors.text,
  },
});
