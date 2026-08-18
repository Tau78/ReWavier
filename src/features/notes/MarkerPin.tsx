import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { formatTimecode } from '../../domain/models';
import { colors } from '../../theme/colors';

export type MarkerPinProps = {
  timestampMs?: number;
  selected?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

export function MarkerPin({ timestampMs, selected = false, onPress, style }: MarkerPinProps) {
  const label =
    timestampMs != null ? `Appunto a ${formatTimecode(timestampMs)}` : 'Appunto';

  const pin = (
    <View style={[styles.pin, selected && styles.pinSelected]} pointerEvents="none">
      <View style={[styles.dot, selected && styles.dotSelected]} />
      <View style={[styles.stem, selected && styles.stemSelected]} />
    </View>
  );

  if (!onPress) {
    return <View style={style}>{pin}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [style, pressed && styles.pressed]}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
    >
      {pin}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pin: {
    alignItems: 'center',
    width: 12,
  },
  pinSelected: {
    width: 16,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.marker,
  },
  dotSelected: {
    width: 11,
    height: 11,
    borderRadius: 6,
  },
  stem: {
    width: 2,
    height: 18,
    marginTop: -1,
    backgroundColor: colors.marker,
    borderRadius: 1,
  },
  stemSelected: {
    width: 2.5,
    height: 22,
  },
  pressed: {
    opacity: 0.75,
  },
});
