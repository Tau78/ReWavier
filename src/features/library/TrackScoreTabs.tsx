import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { optionalTrackText } from '../../domain/models';
import { useLibraryStore } from '../../store/libraryStore';
import { colors } from '../../theme/colors';
import { TrackOverviewWaveform } from './TrackOverviewWaveform';

type ScoreTab = 'onda' | 'testo' | 'accordi';

const TABS: { id: ScoreTab; label: string }[] = [
  { id: 'onda', label: 'Onda' },
  { id: 'testo', label: 'Testo' },
  { id: 'accordi', label: 'Accordi' },
];

const mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

function saveScore(trackId: string, lyrics: string, chords: string) {
  const store = useLibraryStore.getState();
  const track = store.getTrack(trackId);
  if (!track) {
    return;
  }
  const nextLyrics = optionalTrackText(lyrics);
  const nextChords = optionalTrackText(chords);
  if (optionalTrackText(track.lyrics) !== nextLyrics) {
    store.setTrackLyrics(trackId, nextLyrics);
  }
  if (optionalTrackText(track.chords) !== nextChords) {
    store.setTrackChords(trackId, nextChords);
  }
}

export function TrackScoreTabs({ trackId }: { trackId: string }) {
  const storedLyrics = useLibraryStore(
    (state) => state.tracks.find((track) => track.id === trackId)?.lyrics ?? '',
  );
  const storedChords = useLibraryStore(
    (state) => state.tracks.find((track) => track.id === trackId)?.chords ?? '',
  );
  const [tab, setTab] = useState<ScoreTab>('onda');
  const [lyricsDraft, setLyricsDraft] = useState(storedLyrics);
  const [chordsDraft, setChordsDraft] = useState(storedChords);
  const lyricsRef = useRef(lyricsDraft);
  const chordsRef = useRef(chordsDraft);
  lyricsRef.current = lyricsDraft;
  chordsRef.current = chordsDraft;

  useEffect(() => {
    setLyricsDraft(storedLyrics);
    setChordsDraft(storedChords);
  }, [trackId, storedLyrics, storedChords]);

  useEffect(() => {
    return () => {
      saveScore(trackId, lyricsRef.current, chordsRef.current);
    };
  }, [trackId]);

  const lyricsDirty = optionalTrackText(lyricsDraft) !== optionalTrackText(storedLyrics);
  const chordsDirty = optionalTrackText(chordsDraft) !== optionalTrackText(storedChords);

  const switchTab = (next: ScoreTab) => {
    if (next === tab) {
      return;
    }
    saveScore(trackId, lyricsRef.current, chordsRef.current);
    setTab(next);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.tabs}>
        {TABS.map((item) => {
          const on = tab === item.id;
          return (
            <Pressable
              key={item.id}
              onPress={() => switchTab(item.id)}
              style={[styles.tab, on && styles.tabOn]}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={item.label}
            >
              <Text style={[styles.tabLabel, on && styles.tabLabelOn]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {tab === 'onda' ? (
        <View style={styles.wave}>
          <TrackOverviewWaveform />
        </View>
      ) : null}

      {tab === 'testo' ? (
        <ScoreEditor
          value={lyricsDraft}
          onChangeText={setLyricsDraft}
          onBlur={() => saveScore(trackId, lyricsRef.current, chordsRef.current)}
          onSave={() => saveScore(trackId, lyricsRef.current, chordsRef.current)}
          dirty={lyricsDirty}
          placeholder="Scrivi il testo del brano."
          accessibilityLabel="Testo del brano"
        />
      ) : null}

      {tab === 'accordi' ? (
        <ScoreEditor
          value={chordsDraft}
          onChangeText={setChordsDraft}
          onBlur={() => saveScore(trackId, lyricsRef.current, chordsRef.current)}
          onSave={() => saveScore(trackId, lyricsRef.current, chordsRef.current)}
          dirty={chordsDirty}
          placeholder="Scrivi gli accordi, una riga per battuta."
          accessibilityLabel="Accordi del brano"
          chords
        />
      ) : null}
    </View>
  );
}

function ScoreEditor({
  value,
  onChangeText,
  onBlur,
  onSave,
  dirty,
  placeholder,
  accessibilityLabel,
  chords,
}: {
  value: string;
  onChangeText: (text: string) => void;
  onBlur: () => void;
  onSave: () => void;
  dirty: boolean;
  placeholder: string;
  accessibilityLabel: string;
  chords?: boolean;
}) {
  return (
    <View style={styles.editorCard}>
      <TextInput
        style={[styles.input, chords && styles.chordsInput]}
        value={value}
        onChangeText={onChangeText}
        onBlur={onBlur}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        multiline
        scrollEnabled
        textAlignVertical="top"
        selectionColor={colors.accent}
        autoCorrect={!chords}
        autoCapitalize={chords ? 'none' : 'sentences'}
        spellCheck={!chords}
        accessibilityLabel={accessibilityLabel}
      />
      {dirty ? (
        <Pressable
          onPress={onSave}
          style={styles.saveBtn}
          accessibilityRole="button"
          accessibilityLabel="Salva"
        >
          <Text style={styles.saveLabel}>Salva</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  tabs: {
    flexDirection: 'row',
    marginBottom: 8,
    padding: 3,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 11,
    alignItems: 'center',
  },
  tabOn: {
    backgroundColor: colors.accent,
  },
  tabLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  tabLabelOn: {
    color: colors.background,
  },
  wave: {
    paddingBottom: 0,
  },
  editorCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  input: {
    minHeight: 88,
    maxHeight: 160,
    color: colors.text,
    fontSize: 16,
    lineHeight: 22,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
  },
  chordsInput: {
    fontFamily: mono,
    fontSize: 15,
    lineHeight: 22,
  },
  saveBtn: {
    alignSelf: 'flex-end',
    marginHorizontal: 10,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: colors.accent,
  },
  saveLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
});
