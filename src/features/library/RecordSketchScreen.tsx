import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Audio } from 'expo-av';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ensurePeaks } from '../../audio/extractPeaks';
import { pushTrackToSharedAlbum } from '../../cloud/syncEngine';
import { createId } from '../../domain/library';
import { formatTimecode } from '../../domain/models';
import { copyToDownloads } from '../../files/downloads';
import type { RootStackParamList } from '../../navigation/types';
import { useLibraryStore } from '../../store/libraryStore';
import { useSessionStore } from '../../store/sessionStore';
import { colors, layout } from '../../theme/colors';
import { KindRow } from '../../theme/graphics';
import { PromptModal } from './PromptModal';

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

export function RecordSketchScreen() {
  const navigation = useNavigation<Nav>();
  const { folderId, albumId } = useRoute<Route>().params ?? {};
  const folders = useLibraryStore((s) => s.folders);
  const albums = useLibraryStore((s) => s.albums);
  const displayName = useSessionStore((s) => s.user?.displayName) ?? 'Bozza';

  const recordingRef = useRef<Audio.Recording | null>(null);
  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [uri, setUri] = useState<string | null>(null);
  const [title, setTitle] = useState(defaultTitle);
  const [destFolderId, setDestFolderId] = useState<string | null>(folderId ?? null);
  const [destAlbumId, setDestAlbumId] = useState<string | undefined>(albumId);
  const [saving, setSaving] = useState(false);
  const [namingFolder, setNamingFolder] = useState(false);
  const discardOk = useRef(false);
  const destAlbum = albums.find((album) => album.id === destAlbumId);
  const sharedDrive = destAlbum?.origin === 'drive' && Boolean(destAlbum.driveFolderId);

  useEffect(() => {
    return () => {
      const active = recordingRef.current;
      if (active) {
        void active.stopAndUnloadAsync().catch(() => undefined);
      }
      void Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
      });
    };
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

  const start = async () => {
    const permission = await Audio.requestPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Microfono', 'Per registrare una bozza serve il permesso microfono.');
      return;
    }
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
    });
    const created = await Audio.Recording.createAsync(
      Audio.RecordingOptionsPresets.HIGH_QUALITY,
      (status) => {
        if (status.isRecording) {
          setElapsedMs(status.durationMillis ?? 0);
        }
      },
      200,
    );
    recordingRef.current = created.recording;
    setRecording(true);
    setUri(null);
    setElapsedMs(0);
  };

  const stop = async () => {
    const active = recordingRef.current;
    recordingRef.current = null;
    setRecording(false);
    if (!active) {
      return;
    }
    try {
      await active.stopAndUnloadAsync();
      setUri(active.getURI());
      const status = await active.getStatusAsync();
      if (status.durationMillis) {
        setElapsedMs(status.durationMillis);
      }
    } catch (error) {
      Alert.alert('Registrazione', error instanceof Error ? error.message : 'Stop fallito');
    }
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
    });
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
            markers: [],
          },
        ],
        { folderId: destFolderId, albumId: destAlbumId },
      );
      await useLibraryStore.getState().downloadTrack(id).catch(() => undefined);
      const track = useLibraryStore.getState().getTrack(id);
      if (track) {
        await ensurePeaks(track).catch(() => undefined);
      }
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
      discardOk.current = true;
      navigation.goBack();
    } catch (error) {
      Alert.alert('Salvataggio', error instanceof Error ? error.message : 'Non riesco a salvare la bozza');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
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
        Idea, riff o melodia al volo. Dopo il salvataggio è una traccia come le altre:
        waveform, marker e Drive se l’album è condiviso.
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

      {uri ? (
        <>
          <ScrollView
            style={styles.formScroll}
            contentContainerStyle={styles.form}
            keyboardShouldPersistTaps="handled"
          >
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
          </ScrollView>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
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
  formScroll: { flex: 1, marginTop: 16 },
  form: { paddingHorizontal: 16, paddingBottom: 16 },
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
