import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../../theme/colors';

export const SEPARATOR_ROW_HEIGHT = 34;

export function AlbumSeparatorRow({
  name,
  onPress,
}: {
  name: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`Separatore ${name}`}
    >
      <View style={styles.line} />
      <Text style={styles.name} numberOfLines={1}>
        {name}
      </Text>
      <View style={styles.line} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    height: SEPARATOR_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 10,
  },
  pressed: {
    opacity: 0.7,
    backgroundColor: colors.surfaceRaised,
  },
  line: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  name: {
    flexShrink: 1,
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    textAlign: 'center',
  },
});
