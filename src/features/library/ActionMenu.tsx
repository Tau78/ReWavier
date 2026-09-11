import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '../../theme/colors';

export type ActionItem = {
  label: string;
  onPress: () => void;
  danger?: boolean;
};

export function ActionMenu({
  visible,
  title,
  message,
  actions,
  onClose,
}: {
  visible: boolean;
  title: string;
  /** Full note (or other body). Shown complete, not cut. */
  message?: string;
  actions: ActionItem[];
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const body = message?.trim();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} />
      <View style={[styles.sheet, { bottom: 28 + insets.bottom }]}>
        <Text style={styles.title}>{title}</Text>
        {body ? (
          <ScrollView
            style={styles.messageScroll}
            contentContainerStyle={styles.messagePad}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.message}>{body}</Text>
          </ScrollView>
        ) : null}
        {actions.map((action) => (
          <Pressable
            key={action.label}
            onPress={() => {
              onClose();
              const run = action.onPress;
              setTimeout(run, Platform.OS === 'ios' ? 400 : 50);
            }}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <Text style={[styles.label, action.danger && styles.danger]}>{action.label}</Text>
          </Pressable>
        ))}
        <Pressable onPress={onClose} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
          <Text style={styles.cancel}>Annulla</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.overlay,
  },
  sheet: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 28,
    backgroundColor: colors.surfaceRaised,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
    paddingTop: 14,
  },
  title: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
    paddingHorizontal: 18,
    paddingBottom: 8,
  },
  messageScroll: {
    maxHeight: 220,
  },
  messagePad: {
    paddingHorizontal: 18,
    paddingBottom: 12,
  },
  message: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '500',
  },
  row: {
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  pressed: {
    backgroundColor: colors.surface,
  },
  label: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '600',
  },
  danger: {
    color: colors.danger,
  },
  cancel: {
    color: colors.textMuted,
    fontSize: 16,
    fontWeight: '500',
  },
});
