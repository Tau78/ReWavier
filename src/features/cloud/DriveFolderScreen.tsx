import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  isDriveFolder,
  listDriveFolders,
  listFolderChildren,
  listSharedDriveEntries,
  type DriveFile,
  type SharedDriveEntry,
} from '../../cloud/driveApi';
import { importDriveFolder } from '../../cloud/syncEngine';
import { isAudioName } from '../../domain/audioFormats';
import { findTrackCoverFile, isAlbumCoverName, isImageName, isPdfName } from '../../domain/driveMedia';
import type { RootStackParamList } from '../../navigation/types';
import { colors, layout } from '../../theme/colors';
import { EmptyGraphic, KindRow } from '../../theme/graphics';

type Nav = NativeStackNavigationProp<RootStackParamList, 'DriveFolder'>;
type Route = RouteProp<RootStackParamList, 'DriveFolder'>;

type Crumb = { id: string; name: string };
type PickerTab = 'mine' | 'shared';

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export function DriveFolderScreen() {
  const navigation = useNavigation<Nav>();
  const albumId = useRoute<Route>().params?.albumId;
  const [tab, setTab] = useState<PickerTab>('mine');
  const [query, setQuery] = useState('');
  const [searchHits, setSearchHits] = useState<Array<DriveFile | SharedDriveEntry>>([]);
  const [stack, setStack] = useState<Crumb[]>([]);
  const [children, setChildren] = useState<DriveFile[]>([]);
  const [busy, setBusy] = useState(true);
  const [working, setWorking] = useState(false);

  const browsing = stack.length > 0;
  const current = stack[stack.length - 1];
  const subfolders = children.filter(isDriveFolder);
  const audios = children.filter((file) => isAudioName(file.name));
  const extras = children.filter((file) => isImageName(file.name) || isPdfName(file.name));

  const extraLabel = (file: DriveFile): string => {
    if (isPdfName(file.name)) {
      return 'Documento PDF';
    }
    if (isAlbumCoverName(file.name)) {
      return 'Copertina album';
    }
    if (audios.some((audio) => findTrackCoverFile(audio.name, [file]))) {
      return 'Copertina brano';
    }
    return 'Immagine';
  };

  const loadSearch = (needle?: string, which: PickerTab = tab) => {
    setBusy(true);
    const load = which === 'shared' ? listSharedDriveEntries(needle) : listDriveFolders(needle);
    void load
      .then(setSearchHits)
      .catch((error) => {
        Alert.alert('Drive', error instanceof Error ? error.message : 'Cartelle non disponibili');
      })
      .finally(() => setBusy(false));
  };

  const switchTab = (next: PickerTab) => {
    if (working || next === tab) {
      return;
    }
    setTab(next);
    setStack([]);
    setChildren([]);
    setQuery('');
    loadSearch('', next);
  };

  const openFolder = (folder: DriveFile) => {
    if (working) {
      return;
    }
    setBusy(true);
    setStack((prev) => [...prev, { id: folder.id, name: folder.name }]);
    void withTimeout(
      listFolderChildren(folder.id),
      25_000,
      'Drive ci ha messo troppo. Riprova.',
    )
      .then(setChildren)
      .catch((error) => {
        Alert.alert('Drive', error instanceof Error ? error.message : 'Cartella non aperta. Riprova.');
        setStack((prev) => prev.slice(0, -1));
        setChildren([]);
      })
      .finally(() => setBusy(false));
  };

  const goUp = () => {
    if (working) {
      return;
    }
    if (stack.length <= 1) {
      setStack([]);
      setChildren([]);
      return;
    }
    const next = stack.slice(0, -1);
    const parent = next[next.length - 1];
    setStack(next);
    setBusy(true);
    void withTimeout(listFolderChildren(parent.id), 25_000, 'Drive ci ha messo troppo. Riprova.')
      .then(setChildren)
      .catch((error) => {
        Alert.alert('Drive', error instanceof Error ? error.message : 'Cartella non aperta. Riprova.');
      })
      .finally(() => setBusy(false));
  };

  useEffect(() => {
    loadSearch();
  }, []);

  const choose = (recursive: boolean) => {
    if (!current || working) {
      return;
    }
    setWorking(true);
    void (async () => {
      try {
        const id = await importDriveFolder(current.id, current.name, { recursive, albumId });
        if (albumId) {
          navigation.goBack();
          return;
        }
        navigation.replace('Collection', { kind: 'album', id });
      } catch (error) {
        Alert.alert('Drive', error instanceof Error ? error.message : 'Import non riuscito');
      } finally {
        setWorking(false);
      }
    })();
  };

  const onScegli = () => {
    if (!current || working) {
      return;
    }
    const atRoot = stack.length === 1;
    if (atRoot && subfolders.length > 0) {
      Alert.alert(
        'Quali brani?',
        'Solo i file di questa cartella, o anche quelli nelle cartelle dentro?',
        [
          { text: 'Annulla', style: 'cancel' },
          { text: 'Solo questa', onPress: () => choose(false) },
          { text: 'Anche le cartelle dentro', onPress: () => choose(true) },
        ],
      );
      return;
    }
    choose(false);
  };

  const onBack = () => {
    if (browsing) {
      goUp();
      return;
    }
    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={layout.hitSlop} accessibilityRole="button" accessibilityLabel="Indietro">
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <View style={styles.headerText}>
          <KindRow label="Drive" />
          <Text style={styles.title} numberOfLines={1}>
            {current?.name ?? 'Cartella album'}
          </Text>
        </View>
        {browsing ? (
          <Pressable
            onPress={onScegli}
            disabled={working}
            hitSlop={layout.hitSlop}
            accessibilityRole="button"
            accessibilityLabel="Scegli questa cartella"
            style={({ pressed }) => [styles.chooseBtn, pressed && styles.pressed, working && styles.chooseOff]}
          >
            <Text style={styles.chooseLabel}>Scegli</Text>
          </Pressable>
        ) : (
          <View style={styles.chooseSpacer} />
        )}
      </View>
      {browsing ? null : (
        <View style={styles.tabs}>
          <Pressable
            onPress={() => switchTab('mine')}
            style={[styles.tab, tab === 'mine' && styles.tabOn]}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === 'mine' }}
            accessibilityLabel="Il mio Drive"
          >
            <Text style={[styles.tabLabel, tab === 'mine' && styles.tabLabelOn]}>Il mio Drive</Text>
          </Pressable>
          <Pressable
            onPress={() => switchTab('shared')}
            style={[styles.tab, tab === 'shared' && styles.tabOn]}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === 'shared' }}
            accessibilityLabel="Drive Condivisi"
          >
            <Text style={[styles.tabLabel, tab === 'shared' && styles.tabLabelOn]}>Drive Condivisi</Text>
          </Pressable>
        </View>
      )}
      <Text style={styles.hint}>
        {browsing
          ? 'Tocca Scegli per portare i brani. Una foto con lo stesso nome del brano ne è la copertina (anche GIF). cover.jpg è la copertina dell’album. I PDF finiscono in Documenti.'
          : tab === 'shared'
            ? 'Qui ci sono i Drive della band o della scuola, e le cartelle che ti hanno condiviso. Aprine una, poi tocca Scegli.'
            : 'Cartelle sul tuo Drive. Aprine una per vedere cosa c’è dentro, poi tocca Scegli.'}
      </Text>
      {browsing ? null : (
        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => loadSearch(query)}
          placeholder={tab === 'shared' ? 'Cerca un Drive o una cartella…' : 'Cerca cartella…'}
          placeholderTextColor={colors.textMuted}
          returnKeyType="search"
        />
      )}
      {busy ? <ActivityIndicator color={colors.accent} style={styles.spinner} /> : null}
      {working ? (
        <Text style={styles.working}>Carico brani, copertine e documenti da Drive…</Text>
      ) : null}
      {busy ? null : (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {!browsing && searchHits.length === 0 ? (
            <View style={styles.emptyBox}>
              <EmptyGraphic />
              <Text style={styles.empty}>
                {tab === 'shared'
                  ? 'Nessun Drive condiviso. Se la band o la scuola ne ha uno, chiedi di esserci dentro.'
                  : 'Nessuna cartella. Accedi con Google e crea o scegli una cartella sul tuo Drive.'}
              </Text>
            </View>
          ) : null}
          {browsing && subfolders.length === 0 && audios.length === 0 && extras.length === 0 ? (
            <View style={styles.emptyBox}>
              <EmptyGraphic />
              <Text style={styles.empty}>Questa cartella è vuota. Tocca Scegli se è quella giusta, o torna indietro.</Text>
            </View>
          ) : null}

          {(browsing ? subfolders : searchHits).map((folder) => (
            <Pressable
              key={folder.id}
              onPress={() => openFolder(folder)}
              disabled={working}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={`Apri cartella ${folder.name}`}
            >
              <Text style={styles.rowTitle}>{folder.name}</Text>
              <Text style={styles.rowMeta}>
                {browsing
                  ? 'Apri'
                  : 'sharedKind' in folder && folder.sharedKind === 'shared-drive'
                    ? 'Drive condiviso · tocca per aprire'
                    : 'sharedKind' in folder && folder.sharedKind === 'shared-folder'
                      ? 'Condivisa con te · tocca per aprire'
                      : 'Cartella Drive · tocca per aprire'}
              </Text>
            </Pressable>
          ))}

          {browsing
            ? audios.map((file) => (
                <View key={file.id} style={styles.fileRow}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {file.name}
                  </Text>
                  <Text style={styles.rowMeta}>Audio</Text>
                </View>
              ))
            : null}
          {browsing
            ? extras.map((file) => (
                <View key={file.id} style={styles.fileRow}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {file.name}
                  </Text>
                  <Text style={styles.rowMeta}>{extraLabel(file)}</Text>
                </View>
              ))
            : null}
        </ScrollView>
      )}
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
  headerText: { flex: 1, minWidth: 0 },
  back: { color: colors.textMuted, fontSize: 34, lineHeight: 36, width: 28, marginTop: -4 },
  title: { color: colors.text, fontSize: 22, fontWeight: '700' },
  chooseBtn: {
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: colors.accent,
  },
  chooseOff: { opacity: 0.5 },
  chooseLabel: { color: colors.text, fontSize: 15, fontWeight: '700' },
  chooseSpacer: { width: 28 },
  tabs: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 3,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
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
    color: colors.text,
  },
  hint: {
    paddingHorizontal: 20,
    marginBottom: 10,
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  search: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    color: colors.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  spinner: { marginTop: 24 },
  working: {
    paddingHorizontal: 20,
    marginBottom: 8,
    color: colors.accent,
    fontSize: 14,
    fontWeight: '600',
  },
  scroll: { paddingHorizontal: 16, paddingBottom: 32 },
  emptyBox: { alignItems: 'center', paddingVertical: 20 },
  empty: { color: colors.textMuted, fontSize: 14, paddingHorizontal: 16, textAlign: 'center' },
  row: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 8,
  },
  fileRow: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 8,
    opacity: 0.9,
  },
  rowTitle: { color: colors.text, fontSize: 16, fontWeight: '600' },
  rowMeta: { marginTop: 4, color: colors.textMuted, fontSize: 12 },
  pressed: { opacity: 0.7 },
});
