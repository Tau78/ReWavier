import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';

import { formatTimecode } from '../../domain/models';
import { usePlayerStore } from '../../store/playerStore';
import { colors, layout } from '../../theme/colors';

function hapticSuccess() {
  try {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {
    // expo-haptics may be unavailable (web / unsupported device)
  }
}

export function NoteBubble() {
  const bubble = usePlayerStore((s) => s.bubble);
  const closeBubble = usePlayerStore((s) => s.closeBubble);
  const deleteMarker = usePlayerStore((s) => s.deleteMarker);
  const setDraft = usePlayerStore((s) => s.setDraft);
  const saveBubble = usePlayerStore((s) => s.saveBubble);

  const isEditing = bubble.markerId != null;
  const canSave = bubble.draft.trim().length > 0;

  const persistNote = () => {
    if (!canSave) {
      return;
    }
    hapticSuccess();
    saveBubble();
  };

  const onDelete = () => {
    if (!bubble.markerId) {
      return;
    }
    deleteMarker(bubble.markerId);
  };

  return (
    <Modal
      visible={bubble.visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={closeBubble}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.flex}>
          <Pressable
            style={styles.overlay}
            onPress={closeBubble}
            accessibilityRole="button"
            accessibilityLabel="Chiudi appunto"
          />

          <View style={styles.cardWrap} pointerEvents="box-none">
            <View style={styles.card}>
              <Text style={styles.timecode} accessibilityRole="text">
                {formatTimecode(bubble.timestampMs)}
              </Text>
              <Text style={styles.subtitle}>
                {isEditing ? 'Modifica appunto' : 'Nuovo appunto'}
              </Text>

              <TextInput
                style={styles.input}
                value={bubble.draft}
                onChangeText={setDraft}
                placeholder="Scrivi il tuo appunto…"
                placeholderTextColor={colors.textMuted}
                multiline
                autoFocus
                textAlignVertical="top"
                selectionColor={colors.accent}
                cursorColor={colors.accent}
              />

              <View style={styles.actions}>
                <Pressable
                  onPress={closeBubble}
                  hitSlop={layout.hitSlop}
                  accessibilityRole="button"
                  accessibilityLabel="Annulla"
                >
                  <Text style={styles.cancelLabel}>Annulla</Text>
                </Pressable>

                <View style={styles.actionsRight}>
                  {isEditing ? (
                    <Pressable
                      onPress={onDelete}
                      hitSlop={layout.hitSlop}
                      accessibilityRole="button"
                      accessibilityLabel="Elimina appunto"
                    >
                      <Text style={styles.deleteLabel}>Elimina</Text>
                    </Pressable>
                  ) : null}

                  <Pressable
                    onPress={persistNote}
                    disabled={!canSave}
                    accessibilityRole="button"
                    accessibilityLabel="Salva appunto"
                    style={({ pressed }) => [
                      styles.saveButton,
                      !canSave && styles.saveButtonDisabled,
                      pressed && canSave && styles.saveButtonPressed,
                    ]}
                  >
                    <Text style={styles.saveLabel}>Salva</Text>
                  </Pressable>
                </View>
              </View>
            </View>

            <View style={styles.tail} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.overlay,
  },
  cardWrap: {
    marginTop: 'auto',
    paddingHorizontal: 16,
    paddingBottom: 28,
    alignItems: 'center',
  },
  card: {
    width: '100%',
    backgroundColor: colors.surfaceRaised,
    borderRadius: 20,
    padding: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.45,
    shadowRadius: 18,
    elevation: 14,
  },
  tail: {
    width: 14,
    height: 14,
    marginTop: -7,
    backgroundColor: colors.surfaceRaised,
    transform: [{ rotate: '45deg' }],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  timecode: {
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontSize: 15,
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.4,
    color: colors.accent,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    color: colors.textMuted,
  },
  input: {
    marginTop: 16,
    minHeight: 90,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    color: colors.text,
    fontSize: 16,
    lineHeight: 22,
  },
  actions: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  actionsRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cancelLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.textMuted,
  },
  deleteLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.danger,
  },
  saveButton: {
    backgroundColor: colors.accent,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
  },
  saveButtonPressed: {
    opacity: 0.86,
  },
  saveButtonDisabled: {
    opacity: 0.4,
  },
  saveLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
});
