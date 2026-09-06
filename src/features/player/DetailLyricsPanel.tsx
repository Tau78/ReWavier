import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { albumContainsTrackId } from '../../domain/albumVersions';
import { canWriteWithRole, roleOfAlbum } from '../../domain/folderRole';
import {
  annotationsForSpan,
  applyProposalToLyrics,
  rejectProposal,
  stampCoachingAnnotation,
  stampProposalAnnotation,
  tokenizeLyrics,
  wordHasAnnotations,
  type LyricAnnotation,
  type LyricWord,
} from '../../domain/lyrics';
import { optionalTrackText } from '../../domain/models';
import { useLibraryStore } from '../../store/libraryStore';
import { useSessionStore } from '../../store/sessionStore';
import { colors } from '../../theme/colors';

type ComposeKind = 'coaching' | 'proposal';

type ComposeState = {
  word: LyricWord;
  kind: ComposeKind;
};

export function DetailLyricsPanel({ trackId }: { trackId: string }) {
  const track = useLibraryStore((state) => state.tracks.find((item) => item.id === trackId));
  const lyrics = track?.lyrics ?? '';
  const annotations = track?.lyricAnnotations ?? [];
  const writeAllowed = useLibraryStore((state) =>
    canWriteWithRole(roleOfAlbum(state.albums.find((album) => albumContainsTrackId(album, trackId)))),
  );
  const user = useSessionStore((state) => state.user);

  const [editingText, setEditingText] = useState(false);
  const [draft, setDraft] = useState(lyrics);
  const [compose, setCompose] = useState<ComposeState | null>(null);
  const [composeBody, setComposeBody] = useState('');
  const [composeSuggested, setComposeSuggested] = useState('');
  const [selectedWord, setSelectedWord] = useState<LyricWord | null>(null);

  useEffect(() => {
    if (!editingText) {
      setDraft(lyrics);
    }
  }, [lyrics, editingText]);

  const lines = useMemo(() => tokenizeLyrics(lyrics), [lyrics]);
  const selectedNotes = useMemo(
    () =>
      selectedWord
        ? annotationsForSpan(annotations, selectedWord.startChar, selectedWord.endChar)
        : [],
    [annotations, selectedWord],
  );

  const saveLyrics = () => {
    useLibraryStore.getState().setTrackLyrics(trackId, draft);
    setEditingText(false);
  };

  const openCompose = (word: LyricWord, kind: ComposeKind) => {
    setSelectedWord(null);
    setCompose({ word, kind });
    setComposeBody('');
    setComposeSuggested(kind === 'proposal' ? word.text : '');
  };

  const saveCompose = () => {
    if (!compose || !composeBody.trim()) {
      return;
    }
    const author = {
      authorId: user?.id,
      authorName: user?.displayName,
    };
    const next: LyricAnnotation =
      compose.kind === 'proposal'
        ? stampProposalAnnotation({
            startChar: compose.word.startChar,
            endChar: compose.word.endChar,
            body: composeBody,
            suggestedText: composeSuggested.trim() || compose.word.text,
            ...author,
          })
        : stampCoachingAnnotation({
            startChar: compose.word.startChar,
            endChar: compose.word.endChar,
            body: composeBody,
            ...author,
          });
    const store = useLibraryStore.getState();
    store.setTrackLyricAnnotations(trackId, [...(store.getTrack(trackId)?.lyricAnnotations ?? []), next]);
    setCompose(null);
  };

  const acceptProposal = (annotationId: string) => {
    const current = useLibraryStore.getState().getTrack(trackId);
    if (!current) {
      return;
    }
    const applied = applyProposalToLyrics(
      current.lyrics ?? '',
      current.lyricAnnotations ?? [],
      annotationId,
    );
    if (!applied) {
      return;
    }
    useLibraryStore.getState().setTrackLyrics(trackId, applied.lyrics);
    useLibraryStore.getState().setTrackLyricAnnotations(trackId, applied.annotations);
    setSelectedWord(null);
  };

  const declineProposal = (annotationId: string) => {
    const current = useLibraryStore.getState().getTrack(trackId)?.lyricAnnotations ?? [];
    useLibraryStore.getState().setTrackLyricAnnotations(trackId, rejectProposal(current, annotationId));
  };

  if (editingText) {
    return (
      <View style={styles.root}>
        <TextInput
          style={styles.editor}
          value={draft}
          onChangeText={setDraft}
          multiline
          textAlignVertical="top"
          placeholder="Scrivi il testo della canzone."
          placeholderTextColor={colors.textMuted}
          accessibilityLabel="Testo della canzone"
        />
        <View style={styles.editorActions}>
          <Pressable onPress={() => setEditingText(false)} hitSlop={8}>
            <Text style={styles.linkMuted}>Annulla</Text>
          </Pressable>
          <Pressable onPress={saveLyrics} hitSlop={8}>
            <Text style={styles.linkAccent}>Salva testo</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (!optionalTrackText(lyrics)) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>Nessun testo</Text>
        <Text style={styles.emptyBody}>
          Qui vedi le parole della canzone. Puoi anche lasciare un consiglio su una parola.
        </Text>
        {writeAllowed ? (
          <Pressable
            style={styles.emptyButton}
            onPress={() => {
              setDraft('');
              setEditingText(true);
            }}
            accessibilityRole="button"
            accessibilityLabel="Scrivi il testo"
          >
            <Text style={styles.emptyButtonLabel}>Scrivi il testo</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {lines.map((line, lineIndex) => (
          <View key={`line-${lineIndex}-${line.startChar}`} style={styles.line}>
            {line.words.length === 0 ? <Text style={styles.blankLine}> </Text> : null}
            {line.words.map((word) => {
              const marked = wordHasAnnotations(annotations, word.startChar, word.endChar);
              const selected =
                selectedWord?.startChar === word.startChar && selectedWord?.endChar === word.endChar;
              return (
                <Pressable
                  key={`${word.startChar}-${word.endChar}`}
                  onPress={() => {
                    if (marked) {
                      setSelectedWord(word);
                      return;
                    }
                    openCompose(word, 'coaching');
                  }}
                  onLongPress={() => openCompose(word, 'proposal')}
                  delayLongPress={380}
                  accessibilityRole="button"
                  accessibilityLabel={
                    marked
                      ? `${word.text}, con annotazione`
                      : `${word.text}. Tocca per annotare. Tieni premuto per proporre un cambio.`
                  }
                  style={[styles.wordHit, marked && styles.wordMarked, selected && styles.wordSelected]}
                >
                  <Text style={[styles.word, marked && styles.wordMarkedText]}>{word.text}</Text>
                </Pressable>
              );
            })}
          </View>
        ))}
      </ScrollView>

      {writeAllowed ? (
        <Pressable onPress={() => setEditingText(true)} hitSlop={8} style={styles.editLink}>
          <Text style={styles.linkMuted}>Modifica testo</Text>
        </Pressable>
      ) : null}

      <Modal
        visible={selectedWord != null}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedWord(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setSelectedWord(null)}>
          <Pressable style={styles.sheet} onPress={(event) => event.stopPropagation()}>
            <Text style={styles.sheetTitle}>{selectedWord?.text}</Text>
            {selectedNotes.length === 0 ? (
              <Text style={styles.sheetEmpty}>Nessuna annotazione.</Text>
            ) : (
              selectedNotes.map((note) => (
                <View key={note.id} style={styles.noteCard}>
                  <Text style={styles.noteKind}>
                    {note.kind === 'proposal' ? 'Proposta di cambio' : 'Annotazione'}
                    {note.authorName ? ` · ${note.authorName}` : ''}
                  </Text>
                  <Text style={styles.noteBody}>{note.body}</Text>
                  {note.kind === 'proposal' && note.suggestedText ? (
                    <Text style={styles.noteSuggest}>Nuovo testo: {note.suggestedText}</Text>
                  ) : null}
                  {note.kind === 'proposal' && note.status === 'open' && writeAllowed ? (
                    <View style={styles.noteActions}>
                      <Pressable onPress={() => acceptProposal(note.id)} hitSlop={8}>
                        <Text style={styles.linkAccent}>Accetta</Text>
                      </Pressable>
                      <Pressable onPress={() => declineProposal(note.id)} hitSlop={8}>
                        <Text style={styles.linkMuted}>Rifiuta</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              ))
            )}
            <View style={styles.sheetActions}>
              <Pressable
                onPress={() => selectedWord && openCompose(selectedWord, 'coaching')}
                hitSlop={8}
              >
                <Text style={styles.linkAccent}>Aggiungi annotazione</Text>
              </Pressable>
              <Pressable onPress={() => setSelectedWord(null)} hitSlop={8}>
                <Text style={styles.linkMuted}>Chiudi</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={compose != null}
        transparent
        animationType="fade"
        onRequestClose={() => setCompose(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setCompose(null)}>
          <Pressable style={styles.sheet} onPress={(event) => event.stopPropagation()}>
            <Text style={styles.sheetTitle}>
              {compose?.kind === 'proposal' ? 'Proponi un cambio' : 'Annota'} · {compose?.word.text}
            </Text>
            <Text style={styles.hint}>
              {compose?.kind === 'proposal'
                ? 'Scrivi perché e quale parola metteresti.'
                : 'Esempio: devi prendere fiato qua.'}
            </Text>
            <TextInput
              style={styles.input}
              value={composeBody}
              onChangeText={setComposeBody}
              placeholder="Il tuo consiglio"
              placeholderTextColor={colors.textMuted}
              multiline
              autoFocus
            />
            {compose?.kind === 'proposal' ? (
              <TextInput
                style={styles.input}
                value={composeSuggested}
                onChangeText={setComposeSuggested}
                placeholder="Nuova parola o frase"
                placeholderTextColor={colors.textMuted}
              />
            ) : null}
            <View style={styles.sheetActions}>
              <Pressable onPress={() => setCompose(null)} hitSlop={8}>
                <Text style={styles.linkMuted}>Annulla</Text>
              </Pressable>
              <Pressable onPress={saveCompose} hitSlop={8}>
                <Text style={styles.linkAccent}>Salva</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 120,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingVertical: 4,
    paddingHorizontal: 2,
    gap: 8,
  },
  line: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: 6,
    rowGap: 4,
  },
  blankLine: {
    height: 14,
  },
  wordHit: {
    paddingVertical: 2,
    paddingHorizontal: 2,
    borderRadius: 4,
  },
  word: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 22,
  },
  wordMarked: {
    backgroundColor: 'rgba(255,107,53,0.18)',
  },
  wordMarkedText: {
    color: colors.accent,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  wordSelected: {
    backgroundColor: 'rgba(255,107,53,0.32)',
  },
  editLink: {
    alignSelf: 'flex-start',
    paddingTop: 6,
  },
  empty: {
    flex: 1,
    minHeight: 120,
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 4,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  emptyBody: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  emptyButton: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: colors.accent,
  },
  emptyButtonLabel: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 13,
  },
  editor: {
    flex: 1,
    minHeight: 100,
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
    padding: 4,
  },
  editorActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 6,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  sheetTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  sheetEmpty: {
    color: colors.textMuted,
    fontSize: 14,
  },
  hint: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  input: {
    minHeight: 44,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  sheetActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  noteCard: {
    gap: 4,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  noteKind: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  noteBody: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 20,
  },
  noteSuggest: {
    color: colors.accent,
    fontSize: 13,
  },
  noteActions: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 4,
  },
  linkAccent: {
    color: colors.accent,
    fontWeight: '700',
    fontSize: 14,
  },
  linkMuted: {
    color: colors.textMuted,
    fontWeight: '600',
    fontSize: 14,
  },
});
