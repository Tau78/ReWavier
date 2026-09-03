import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  InputAccessoryView,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';

import { isScreenCaptured, shouldExplainScreenMicConflict } from '../../../modules/screen-captured';
import { ensurePeaks } from '../../audio/extractPeaks';
import { applyPlaybackAudioMode } from '../../audio/fileEngine';
import { pushTrackToSharedAlbum } from '../../cloud/syncEngine';
import { createId } from '../../domain/library';
import { stampNewMarker } from '../../domain/markers';
import { formatTimecode } from '../../domain/models';
import { copyToDownloads } from '../../files/downloads';
import type { RootStackParamList } from '../../navigation/types';
import { useLibraryStore } from '../../store/libraryStore';
import { releaseAudioForRecording } from '../../store/playerStore';
import { useSessionStore } from '../../store/sessionStore';
import { colors, layout } from '../../theme/colors';
import { KindRow } from '../../theme/graphics';
import { PromptModal } from './PromptModal';

const NOTE_ACCESSORY_ID = 'rewavier-sketch-note-accessory';

function sketchFileName(title: string): { title: string; fileName: string } {
  const trimmed = title.trim() || defaultTitle();
  const withoutExt = trimmed.replace(/\.m4a$/i, '').replace(/[/\\?%*:|"<>]/g, '-');
  return { title: withoutExt, fileName: `${withoutExt}.m4a` };
}

type Nav = NativeStackNavigationProp<RootStackParamList, 'RecordSketch'>;
type Route = RouteProp<RootStackParamList, 'RecordSketch'>;

function defaultTitle(): string {
  const now = new Date();
  const day = now.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
  const time = now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  return `Bozza ${day} ${time}`;
}

function friendlyRecordError(error: unknown): string {
  const raw = error instanceof Error ? error.message : '';
  if (/not prepared|prepare/i.test(raw)) {
    return 'Il microfono non è pronto. Chiudi altre app che usano l’audio e riprova.';
  }
  return raw || 'Riprova';
}

function safeRecorderUri(recorder: {
  uri: string | null;
  getStatus: () => { url?: string | null; durationMillis?: number };
}): { uri: string | null; durationMillis: number } {
  try {
    const status = recorder.getStatus();
    return {
      uri: recorder.uri ?? status.url ?? null,
      durationMillis: status.durationMillis ?? 0,
    };
  } catch {
    try {
      return { uri: recorder.uri ?? null, durationMillis: 0 };
    } catch {
      return { uri: null, durationMillis: 0 };
    }
  }
}

export function RecordSketchScreen() {
  const navigation = useNavigation<Nav>();
  const { folderId, albumId } = useRoute<Route>().params ?? {};
  const folders = useLibraryStore((s) => s.folders);
  const albums = useLibraryStore((s) => s.albums);
  const user = useSessionStore((s) => s.user);
  const displayName = user?.displayName ?? 'Bozza';

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [uri, setUri] = useState<string | null>(null);
  const [title, setTitle] = useState(defaultTitle);
  const [destFolderId, setDestFolderId] = useState<string | null>(folderId ?? null);
  const [destAlbumId, setDestAlbumId] = useState<string | undefined>(albumId);
  const [saving, setSaving] = useState(false);
  const [namingFolder, setNamingFolder] = useState(false);
  const [liveNotes, setLiveNotes] = useState<{ id: string; timestampMs: number; text: string }[]>([]);
  const [draft, setDraft] = useState<{ id: string; timestampMs: number; text: string } | null>(null);
  const discardOk = useRef(false);
  const disposedRef = useRef(false);
  const notesRef = useRef(liveNotes);
  notesRef.current = liveNotes;
  const destAlbum = albums.find((album) => album.id === destAlbumId);
  const sharedDrive = destAlbum?.origin === 'drive' && Boolean(destAlbum.driveFolderId);

  // Poll only while recording; never touch a released SharedObject without try/catch.
  useEffect(() => {
    if (!recording) {
      return;
    }
    const tick = () => {
      if (disposedRef.current) {
        return;
      }
      try {
        const status = recorder.getStatus();
        if (status.isRecording) {
          setElapsedMs(status.durationMillis);
        }
      } catch {
        // Recorder may already be stopped or released.
      }
    };
    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [recording, recorder]);

  useEffect(() => {
    return () => {
      disposedRef.current = true;
      try {
        if (recorder.isRecording) {
          void recorder.stop().catch(() => undefined);
        }
      } catch {
        // Already released after navigation — do not throw into the error boundary.
      }
      void applyPlaybackAudioMode().catch(() => undefined);
    };
    // recorder identity is stable for the screen lifetime
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return navigation.addListener('beforeRemove', (event) => {
      if (discardOk.current) {
        return;
      }
      if (saving) {
        event.preventDefault();
        return;
      }
      if (!uri && !recording) {
        return;
      }
      event.preventDefault();
      Alert.alert(
        'Tornare in libreria?',
        'La registrazione non è salvata. Se esci, la perdi.',
        [
          { text: 'Resta qui', style: 'cancel' },
          {
            text: 'Scarta e esci',
            style: 'destructive',
            onPress: () => {
              discardOk.current = true;
              navigation.dispatch(event.data.action);
            },
          },
        ],
      );
    });
  }, [navigation, uri, recording, saving]);

  const commitDraft = () => {
    if (!draft?.text.trim()) {
      setDraft(null);
      return notesRef.current;
    }
    const next = [...notesRef.current, { ...draft, text: draft.text.trim() }].sort(
      (left, right) => left.timestampMs - right.timestampMs,
    );
    notesRef.current = next;
    setLiveNotes(next);
    setDraft(null);
    return next;
  };

  const startNote = () => {
    commitDraft();
    setDraft({
      id: createId('mark'),
      timestampMs: elapsedMs,
      text: '',
    });
  };

  const start = async () => {
    try {
      await releaseAudioForRecording();
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Microfono', 'Per registrare una bozza serve il permesso microfono.');
        return;
      }
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        shouldPlayInBackground: false,
        interruptionMode: 'doNotMix',
      });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecording(true);
      setUri(null);
      setElapsedMs(0);
    } catch (error) {
      setRecording(false);
      if (shouldExplainScreenMicConflict(isScreenCaptured(), true)) {
        Alert.alert(
          'Microfono occupato',
          'Stai registrando lo schermo con l’audio. iPhone tiene il microfono, quindi la bozza in app non parte. Spegni il microfono della registrazione schermo, poi riprova.',
        );
        return;
      }
      Alert.alert('Registrazione', friendlyRecordError(error));
    }
  };

  const stop = async () => {
    setRecording(false);
    commitDraft();
    try {
      try {
        if (recorder.isRecording) {
          await recorder.stop();
        }
      } catch (error) {
        Alert.alert('Registrazione', friendlyRecordError(error));
      }
      const next = safeRecorderUri(recorder);
      if (next.uri) {
        setUri(next.uri);
      }
      if (next.durationMillis > 0) {
        setElapsedMs(next.durationMillis);
      }
    } finally {
      await applyPlaybackAudioMode().catch(() => undefined);
    }
  };

  const save = async () => {
    if (!uri || saving) {
      return;
    }
    const named = sketchFileName(title);
    if (!named.title) {
      Alert.alert('Nome', 'Dai un nome alla bozza prima di salvarla.');
      return;
    }
    setSaving(true);
    try {
      const id = createId('track');
      const fileUri = await copyToDownloads(uri, id, named.fileName);
      useLibraryStore.getState().importBundles(
        [
          {
            track: {
              id,
              title: named.title,
              artist: displayName,
              durationMs: elapsedMs,
              fileUri,
              sourceFileName: named.fileName,
              downloaded: true,
              downloadedAt: Date.now(),
            },
            markers: notesRef.current.map((note) =>
              stampNewMarker(
                {
                  id: note.id,
                  timestampMs: note.timestampMs,
                  text: note.text,
                  createdAt: Date.now(),
                  updatedAt: Date.now(),
                },
                user,
              ),
            ),
          },
        ],
        { folderId: destFolderId, albumId: destAlbumId },
      );
      await useLibraryStore.getState().downloadTrack(id).catch(() => undefined);
      if (destAlbumId) {
        try {
          await pushTrackToSharedAlbum(id, destAlbumId);
        } catch (error) {
          Alert.alert(
            'Cloud',
            error instanceof Error
              ? `${error.message} La bozza è comunque in libreria.`
              : 'La bozza è in libreria, ma non è andata su Drive.',
          );
        }
      }
      const noteCount = notesRef.current.length;
      discardOk.current = true;
      disposedRef.current = true;
      // Leave this screen before waveform work / SharedObject teardown races.
      if (noteCount > 0) {
        navigation.replace('NoteHeat', { trackId: id });
      } else {
        navigation.goBack();
      }
      const track = useLibraryStore.getState().getTrack(id);
      if (track) {
        void ensurePeaks(track).catch(() => undefined);
      }
    } catch (error) {
      Alert.alert('Salvataggio', error instanceof Error ? error.message : 'Non riesco a salvare la bozza');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={layout.hitSlop}
          accessibilityRole="button"
          accessibilityLabel="Libreria"
        >
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <View>
          <KindRow label="Microfono" />
          <Text style={styles.title}>Bozza</Text>
        </View>
      </View>
      <Text style={styles.hint}>
        Idea, riff o melodia al volo. Mentre registri, tocca + per un appunto su quel
        momento: il microfono non si ferma.
      </Text>

      <View style={styles.nameBox}>
        <Text style={styles.label}>Nome</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="Nome della bozza"
          placeholderTextColor={colors.textMuted}
          editable={!recording}
        />
      </View>

      <Text style={styles.timer}>{formatTimecode(elapsedMs)}</Text>
      <Pressable
        onPress={() => {
          void (recording ? stop() : start());
        }}
        style={[styles.rec, recording && styles.recOn]}
      >
        <Text style={styles.recLabel}>{recording ? 'Stop' : uri ? 'Riregistra' : 'Registra'}</Text>
      </Pressable>

      {recording ? (
        <Pressable
          onPress={startNote}
          style={styles.addNote}
          accessibilityRole="button"
          accessibilityLabel="Aggiungi appunto"
          accessibilityHint="Lascia un appunto su questo momento. La registrazione continua."
        >
          <Text style={styles.addNotePlus}>+</Text>
          <Text style={styles.addNoteLabel}>Appunto su questo momento</Text>
        </Pressable>
      ) : null}

      {draft ? (
        <View style={styles.draftBox}>
          <View style={styles.draftHeader}>
            <Text style={styles.draftTime}>{formatTimecode(draft.timestampMs)}</Text>
            <View style={styles.draftActions}>
              <Pressable onPress={() => setDraft(null)} hitSlop={layout.hitSlop}>
                <Text style={styles.draftCancel}>Annulla</Text>
              </Pressable>
              <Pressable
                onPress={commitDraft}
                disabled={draft.text.trim().length === 0}
                style={[styles.draftSave, draft.text.trim().length === 0 && styles.saveOff]}
                accessibilityRole="button"
                accessibilityLabel="Salva appunto"
              >
                <Text style={styles.draftSaveLabel}>Salva</Text>
              </Pressable>
            </View>
          </View>
          <TextInput
            style={styles.draftInput}
            value={draft.text}
            onChangeText={(text) => setDraft({ ...draft, text })}
            placeholder="Scrivi l’appunto…"
            placeholderTextColor={colors.textMuted}
            autoFocus
            multiline
            selectionColor={colors.accent}
            inputAccessoryViewID={Platform.OS === 'ios' ? NOTE_ACCESSORY_ID : undefined}
          />
        </View>
      ) : null}

      {liveNotes.length > 0 ? (
        <View style={styles.notesList}>
          {liveNotes.map((note) => (
            <View key={note.id} style={styles.noteRow}>
              <Text style={styles.noteTime}>{formatTimecode(note.timestampMs)}</Text>
              <Text style={styles.noteText}>{note.text}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {uri ? (
        <>
          <View style={styles.form}>
            <Text style={styles.label}>Dove la salvo</Text>
            <Pressable
              onPress={() => {
                setDestFolderId(null);
                setDestAlbumId(undefined);
              }}
              style={[styles.dest, !destFolderId && !destAlbumId && styles.destOn]}
            >
              <Text style={styles.destName}>Tutte le tracce</Text>
              <Text style={styles.destMeta}>Senza cartella</Text>
            </Pressable>
            {folders.map((folder) => (
              <Pressable
                key={folder.id}
                onPress={() => {
                  setDestFolderId(folder.id);
                  setDestAlbumId(undefined);
                }}
                style={[styles.dest, destFolderId === folder.id && styles.destOn]}
              >
                <Text style={styles.destName}>{folder.name}</Text>
                <Text style={styles.destMeta}>Cartella</Text>
              </Pressable>
            ))}
            <Pressable onPress={() => setNamingFolder(true)} style={styles.dest}>
              <Text style={styles.addFolder}>＋ Nuova cartella</Text>
              <Text style={styles.destMeta}>Crea e salva qui</Text>
            </Pressable>
            {albums.map((album) => (
              <Pressable
                key={album.id}
                onPress={() => {
                  setDestFolderId(null);
                  setDestAlbumId(album.id);
                }}
                style={[styles.dest, destAlbumId === album.id && styles.destOn]}
              >
                <Text style={styles.destName}>{album.name}</Text>
                <Text style={styles.destMeta}>Album</Text>
              </Pressable>
            ))}
            {sharedDrive ? (
              <Text style={styles.locked}>Carico anche sulla cartella Drive di questo album.</Text>
            ) : null}
          </View>
          <Pressable
            onPress={() => void save()}
            disabled={saving}
            style={[styles.save, saving && styles.saveOff]}
          >
            <Text style={styles.saveLabel}>{saving ? 'Salvo…' : 'Salva'}</Text>
          </Pressable>
          <PromptModal
            visible={namingFolder}
            title="Nuova cartella"
            placeholder="Nome cartella"
            confirmLabel="Crea"
            onCancel={() => setNamingFolder(false)}
            onSubmit={(name) => {
              const id = useLibraryStore.getState().createFolder(name, null);
              setDestFolderId(id);
              setDestAlbumId(undefined);
              setNamingFolder(false);
            }}
          />
        </>
      ) : null}
      </ScrollView>
      </KeyboardAvoidingView>
      {Platform.OS === 'ios' ? (
        <InputAccessoryView nativeID={NOTE_ACCESSORY_ID}>
          <View style={styles.accessoryBar}>
            <Pressable
              onPress={() => setDraft(null)}
              hitSlop={layout.hitSlop}
              accessibilityRole="button"
              accessibilityLabel="Annulla appunto"
            >
              <Text style={styles.draftCancel}>Annulla</Text>
            </Pressable>
            <Pressable
              onPress={commitDraft}
              disabled={!draft || draft.text.trim().length === 0}
              style={[
                styles.draftSave,
                (!draft || draft.text.trim().length === 0) && styles.saveOff,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Salva appunto"
            >
              <Text style={styles.draftSaveLabel}>Salva</Text>
            </Pressable>
          </View>
        </InputAccessoryView>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  scrollContent: { paddingBottom: 28, flexGrow: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 8,
    gap: 4,
  },
  back: { color: colors.textMuted, fontSize: 34, lineHeight: 36, width: 28, marginTop: -4 },
  title: { color: colors.text, fontSize: 22, fontWeight: '700' },
  hint: {
    paddingHorizontal: 20,
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  nameBox: { paddingHorizontal: 16, paddingTop: 16 },
  timer: {
    marginTop: 28,
    textAlign: 'center',
    color: colors.text,
    fontSize: 36,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  rec: {
    alignSelf: 'center',
    marginTop: 20,
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recOn: { backgroundColor: colors.danger },
  recLabel: { color: colors.text, fontSize: 14, fontWeight: '800' },
  addNote: {
    alignSelf: 'center',
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.accent,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  addNotePlus: {
    color: colors.accent,
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 30,
    marginTop: -2,
  },
  addNoteLabel: { color: colors.text, fontSize: 15, fontWeight: '700' },
  draftBox: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 14,
  },
  draftHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  draftTime: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  draftInput: {
    marginTop: 10,
    minHeight: 64,
    color: colors.text,
    fontSize: 16,
    lineHeight: 22,
  },
  draftActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  draftCancel: { color: colors.textMuted, fontSize: 16, fontWeight: '500' },
  draftSave: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  draftSaveLabel: { color: colors.text, fontSize: 16, fontWeight: '700' },
  accessoryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  notesList: { marginTop: 12, paddingHorizontal: 16 },
  noteRow: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  noteTime: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  noteText: { marginTop: 4, color: colors.text, fontSize: 15, lineHeight: 20 },
  form: { paddingHorizontal: 16, paddingBottom: 16, marginTop: 16 },
  addFolder: { color: colors.accent, fontSize: 16, fontWeight: '700' },
  label: {
    marginTop: 8,
    marginBottom: 8,
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  input: {
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    color: colors.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 8,
  },
  dest: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
  },
  destOn: { borderColor: colors.accent },
  destName: { color: colors.text, fontSize: 16, fontWeight: '600' },
  destMeta: { marginTop: 2, color: colors.textMuted, fontSize: 12 },
  locked: { color: colors.textMuted, fontSize: 14, lineHeight: 20, marginBottom: 12 },
  save: {
    marginHorizontal: 16,
    marginBottom: 20,
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveOff: { opacity: 0.5 },
  saveLabel: { color: colors.text, fontSize: 16, fontWeight: '700' },
});
