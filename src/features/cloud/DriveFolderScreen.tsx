import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  isDriveFolder,
  listDriveFolders,
  listFolderChildren,
  listSharedDriveEntries,
  rememberSharedDriveFromFolder,
  type DriveFile,
  type SharedDriveEntry,
} from '../../cloud/driveApi';
import { fetchGoogleDriveEmail, getValidGoogleAccessToken } from '../../auth/googleToken';
import { pinsFromAlbums, rememberSharedDrives } from '../../cloud/sharedDriveCatalog';
import { type SharedDrivePickResult } from '../../cloud/drivePicker';
import { importDriveFolder } from '../../cloud/syncEngine';
import { SharedDrivePickerWebView } from './SharedDrivePickerWebView';
import { isDriveAudio } from '../../domain/audioFormats';
import { isDownloadPausedError } from '../../domain/collectionDownloadVisual';
import { formatDownloadPercent } from '../../domain/downloadProgress';
import { findTrackCoverFile, isAlbumCoverName, isImageName, isPdfName } from '../../domain/driveMedia';
import type { RootStackParamList } from '../../navigation/types';
import { useDownloadProgressStore } from '../../store/downloadProgressStore';
import { useLibraryStore } from '../../store/libraryStore';
import { colors, layout } from '../../theme/colors';
import { EmptyGraphic, KindRow } from '../../theme/graphics';

type Nav = NativeStackNavigationProp<RootStackParamList, 'DriveFolder'>;
type Route = RouteProp<RootStackParamList, 'DriveFolder'>;

type Crumb = { id: string; name: string; sharedDriveId?: string };
type PickerTab = 'mine' | 'shared';
type SearchHit = DriveFile | SharedDriveEntry;

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

function filterHits(items: SearchHit[], needle: string): SearchHit[] {
  const q = needle.trim().toLowerCase();
  if (!q) {
    return items;
  }
  return items.filter((item) => item.name.toLowerCase().includes(q));
}

