import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { usePlayerStore } from '../../store/playerStore';
import { colors, layout } from '../../theme/colors';

export function AddNoteButton() {
  const pressAddNote = usePlayerStore((s) => s.pressAddNote);

  const onPress = () => {
    try {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {
      // expo-haptics may still be installing or unavailable on this surface
    }
    pressAddNote();
  };

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Aggiungi nota"
        android_ripple={{
          color: 'rgba(255,255,255,0.28)',
          borderless: true,
          radius: layout.addButtonSize / 2,
        }}
        style={({ pressed }) => [styles.fab, pressed && styles.pressed]}
      >
        <Text style={styles.plus}>+</Text>
      </Pressable>
      <Text style={styles.hint}>Aggiungi nota</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 18,
  },
  fab: {
    width: layout.addButtonSize,
    height: layout.addButtonSize,
    borderRadius: layout.addButtonSize / 2,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.42,
    shadowRadius: 14,
    elevation: 10,
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.96 }],
  },
  plus: {
    color: '#FFFFFF',
    fontSize: 36,
    fontWeight: '400',
    lineHeight: 38,
    marginTop: -2,
  },
  hint: {
    marginTop: 8,
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
});
