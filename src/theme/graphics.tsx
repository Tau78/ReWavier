import { StyleSheet, Text, View } from 'react-native';

import { colors } from './colors';

const BAR_HEIGHTS = [0.36, 0.56, 0.78, 1, 0.78, 0.56, 0.36];

const SIZES = {
  xs: 13,
  sm: 18,
  md: 34,
  lg: 52,
} as const;

type MarkSize = keyof typeof SIZES;

export function BrandMark({
  size = 'sm',
  muted = false,
}: {
  size?: MarkSize;
  muted?: boolean;
}) {
  const height = SIZES[size];
  const barW = Math.max(2, Math.round(height * 0.145));
  const gap = Math.max(1.5, barW * 0.42);
  const dot = Math.max(3, Math.round(barW * 0.95));
  const extraTop = Math.ceil(dot * 0.55);
  const wave = muted ? 'rgba(74, 158, 255, 0.38)' : colors.waveform;
  const pin = muted ? 'rgba(255, 107, 53, 0.42)' : colors.accent;

  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{ width: 7 * barW + 6 * gap, height: height + extraTop, justifyContent: 'flex-end' }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap, height }}>
        {BAR_HEIGHTS.map((frac, index) => (
          <View
            key={index}
            style={{
              width: barW,
              height: Math.max(barW, height * frac),
              borderRadius: barW / 2,
              backgroundColor: wave,
            }}
          />
        ))}
      </View>
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 5 * (barW + gap) + barW * 0.1,
          width: dot,
          height: dot,
          borderRadius: dot / 2,
          backgroundColor: pin,
        }}
      />
    </View>
  );
}

export function ScreenAura() {
  return (
    <View pointerEvents="none" style={styles.aura} accessible={false}>
      <View style={styles.auraMark}>
        <BrandMark size="lg" />
      </View>
    </View>
  );
}

export function KindRow({ label }: { label: string }) {
  return (
    <View style={styles.kindRow}>
      <BrandMark size="xs" />
      <Text style={styles.kind}>{label}</Text>
    </View>
  );
}

export function EmptyGraphic() {
  return (
    <View style={styles.emptyWrap} accessible={false}>
      <BrandMark size="md" muted />
    </View>
  );
}

const styles = StyleSheet.create({
  aura: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  auraMark: {
    position: 'absolute',
    top: 10,
    right: 14,
    opacity: 0.12,
  },
  kindRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 2,
  },
  kind: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  emptyWrap: {
    alignItems: 'center',
    marginBottom: 10,
  },
});
