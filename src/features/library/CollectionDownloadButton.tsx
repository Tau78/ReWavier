import { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text } from 'react-native';

import {
  collectionDownloadGlyph,
  type CollectionDownloadVisual,
} from '../../domain/collectionDownloadVisual';
import { colors } from '../../theme/colors';

export function CollectionDownloadButton({
  visual,
  busy,
  busyLabel,
  idleLabel,
  onPress,
}: {
  visual: CollectionDownloadVisual;
  busy: boolean;
  busyLabel: string;
  idleLabel: string;
  onPress: () => void;
}) {
  const pulse = useRef(new Animated.Value(1)).current;
  const needsAttention = visual === 'update' || visual === 'download';

  useEffect(() => {
    if (!needsAttention || busy) {
      pulse.stopAnimation();
      pulse.setValue(1);
      return;
    }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.14, duration: 640, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 640, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => {
      anim.stop();
      pulse.setValue(1);
    };
  }, [busy, needsAttention, pulse]);

  return (
    <Animated.View style={{ transform: [{ scale: pulse }] }}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.plus,
          needsAttention && styles.attention,
          pressed && styles.plusPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={busy ? busyLabel : idleLabel}
        disabled={busy && visual !== 'pause'}
      >
        {busy && visual !== 'pause' ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <Text
            style={[
              styles.plusGlyph,
              visual === 'pause' && styles.pauseGlyph,
              visual === 'done' && styles.downloadDone,
              needsAttention && styles.attentionGlyph,
            ]}
          >
            {collectionDownloadGlyph(visual)}
          </Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  plus: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attention: {
    borderColor: colors.accent,
    borderWidth: 1.5,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 8,
    elevation: 6,
  },
  plusPressed: {
    opacity: 0.7,
  },
  plusGlyph: {
    color: colors.accent,
    fontSize: 22,
    fontWeight: '600',
    marginTop: -2,
  },
  attentionGlyph: {
    color: colors.accent,
  },
  downloadDone: {
    color: '#34C759',
  },
  pauseGlyph: {
    fontSize: 16,
    marginTop: 0,
  },
});
