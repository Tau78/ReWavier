import { Component, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

import { colors } from './colors';

const DEEP_COLORS = [
  colors.gradientDeepTop,
  colors.gradientDeepMid,
  colors.gradientDeepBottom,
] as const;

const DEEP_LOCATIONS = [0, 0.42, 1] as const;

/**
 * Full-bleed purple → black gradient. Pair with or instead of `ScreenAura`.
 * Does not change the locked player — screens opt in.
 */
export function DeepBackdrop() {
  return (
    <LinearGradient
      accessible={false}
      pointerEvents="none"
      colors={DEEP_COLORS}
      locations={DEEP_LOCATIONS}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={styles.backdrop}
    />
  );
}

type GlassCardProps = {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

type GlassBoundaryProps = {
  children: ReactNode;
  fallback: ReactNode;
};

type GlassBoundaryState = {
  failed: boolean;
};

/** If BlurView throws (missing native, web), keep a translucent surface. */
class GlassBlurBoundary extends Component<GlassBoundaryProps, GlassBoundaryState> {
  state: GlassBoundaryState = { failed: false };

  static getDerivedStateFromError(): GlassBoundaryState {
    return { failed: true };
  }

  componentDidCatch() {
    // swallow — glassFill alone is enough
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * Frosted card: dark blur + translucent fill + hairline border, radius 16.
 */
export function GlassCard({ children, style }: GlassCardProps) {
  const fallback = (
    <View style={[styles.card, styles.fallbackFill, style]}>{children}</View>
  );

  return (
    <GlassBlurBoundary fallback={fallback}>
      <BlurView intensity={28} tint="dark" style={[styles.card, style]}>
        <View pointerEvents="none" style={styles.tint} />
        <View pointerEvents="none" style={styles.highlight} />
        {children}
      </BlurView>
    </GlassBlurBoundary>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    zIndex: 0,
  },
  card: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
  },
  tint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.glassFill,
  },
  highlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.glassHighlight,
  },
  fallbackFill: {
    backgroundColor: colors.glassFill,
  },
});
