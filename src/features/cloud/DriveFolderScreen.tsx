import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';

import { listDriveFolders, type DriveFile } from '../../cloud/driveApi';
import { importDriveFolder, runCloudSync } from '../../cloud/syncEngine';
import type { RootStackParamList } from '../../navigation/types';
import { useLibraryStore } from '../../store/libraryStore';
import { colors, layout } from '../../theme/colors';
import { EmptyGraphic, KindRow } from '../../theme/graphics';

type Nav = NativeStackNavigationProp<RootStackParamList, 'DriveFolder'>;
type Route = RouteProp<RootStackParamList, 'DriveFolder'>;

export function DriveFolderScreen() {
  const navigation = useNavigation<Nav>();
  const albumId = useRoute<Route>().params?.albumId;
  const [query, setQuery] = useState('');
  const [folders, setFolders] = useState<DriveFile[]>([]);
  const [busy, setBusy] = useState(true);
  const [working, setWorking] = useState(false);

  const load = (needle?: string) => {
    setBusy(true);
    void listDriveFolders(needle)
      .then(setFolders)
      .catch((error) => {
        Alert.alert('Drive', error instanceof Error ? error.message : 'Cartelle non disponibili');
      })
      .finally(() => setBusy(false));
  };

  useEffect(() => {
    load();
  }, []);

  const onPick = (folder: DriveFile) => {
    if (working) {
      return;
    }
    setWorking(true);
    void (async () => {
      try {
        if (albumId) {
          useLibraryStore.getState().linkAlbumDrive(albumId, folder.id, folder.name);
          await runCloudSync();
        } else {
          const id = await importDriveFolder(folder.id, folder.name);
          navigation.replace('Collection', { kind: 'album', id });
          return;
        }
        navigation.goBack();
      } catch (error) {
        Alert.alert('Drive', error instanceof Error ? error.message : 'Import non riuscito');
      } finally {
        setWorking(false);
      }
    })();
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={layout.hitSlop}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <View>
          <KindRow label="Drive" />
          <Text style={styles.title}>Cartella album</Text>
        </View>
      </View>
      <Text style={styles.hint}>
        Scegli la cartella condivisa con la band. All’apertura dell’app ReWavier controllerà
        audio e note nuovi.
      </Text>
      <TextInput
        style={styles.search}
        value={query}
        onChangeText={setQuery}
        onSubmitEditing={() => load(query)}
        placeholder="Cerca cartella…"
        placeholderTextColor={colors.textMuted}
        returnKeyType="search"
      />
      {busy || working ? (
        <ActivityIndicator color={colors.accent} style={styles.spinner} />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {folders.length === 0 ? (
            <View style={styles.emptyBox}>
              <EmptyGraphic />
              <Text style={styles.empty}>Nessuna cartella. Accedi con Google e condividi l’album su Drive.</Text>
            </View>
          ) : (
            folders.map((folder) => (
              <Pressable key={folder.id} onPress={() => onPick(folder)} style={styles.row}>
                <Text style={styles.rowTitle}>{folder.name}</Text>
                <Text style={styles.rowMeta}>Cartella Drive</Text>
              </Pressable>
            ))
          )}
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
  back: { color: colors.textMuted, fontSize: 34, lineHeight: 36, width: 28, marginTop: -4 },
  title: { color: colors.text, fontSize: 22, fontWeight: '700' },
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
  spinner: { marginTop: 32 },
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
  rowTitle: { color: colors.text, fontSize: 16, fontWeight: '600' },
  rowMeta: { marginTop: 4, color: colors.textMuted, fontSize: 12 },
});
