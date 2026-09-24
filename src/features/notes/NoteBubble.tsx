import { useEffect, useMemo, useRef, useState } from 'react';
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

import { albumMentionCandidates } from '../../domain/albumPeople';
import { albumContainsTrackId } from '../../domain/albumVersions';
import { canWriteWithRole, roleOfAlbum } from '../../domain/folderRole';
import {
  canEditMarkerInAlbum,
  canShowNoteReply,
  isOwnMarker,
  isPlaceholderMarker,
  markerAuthorLabel,
  markerColor,
} from '../../domain/markers';
import {
  activeMentionQuery,
  filtersMentionCandidates,
  insertMentionAt,
} from '../../domain/mentions';
import { formatTimecode } from '../../domain/models';
import { conversationAtTime } from '../../domain/practice';
import { shareMarkerClip } from '../../files/shareMarkerClip';
import { useLibraryStore } from '../../store/libraryStore';
import { usePlayerStore } from '../../store/playerStore';
import { useSessionStore } from '../../store/sessionStore';
import { colors, layout, textColorOn } from '../../theme/colors';

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
  const conversation = conversationAtTime(markers, bubble.timestampMs);
  const folderRole = useLibraryStore((state) =>
    roleOfAlbum(state.albums.find((album) => albumContainsTrackId(album, track.id))),
  );
  const album = useLibraryStore((state) =>
    state.albums.find((item) => albumContainsTrackId(item, track.id)),
  );
  const markersByTrackId = useLibraryStore((state) => state.markersByTrackId);
  const mentionPeople = useMemo(
    () => albumMentionCandidates(album, markersByTrackId, user),
    [album, markersByTrackId, user],
  );
  const folderReadOnly = !canWriteWithRole(folderRole);
  const readOnly =
    folderReadOnly || (isEditing && current != null && !canEditMarkerInAlbum(current, user, folderRole));
  const inputRef = useRef<TextInput>(null);
  const [chatView, setChatView] = useState(false);
  const mentionQuery = useMemo(
    () => (chatView || readOnly ? null : activeMentionQuery(bubble.draft)),
    [bubble.draft, chatView, readOnly],
  );
  const mentionSuggestions = useMemo(
    () => (mentionQuery ? filtersMentionCandidates(mentionPeople, mentionQuery.query) : []),
    [mentionPeople, mentionQuery],
  );

  useEffect(() => {
    if (!bubble.visible) {
      return;
    }
    setChatView(Boolean(bubble.markerId) && conversation.length > 0);
    // Solo quando la scheda si apre: Rispondi e il tap sul messaggio cambiano chatView a mano.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bubble.visible]);

  useEffect(() => {
    if (!bubble.visible || chatView || readOnly) {
      return;
    }
    const timer = setTimeout(() => inputRef.current?.focus(), 40);
    return () => clearTimeout(timer);
  }, [bubble.visible, chatView, readOnly]);
  const prompt = bubble.placeholderPrompt?.trim() ?? '';
  const showingStamp =
    isEditing &&
    current != null &&
    isPlaceholderMarker(current) &&
    bubble.draft.trim() === current.text.trim();
  const canSave =
    !readOnly &&
    (chatView || bubble.draft.trim().length > 0 || (!isEditing && prompt.length > 0));
  const canReply = canShowNoteReply(folderReadOnly, conversation.length);
  const threadItems = chatView
    ? conversation
    : conversation.filter((item) => item.id !== bubble.markerId);

  const startReply = () => {
    setChatView(false);
    replyAt(bubble.timestampMs);
  };
  const addedLabel =
    isEditing && current?.createdAt
      ? formatNoteAddedAt(current.createdAt)
      : isEditing
        ? null
        : 'adesso';
  const title = readOnly
    ? `Sola lettura${current?.authorName ? ` · ${current.authorName}` : ''}`
    : conversation.length > 0
      ? current?.hidden
        ? 'Storico · nascosto'
        : 'Conversazione'
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

              {threadItems.length > 0 ? (
                <View style={styles.thread} accessibilityLabel="Conversazione su questo momento">
                  {conversation.length > 1 ? (
                    <Text style={styles.threadTitle}>{`${conversation.length} messaggi`}</Text>
                  ) : null}
                  <ScrollView
                    style={threadItems.length > THREAD_VISIBLE_ROWS ? styles.threadList : undefined}
                    contentContainerStyle={styles.threadRows}
                    keyboardShouldPersistTaps="handled"
                    nestedScrollEnabled
                    showsVerticalScrollIndicator={threadItems.length > THREAD_VISIBLE_ROWS}
                  >
                    {threadItems.map((marker) => {
                      const mine = isOwnMarker(marker, user);
                      const who = mine ? 'Tu' : markerAuthorLabel(marker);
                      const pinColor = markerColor(marker, album?.memberColors);
                      const messageTextColor = textColorOn(pinColor);
                      const selected = marker.id === bubble.markerId;
                      return (
                        <Pressable
                          key={marker.id}
                          onPress={() => {
                            openMarker(marker.id);
                            setChatView(!mine);
                          }}
                          accessibilityRole="button"
                          accessibilityLabel={
                            mine ? 'Modifica il tuo appunto' : `Messaggio di ${who}`
                          }
                          style={({ pressed }) => [
                            styles.chatRow,
                            mine ? styles.chatRowMine : styles.chatRowOther,
                            pressed && styles.threadRowPressed,
                          ]}
                        >
                          <View
                            style={[
                              styles.chatBubble,
                              mine ? styles.chatBubbleMine : styles.chatBubbleOther,
                              { borderLeftColor: pinColor, backgroundColor: pinColor },
                              selected && styles.chatBubbleSelected,
                              selected && { borderColor: messageTextColor },
                            ]}
                          >
                            {mine ? null : (
                              <Text
                                style={[styles.threadWho, { color: messageTextColor }]}
                                numberOfLines={1}
                              >
                                {who}
                              </Text>
                            )}
                            <Text
                              style={[
                                styles.chatText,
                                mine && styles.chatTextMine,
                                isPlaceholderMarker(marker) && styles.stampText,
                                { color: messageTextColor },
                              ]}
                            >
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
                    onPress={startReply}
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

              {mentionSuggestions.length > 0 && mentionQuery ? (
                <View style={styles.mentionBox} accessibilityLabel="Persone da taggare">
                  {mentionSuggestions.map((person) => (
                    <Pressable
                      key={person.key}
                      onPress={() => {
                        setDraft(
                          insertMentionAt(
                            bubble.draft,
                            mentionQuery.start,
                            mentionQuery.query,
                            person.handle,
                          ),
                        );
                      }}
                      style={({ pressed }) => [styles.mentionRow, pressed && styles.mentionRowPressed]}
                      accessibilityRole="button"
                      accessibilityLabel={`Tagga ${person.name}`}
                    >
                      <View style={[styles.mentionDot, { backgroundColor: person.color }]}>
                        <Text style={styles.mentionInitial}>{person.initial}</Text>
                      </View>
                      <View style={styles.mentionCopy}>
                        <Text style={styles.mentionName} numberOfLines={1}>
                          {person.name}
                        </Text>
                        <Text style={styles.mentionHandle} numberOfLines={1}>
                          @{person.handle}
                        </Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              ) : null}

              <TextInput
                ref={inputRef}
                style={[styles.input, showingStamp && !chatView && styles.stampInput]}
                value={chatView ? '' : bubble.draft}
                onChangeText={(text) => {
                  if (chatView) {
                    startReply();
                  }
                  setDraft(text);
                }}
                onFocus={() => {
                  if (chatView) {
                    startReply();
                  }
                }}
                placeholder={
                  chatView || (conversation.length > 0 && !isEditing)
                    ? 'Scrivi la tua risposta…'
                    : isEditing
                      ? 'Scrivi qui il tuo appunto… Usa @ per taggare'
                      : prompt || 'Scrivi qui il tuo appunto… Usa @ per taggare'
                }
                placeholderTextColor={colors.textMuted}
                multiline
                autoFocus={false}
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
    maxHeight: 240,
  },
  threadRows: {
    gap: 8,
  },
  threadRowPressed: {
    opacity: 0.7,
  },
  chatRow: {
    width: '100%',
  },
  chatRowMine: {
    alignItems: 'flex-end',
  },
  chatRowOther: {
    alignItems: 'flex-start',
  },
  chatBubble: {
    maxWidth: '82%',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
  },
  chatBubbleMine: {
    backgroundColor: colors.accent,
    borderBottomRightRadius: 4,
  },
  chatBubbleOther: {
    backgroundColor: colors.surface,
    borderBottomLeftRadius: 4,
    borderLeftWidth: 3,
    borderLeftColor: colors.marker,
  },
  chatBubbleSelected: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.text,
  },
  chatText: {
    fontSize: 15,
    lineHeight: 20,
    color: colors.text,
  },
  chatTextMine: {
    color: colors.text,
  },
  threadWho: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  stampText: {
    opacity: 0.72,
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
  mentionBox: {
    marginTop: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  mentionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  mentionRowPressed: {
    opacity: 0.75,
  },
  mentionDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mentionInitial: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  mentionCopy: {
    flex: 1,
    minWidth: 0,
  },
  mentionName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  mentionHandle: {
    marginTop: 1,
    color: colors.textMuted,
    fontSize: 12,
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
  stampInput: {
    color: colors.textMuted,
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
