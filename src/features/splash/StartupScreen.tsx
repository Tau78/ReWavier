import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { BrandMark } from '../../theme/graphics';
import { colors } from '../../theme/colors';

export function StartupScreen() {
  return (
    <View style={styles.root}>
      <BrandMark size="lg" />
      <Text style={styles.title}>ReWavier</Text>
      <ActivityIndicator color={colors.accent} style={styles.spinner} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  title: {
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
  spinner: {
    marginTop: 8,
  },
});