export function DriveFolderScreen() {
  const navigation = useNavigation<Nav>();
  const albumId = useRoute<Route>().params?.albumId;
  const [tab, setTab] = useState<PickerTab>('mine');
  const [query, setQuery] = useState('');
  const [searchHits, setSearchHits] = useState<SearchHit[]>([]);
  const [stack, setStack] = useState<Crumb[]>([]);
  const [children, setChildren] = useState<DriveFile[]>([]);
  const [busy, setBusy] = useState(true);
  const [working, setWorking] = useState(false);
  const [pickerToken, setPickerToken] = useState<string | null>(null);
  const [pickerFailed, setPickerFailed] = useState(false);
  const [googleEmail, setGoogleEmail] = useState<string | null>(null);
  const downloadPercent = useDownloadProgressStore((s) => s.percent);
  const downloadActive = useDownloadProgressStore((s) => s.active);
  const catalogRef = useRef<SearchHit[]>([]);
  const searchGen = useRef(0);
  const tabRef = useRef(tab);
  tabRef.current = tab;
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const browsing = stack.length > 0;
  const current = stack[stack.length - 1];
  const subfolders = children.filter(isDriveFolder);
  const audios = children.filter((file) => isDriveAudio(file));
  const extras = children.filter((file) => isImageName(file.name) || isPdfName(file.name));

  useEffect(() => {
    if (tab !== 'shared' || browsing) {
      return;
    }
    void getValidGoogleAccessToken()
      .then((token) => {
        if (mountedRef.current) {
          setPickerToken(token);
        }
      })
      .catch(() => {
        if (mountedRef.current) {
          setPickerToken(null);
        }
      });
    void fetchGoogleDriveEmail()
      .then((email) => {
        if (mountedRef.current) {
          setGoogleEmail(email);
        }
      })
      .catch(() => {
        if (mountedRef.current) {
          setGoogleEmail(null);
        }
      });
  }, [tab, browsing]);

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

  const loadSearch = (needle?: string, which: PickerTab = tab, opts?: { silent?: boolean }) => {
    const trimmed = needle?.trim() ?? '';
    const gen = ++searchGen.current;
    if (!opts?.silent) {
      setBusy(true);
    }
    const load =
      which === 'shared'
        ? listSharedDriveEntries(trimmed || undefined, {
            knownDrives: pinsFromAlbums(useLibraryStore.getState().albums),
          })
        : listDriveFolders(trimmed || undefined);
    void load
      .then((hits) => {
        if (gen !== searchGen.current || which !== tabRef.current) {
          return;
        }
        if (!trimmed) {
          catalogRef.current = hits;
        }
        setSearchHits(hits);
      })
      .catch((error) => {
        if (gen !== searchGen.current) {
          return;
        }
        Alert.alert('Drive', error instanceof Error ? error.message : 'Cartelle non disponibili');
      })
      .finally(() => {
        if (gen === searchGen.current) {
          setBusy(false);
        }
      });
  };

  const onSearchChange = (text: string) => {
    setQuery(text);
    // Mostra subito i match sulla lista già caricata; la rete raffina dopo.
    setSearchHits(filterHits(catalogRef.current, text));
  };

  const switchTab = (next: PickerTab) => {
    if (working || next === tab) {
      return;
    }
    setTab(next);
    setStack([]);
    setChildren([]);
    setQuery('');
    catalogRef.current = [];
    setSearchHits([]);
    setPickerFailed(false);
  };

  const applyPickResult = async (result: SharedDrivePickResult) => {
    if (result.drives.length > 0) {
      await rememberSharedDrives(result.drives);
    }
    for (const folder of result.folders) {
      await rememberSharedDriveFromFolder({
        ...folder,
        sharedKind: folder.driveId && folder.driveId === folder.id ? 'shared-drive' : 'shared-folder',
      });
    }
    if (!mountedRef.current) {
      return;
    }
    if (result.folders.length === 1 && result.drives.length <= 1) {
      const folder = result.folders[0];
      const entry: SharedDriveEntry = {
        ...folder,
        sharedKind: folder.driveId && folder.driveId === folder.id ? 'shared-drive' : 'shared-folder',
      };
      openFolder(entry);
      return;
    }
    if (result.drives.length === 1 && result.folders.length === 0) {
      const drive = result.drives[0];
      openFolder({
        id: drive.id,
        name: drive.name,
        mimeType: 'application/vnd.google-apps.folder',
        driveId: drive.id,
        sharedKind: 'shared-drive',
      });
      return;
    }
    setBusy(false);
    loadSearch('', 'shared');
  };

  const openFolder = (folder: DriveFile | SharedDriveEntry) => {
    if (working) {
      return;
    }
    const sharedDriveId =
      ('sharedKind' in folder && folder.sharedKind === 'shared-drive'
        ? folder.id
        : undefined) ??
      folder.driveId ??
      stack[0]?.sharedDriveId;
    if (folder.driveId || ('sharedKind' in folder && folder.sharedKind === 'shared-drive')) {
      void rememberSharedDriveFromFolder(
        'sharedKind' in folder ? folder : { ...folder, sharedKind: 'shared-folder' },
      );
    }
    setBusy(true);
    setStack((prev) => [...prev, { id: folder.id, name: folder.name, sharedDriveId }]);
    void withTimeout(
      listFolderChildren(folder.id, sharedDriveId ? { sharedDriveId } : undefined),
      25_000,
      'Drive ci ha messo troppo. Riprova.',
    )
      .then((result) => setChildren(result.files))
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
    void withTimeout(
      listFolderChildren(
        parent.id,
        parent.sharedDriveId ? { sharedDriveId: parent.sharedDriveId } : undefined,
      ),
      25_000,
      'Drive ci ha messo troppo. Riprova.',
    )
      .then((result) => setChildren(result.files))
      .catch((error) => {
        Alert.alert('Drive', error instanceof Error ? error.message : 'Cartella non aperta. Riprova.');
      })
      .finally(() => setBusy(false));
  };

  useEffect(() => {
    if (browsing) {
      return;
    }
    const trimmed = query.trim();
    const delay = trimmed ? 280 : 0;
    const timer = setTimeout(() => {
      loadSearch(trimmed, tab, {
        // Non nascondere la lista mentre raffini: i match locali restano visibili.
        silent: catalogRef.current.length > 0,
      });
    }, delay);
    return () => clearTimeout(timer);
  }, [query, tab, browsing]);

  const choose = (recursive: boolean) => {
    if (!current || working) {
      return;
    }
    setWorking(true);
    void (async () => {
      try {
        const id = await importDriveFolder(current.id, current.name, {
          recursive,
          albumId,
          sharedDriveId: current.sharedDriveId,
        });
        if (!mountedRef.current) {
          return;
        }
        if (albumId) {
          navigation.goBack();
          return;
        }
        navigation.replace('Collection', { kind: 'album', id });
      } catch (error) {
        if (!mountedRef.current) {
          return;
        }
        if (isDownloadPausedError(error)) {
          return;
        }
        const raw = error instanceof Error ? error.message : '';
        const technical =
          /file:\/\/|%25|downloadAsync|does not exist|\/Users\/|Containers\//i.test(raw);
        Alert.alert(
          'Drive',
          raw && !technical ? raw : 'Questo brano non è arrivato sul telefono. Riprova.',
        );
      } finally {
        if (mountedRef.current) {
          setWorking(false);
        }
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

  const onCancelDownload = () => {
    useDownloadProgressStore.getState().requestPause();
  };

  const onBack = () => {
    if (browsing) {
      goUp();
      return;
    }
    navigation.goBack();
  };

  const showEmbeddedPicker =
    Platform.OS === 'android' &&
    !busy &&
    !browsing &&
    tab === 'shared' &&
    searchHits.length === 0 &&
    Boolean(pickerToken) &&
    !pickerFailed;

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
            ? googleEmail
              ? `Drive di ${googleEmail}. Qui ci sono i Drive della band o della scuola. Aprine uno, poi tocca Scegli.`
              : 'Qui ci sono i Drive della band o della scuola, e le cartelle che ti hanno condiviso. Aprine una, poi tocca Scegli.'
            : 'Cartelle sul tuo Drive. Aprine una per vedere cosa c’è dentro, poi tocca Scegli.'}
      </Text>
      {browsing ? null : (
        <TextInput
          style={styles.search}
          value={query}
          onChangeText={onSearchChange}
          onSubmitEditing={() => loadSearch(query.trim(), tab)}
          placeholder={tab === 'shared' ? 'Cerca un Drive o una cartella…' : 'Cerca cartella…'}
          placeholderTextColor={colors.textMuted}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
        />
      )}
      {busy ? <ActivityIndicator color={colors.accent} style={styles.spinner} /> : null}
      {working ? (
        <View style={styles.workingBox}>
          <Text style={styles.working}>
            {downloadActive
              ? `Sto scaricando la cartella… ${formatDownloadPercent(downloadPercent)}`
              : 'Cerco i file nella cartella…'}
          </Text>
          <View style={styles.barTrack}>
            <View
              style={[
                styles.barFill,
                { width: `${downloadActive ? downloadPercent : 0}%` },
              ]}
            />
          </View>
          {downloadActive ? (
            <Pressable
              onPress={onCancelDownload}
              hitSlop={layout.hitSlop}
              accessibilityRole="button"
              accessibilityLabel="Annulla download"
              style={({ pressed }) => [styles.cancelBtn, pressed && styles.pressed]}
            >
              <Text style={styles.cancelLabel}>Annulla</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {busy ? null : showEmbeddedPicker && pickerToken ? (
        <SharedDrivePickerWebView
          accessToken={pickerToken}
          query={query}
          onPicked={(result) => {
            setBusy(true);
            void applyPickResult(result).catch((error) => {
              setBusy(false);
              Alert.alert(
                'Drive',
                error instanceof Error ? error.message : 'Cartella non aperta. Riprova.',
              );
            });
          }}
          onCancel={() => setPickerFailed(true)}
          onFailed={() => setPickerFailed(true)}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {!browsing && searchHits.length === 0 ? (
            <View style={styles.emptyBox}>
              <EmptyGraphic />
              <Text style={styles.empty}>
                {query.trim()
                  ? 'Nessun risultato. Prova un altro nome.'
                  : tab === 'shared'
                    ? googleEmail
                      ? `Nessun Drive per ${googleEmail}. Scrivi il nome della cartella, oppure in Impostazioni collega l’accesso Google della band.`
                      : 'Scrivi il nome del Drive o della cartella della band.'
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
  workingBox: {
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  working: {
    marginBottom: 8,
    color: colors.accent,
    fontSize: 14,
    fontWeight: '600',
  },
  barTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surfaceRaised,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: 3,
  },
  cancelBtn: {
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  cancelLabel: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  scroll: { paddingHorizontal: 16, paddingBottom: 32, flexGrow: 1 },
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
