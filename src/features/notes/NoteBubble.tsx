import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';

import { albumContainsTrackId } from '../../domain/albumVersions';
import { canWriteWithRole, roleOfAlbum } from '../../domain/folderRole';
import {
  canEditMarkerInAlbum,
  markerAuthorLabel,
  markerColor,
  visibleMarkers,
} from '../../domain/markers';
import { formatTimecode } from '../../domain/models';
import { markersNearTime } from '../../domain/practice';
import { shareMarkerClip } from '../../files/shareMarkerClip';
import { useLibraryStore } from '../../store/libraryStore';
import { usePlayerStore } from '../../store/playerStore';
import { useSessionStore } from '../../store/sessionStore';
import { colors, layout } from '../../theme/colors';

const THREAD_VISIBLE_ROWS = 4;

function hapticSuccess() {
  try {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {
    // expo-haptics may be unavailable (web / unsupported device)
  }
}

/** Ora (e giorno se serve) in cui hai scritto l’appunto. */
export function formatNoteAddedAt(ms: number, nowMs = Date.now()): string {
  const date = new Date(ms);
  const time = date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  const startToday = new Date(nowMs);
  startToday.setHours(0, 0, 0, 0);
  const startDay = new Date(date);
  startDay.setHours(0, 0, 0, 0);
  const dayDiff = Math.round((startToday.getTime() - startDay.getTime()) / 86_400_000);
  if (dayDiff === 0) {
    return `oggi · ${time}`;
  }
  if (dayDiff === 1) {
    return `ieri · ${time}`;
  }
  const day = date.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
  return `${day} · ${time}`;
}

export function NoteBubble() {
  const bubble = usePlayerStore((s) => s.bubble);
  const markers = usePlayerStore((s) => s.markers);
  const closeBubble = usePlayerStore((s) => s.closeBubble);
  const deleteMarker = usePlayerStore((s) => s.deleteMarker);
  const hideMarker = usePlayerStore((s) => s.hideMarker);
  const setDraft = usePlayerStore((s) => s.setDraft);
  const saveBubble = usePlayerStore((s) => s.saveBubble);
  const replyAt = usePlayerStore((s) => s.replyAt);
  const openMarker = usePlayerStore((s) => s.openMarker);
  const track = usePlayerStore((s) => s.track);
  const user = useSessionStore((s) => s.user);

  const isEditing = bubble.markerId != null;
  const current = markers.find((marker) => marker.id === bubble.markerId);
  const thread = visibleMarkers(markersNearTime(markers, bubble.timestampMs)).filter(
    (marker) => marker.id !== bubble.markerId,
  );
  const folderRole = useLibraryStore((state) =>
    roleOfAlbum(state.albums.find((album) => albumContainsTrackId(album, track.id))),
  );
  const folderReadOnly = !canWriteWithRole(folderRole);
  const readOnly =
    folderReadOnly || (isEditing && current != null && !canEditMarkerInAlbum(current, user, folderRole));
  const canSave = !readOnly && bubble.draft.trim().length > 0;
  const canReply = !folderReadOnly && (isEditing || thread.length > 0);
  const addedLabel =
    isEditing && current?.createdAt
      ? formatNoteAddedAt(current.createdAt)
      : isEditing
        ? null
        : 'adesso';
  const title = readOnly
    ? `Sola lettura${current?.authorName ? ` · ${current.authorName}` : ''}`
    : isEditing
      ? current?.hidden
        ? 'Storico · nascosto'
        : 'Modifica appunto'
      : 'Nuovo appunto';

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

  const onShareClip = () => {
    const timestampMs = bubble.timestampMs;
    const noteText = bubble.draft.trim() || current?.text || '';
    closeBubble();
    setTimeout(() => {
      void shareMarkerClip({
        track,
        timestampMs,
        noteText,
      });
    }, Platform.OS === 'ios' ? 400 : 50);
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
              <View style={styles.header}>
                <View style={styles.headerMain}>
                  <Text style={styles.timecode} accessibilityRole="text">
                    {formatTimecode(bubble.timestampMs)}
                  </Text>
                  <Text style={styles.subtitle}>{title}</Text>
                </View>
                {addedLabel ? (
                  <View style={styles.addedPill} accessibilityLabel={`Aggiunto ${addedLabel}`}>
                    <Text style={styles.addedLabel}>Aggiunto</Text>
                    <Text style={styles.addedValue}>{addedLabel}</Text>
                  </View>
                ) : null}
              </View>

              {thread.length > 0 ? (
                <View style={styles.thread} accessibilityLabel="Altri appunti sullo stesso momento">
                  <Text style={styles.threadTitle}>Stesso momento</Text>
                  <ScrollView
                    style={thread.length > THREAD_VISIBLE_ROWS ? styles.threadList : undefined}
                    contentContainerStyle={styles.threadRows}
                    keyboardShouldPersistTaps="handled"
                    nestedScrollEnabled
                    showsVerticalScrollIndicator={thread.length > THREAD_VISIBLE_ROWS}
                  >
                    {thread.map((marker) => {
                      const who = markerAuthorLabel(marker);
                      const pinColor = markerColor(marker);
                      const whoLine = who === 'Tu' ? 'Tu dici:' : `${who} dice:`;
                      return (
                        <Pressable
                          key={marker.id}
                          onPress={() => openMarker(marker.id)}
                          accessibilityRole="button"
                          accessibilityLabel={
                            who === 'Tu' ? 'Apri il tuo appunto' : `Apri l'appunto di ${who}`
                          }
                          style={({ pressed }) => [
                            styles.threadRow,
                            pressed && styles.threadRowPressed,
                          ]}
                        >
                          <View style={[styles.threadDot, { backgroundColor: pinColor }]} />
                          <View style={styles.threadCopy}>
                            <Text style={[styles.threadWho, { color: pinColor }]} numberOfLines={1}>
                              {whoLine}
                            </Text>
                            <Text style={styles.threadText} numberOfLines={1}>
                              {marker.text.trim() || '—'}
                            </Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
              ) : null}

              <View style={styles.chipRow}>
                {canReply ? (
                  <Pressable
                    onPress={() => replyAt(bubble.timestampMs)}
                    hitSlop={layout.hitSlop}
                    accessibilityRole="button"
                    accessibilityLabel="Rispondi sullo stesso momento"
                    style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
                  >
                    <Text style={styles.chipLabel}>Rispondi</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={onShareClip}
                  hitSlop={layout.hitSlop}
                  accessibilityRole="button"
                  accessibilityLabel="Invia 12 secondi"
                  style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
                >
                  <Text style={styles.chipLabel}>Invia 12 secondi</Text>
                </Pressable>
              </View>

              <TextInput
                style={styles.input}
                value={bubble.draft}
                onChangeText={setDraft}
                placeholder="Scrivi qui il tuo appunto…"
                placeholderTextColor={colors.textMuted}
                multiline
                autoFocus={!readOnly}
                editable={!readOnly}
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
                  style={({ pressed }) => [styles.ghostHit, pressed && styles.ghostHitPressed]}
                >
                  <Text style={styles.cancelLabel}>Annulla</Text>
                </Pressable>

                <View style={styles.actionsRight}>
                  {isEditing && !readOnly ? (
                    <Pressable
                      onPress={() => {
                        if (bubble.markerId) {
                          hideMarker(bubble.markerId, !current?.hidden);
                        }
                      }}
                      hitSlop={layout.hitSlop}
                      accessibilityRole="button"
                      accessibilityLabel={current?.hidden ? 'Mostra appunto' : 'Nascondi appunto'}
                      style={({ pressed }) => [styles.ghostHit, pressed && styles.ghostHitPressed]}
                    >
                      <Text style={styles.hideLabel}>{current?.hidden ? 'Mostra' : 'Nascondi'}</Text>
                    </Pressable>
                  ) : null}

                  {isEditing && !readOnly ? (
                    <Pressable
                      onPress={onDelete}
                      hitSlop={layout.hitSlop}
                      accessibilityRole="button"
                      accessibilityLabel="Elimina appunto"
                      style={({ pressed }) => [styles.ghostHit, pressed && styles.ghostHitPressed]}
                    >
                      <Text style={styles.deleteLabel}>Elimina</Text>
                    </Pressable>
                  ) : null}

                  {readOnly ? null : (
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
                  )}
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
    paddingHorizontal: 14,
    paddingBottom: 22,
    alignItems: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: colors.surfaceRaised,
    borderRadius: 24,
    paddingTop: 18,
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 16,
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
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerMain: {
    flex: 1,
    minWidth: 0,
  },
  timecode: {
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontSize: 22,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.2,
    color: colors.accent,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '500',
    color: colors.textMuted,
  },
  addedPill: {
    alignItems: 'flex-end',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  addedLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  addedValue: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  thread: {
    marginTop: 14,
    gap: 8,
  },
  threadTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.3,
  },
  threadList: {
    maxHeight: 184,
  },
  threadRows: {
    gap: 8,
  },
  threadRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 2,
  },
  threadRowPressed: {
    opacity: 0.7,
  },
  threadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
  },
  threadCopy: {
    flex: 1,
    minWidth: 0,
  },
  threadWho: {
    fontSize: 13,
    fontWeight: '700',
  },
  threadText: {
    marginTop: 1,
    fontSize: 14,
    lineHeight: 18,
    color: colors.text,
  },
  chipRow: {
    marginTop: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 107, 53, 0.14)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 107, 53, 0.35)',
  },
  chipPressed: {
    opacity: 0.75,
  },
  chipLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.accent,
  },
  input: {
    marginTop: 14,
    minHeight: 104,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    color: colors.text,
    fontSize: 17,
    lineHeight: 24,
  },
  actions: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  actionsRight: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    gap: 4,
  },
  ghostHit: {
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  ghostHitPressed: {
    opacity: 0.65,
  },
  cancelLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.textMuted,
  },
  hideLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textMuted,
  },
  deleteLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.danger,
  },
  saveButton: {
    marginLeft: 4,
    backgroundColor: colors.accent,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 14,
    minWidth: 76,
    alignItems: 'center',
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
