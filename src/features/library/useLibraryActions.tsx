import { useState } from 'react';
import { Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { CollectionKind, Folder } from '../../domain/library';
import type { Track } from '../../domain/models';
import { userHasUsage } from '../../domain/session';
import { ensurePeaks } from '../../audio/extractPeaks';
import { hasDriveToken } from '../../cloud/driveApi';
import { pickAndSaveAlbumArtwork, pickAndSaveArtwork } from '../../files/albumArtwork';
import { pickAndImportAudio, shareSidecar } from '../../files/libraryFiles';
import type { RootStackParamList } from '../../navigation/types';
import { useLibraryStore } from '../../store/libraryStore';
import { useSessionStore } from '../../store/sessionStore';
import { ActionMenu, type ActionItem } from './ActionMenu';
import { MovePicker } from './MovePicker';
import { PromptModal } from './PromptModal';

type Menu =
  | { type: 'track'; track: Track }
  | { type: 'folder'; folder: Folder }
  | { type: 'create' }
  | { type: 'create-in-folder' }
  | { type: 'create-album' }
  | { type: 'album'; albumId: string }
  | { type: 'playlist'; playlistId: string }
  | { type: 'separator'; albumId: string; separatorId: string; name: string }
  | null;

type Prompt =
  | { type: 'rename-track'; id: string; value: string }
  | { type: 'rename-folder'; id: string; value: string }
  | { type: 'rename-album'; id: string; value: string }
  | { type: 'rename-playlist'; id: string; value: string }
  | { type: 'rename-separator'; albumId: string; id: string; value: string }
  | { type: 'new-folder'; parentId: string | null }
  | { type: 'new-album' }
  | { type: 'drive-album' }
  | { type: 'new-playlist' }
  | { type: 'new-separator'; albumId: string }
  | null;

type Mover =
  | { type: 'track'; id: string }
  | { type: 'folder'; id: string }
  | null;

export function useLibraryActions(
  currentFolderId: string | null = null,
  onOpened?: (kind: CollectionKind, id: string) => void,
) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const folders = useLibraryStore((s) => s.folders);
  const albums = useLibraryStore((s) => s.albums);
  const playlists = useLibraryStore((s) => s.playlists);
  const markersByTrackId = useLibraryStore((s) => s.markersByTrackId);
  const folderDescendants = useLibraryStore((s) => s.folderDescendants);

  const [menu, setMenu] = useState<Menu>(null);
  const [prompt, setPrompt] = useState<Prompt>(null);
  const [mover, setMover] = useState<Mover>(null);
  const [busy, setBusy] = useState(false);
  const [pendingBundles, setPendingBundles] = useState<
    Awaited<ReturnType<typeof pickAndImportAudio>>
  >([]);

  const leaveIfViewing = (kind: CollectionKind, collectionId: string) => {
    const state = navigation.getState();
    const route = state.routes[state.index];
    if (route?.name !== 'Collection') {
      return;
    }
    const params = route.params as { kind?: CollectionKind; id?: string } | undefined;
    if (params?.kind === kind && params.id === collectionId) {
      navigation.goBack();
    }
  };

  const sidecarSlug = () => {
    const user = useSessionStore.getState().user;
    return user && userHasUsage(user, 'band') ? user.authorSlug : undefined;
  };

  const importAudio = async (
    folderId: string | null = currentFolderId,
    albumId?: string,
  ) => {
    if (busy) {
      return;
    }
    try {
      const bundles = await pickAndImportAudio();
      if (bundles.length === 0) {
        return;
      }
      setBusy(true);
      useLibraryStore.getState().importBundles(bundles, { folderId, albumId });
      for (const bundle of bundles) {
        void ensurePeaks(bundle.track).catch(() => undefined);
        void useLibraryStore.getState().downloadTrack(bundle.track.id).catch(() => undefined);
      }
      Alert.alert(
        albumId ? 'Album aggiornato' : 'Importate',
        bundles.length === 1
          ? `${bundles[0].track.title} è in libreria. Se hai scelto anche un .rewavier.json con lo stesso nome, i marker sono già dentro.`
          : `${bundles.length} file importati. I marker si abbinano se il .rewavier.json ha lo stesso nome del file audio.`,
      );
    } catch (error) {
      Alert.alert('Import fallito', error instanceof Error ? error.message : 'Riprova');
    } finally {
      setBusy(false);
    }
  };

  const importDriveAlbum = async () => {
    if (busy) {
      return;
    }
    if (await hasDriveToken()) {
      navigation.navigate('DriveFolder', {});
      return;
    }
    setBusy(true);
    try {
      const bundles = await pickAndImportAudio();
      if (bundles.length === 0) {
        return;
      }
      setPendingBundles(bundles);
      setPrompt({ type: 'drive-album' });
    } catch (error) {
      Alert.alert('Album Drive', error instanceof Error ? error.message : 'Riprova');
    } finally {
      setBusy(false);
    }
  };

  const pickTrackArtwork = (track: Track) => {
    if (track.artworkUri) {
      Alert.alert('Copertina', 'Vuoi cambiare o togliere la foto di questa traccia?', [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Cambia',
          onPress: () => {
            void saveTrackArtwork(track.id);
          },
        },
        {
          text: 'Togli',
          style: 'destructive',
          onPress: () => useLibraryStore.getState().setTrackArtwork(track.id, undefined),
        },
      ]);
      return;
    }
    void saveTrackArtwork(track.id);
  };

  const saveTrackArtwork = async (trackId: string) => {
    try {
      const uri = await pickAndSaveArtwork(trackId);
      if (!uri) {
        return;
      }
      useLibraryStore.getState().setTrackArtwork(trackId, uri);
    } catch (error: unknown) {
      Alert.alert(
        'Copertina',
        error instanceof Error ? error.message : 'Non riesco a usare questa immagine.',
      );
    }
  };

  const trackActions = (track: Track): ActionItem[] => [
    {
      label: track.artworkUri ? 'Cambia copertina' : 'Aggiungi copertina',
      onPress: () => pickTrackArtwork(track),
    },
    {
      label: 'Rinomina',
      onPress: () => setPrompt({ type: 'rename-track', id: track.id, value: track.title }),
    },
    {
      label: 'Sposta in cartella',
      onPress: () => setMover({ type: 'track', id: track.id }),
    },
    {
      label: 'Esporta marker',
      onPress: () => {
        void shareSidecar(track, markersByTrackId[track.id] ?? [], sidecarSlug()).catch((error: unknown) => {
          Alert.alert(
            'Condivisione',
            error instanceof Error ? error.message : 'Non riesco ad aprire il foglio di share',
          );
        });
      },
    },
    {
      label: track.downloaded ? 'Rimuovi download' : 'Scarica offline',
      onPress: () => {
        void (track.downloaded
          ? useLibraryStore.getState().removeDownload(track.id)
          : useLibraryStore.getState().downloadTrack(track.id)
        ).catch((error: unknown) => {
          Alert.alert('Download', error instanceof Error ? error.message : 'Riprova');
        });
      },
    },
    {
      label: 'Sostituisci file',
      onPress: () => navigation.navigate('ReplaceFile', { trackId: track.id }),
    },
    {
      label: 'Elimina',
      danger: true,
      onPress: () => {
        Alert.alert('Eliminare la traccia?', track.title, [
          { text: 'Annulla', style: 'cancel' },
          {
            text: 'Elimina',
            style: 'destructive',
            onPress: () => useLibraryStore.getState().deleteTrack(track.id),
          },
        ]);
      },
    },
  ];

  const createActions = (): ActionItem[] => [
    {
      label: 'Carica audio',
      onPress: () => {
        void importAudio(currentFolderId);
      },
    },
    {
      label: 'Registra bozza',
      onPress: () => navigation.navigate('RecordSketch', {}),
    },
    {
      label: 'Nuovo album',
      onPress: () => setPrompt({ type: 'new-album' }),
    },
    {
      label: 'Importa album da Drive',
      onPress: () => {
        void importDriveAlbum();
      },
    },
    {
      label: 'Nuova cartella',
      onPress: () => setPrompt({ type: 'new-folder', parentId: currentFolderId }),
    },
    {
      label: 'Nuova playlist',
      onPress: () => setPrompt({ type: 'new-playlist' }),
    },
  ];

  const createAlbumActions = (): ActionItem[] => [
    {
      label: 'Nuovo Album Locale',
      onPress: () => setPrompt({ type: 'new-album' }),
    },
    {
      label: 'Nuovo Album da Cartella Cloud',
      onPress: () => {
        void importDriveAlbum();
      },
    },
  ];

  const albumActions = (albumId: string): ActionItem[] => [
    {
      label: 'Aggiungi audio',
      onPress: () => {
        void importAudio(null, albumId);
      },
    },
    {
      label: 'Registra bozza',
      onPress: () => navigation.navigate('RecordSketch', { albumId }),
    },
    {
      label: 'Resoconto lezione',
      onPress: () => navigation.navigate('LessonRecap', { kind: 'album', id: albumId }),
    },
    {
      label: 'Collega cartella Drive',
      onPress: () => navigation.navigate('DriveFolder', { albumId }),
    },
    {
      label: 'Scarica album',
      onPress: () => {
        void useLibraryStore.getState().downloadAlbum(albumId).catch((error: unknown) => {
          Alert.alert('Download', error instanceof Error ? error.message : 'Riprova');
        });
      },
    },
    {
      label: 'Sostituisci file',
      onPress: () => navigation.navigate('ReplaceFile', { albumId }),
    },
    {
      label: 'Aggiungi separatore',
      onPress: () => setPrompt({ type: 'new-separator', albumId }),
    },
    {
      label: useLibraryStore.getState().albums.find((item) => item.id === albumId)?.artworkUri
        ? 'Cambia copertina'
        : 'Aggiungi copertina',
      onPress: () => {
        void (async () => {
          try {
            const uri = await pickAndSaveAlbumArtwork(albumId);
            if (!uri) {
              return;
            }
            useLibraryStore.getState().setAlbumArtwork(albumId, uri);
          } catch (error: unknown) {
            Alert.alert(
              'Copertina',
              error instanceof Error ? error.message : 'Non riesco a usare questa immagine.',
            );
          }
        })();
      },
    },
    {
      label: 'Rinomina',
      onPress: () => {
        const album = useLibraryStore.getState().albums.find((item) => item.id === albumId);
        setPrompt({ type: 'rename-album', id: albumId, value: album?.name ?? '' });
      },
    },
    {
      label: 'Elimina album',
      danger: true,
      onPress: () => {
        Alert.alert('Eliminare l’album?', 'Le tracce restano in libreria.', [
          { text: 'Annulla', style: 'cancel' },
          {
            text: 'Elimina',
            style: 'destructive',
            onPress: () => {
              useLibraryStore.getState().deleteAlbum(albumId);
              leaveIfViewing('album', albumId);
            },
          },
        ]);
      },
    },
  ];

  const separatorActions = (albumId: string, separatorId: string, name: string): ActionItem[] => [
    {
      label: 'Rinomina',
      onPress: () => setPrompt({ type: 'rename-separator', albumId, id: separatorId, value: name }),
    },
    {
      label: 'Elimina separatore',
      danger: true,
      onPress: () => {
        Alert.alert('Togliere il separatore?', name, [
          { text: 'Annulla', style: 'cancel' },
          {
            text: 'Elimina',
            style: 'destructive',
            onPress: () => useLibraryStore.getState().deleteAlbumSeparator(albumId, separatorId),
          },
        ]);
      },
    },
  ];

  const playlistActions = (playlistId: string): ActionItem[] => [
    {
      label: 'Rinomina',
      onPress: () => {
        const playlist = useLibraryStore.getState().playlists.find((item) => item.id === playlistId);
        setPrompt({ type: 'rename-playlist', id: playlistId, value: playlist?.name ?? '' });
      },
    },
    {
      label: 'Elimina playlist',
      danger: true,
      onPress: () => {
        Alert.alert('Eliminare la playlist?', 'Le tracce restano in libreria.', [
          { text: 'Annulla', style: 'cancel' },
          {
            text: 'Elimina',
            style: 'destructive',
            onPress: () => {
              useLibraryStore.getState().deletePlaylist(playlistId);
              leaveIfViewing('playlist', playlistId);
            },
          },
        ]);
      },
    },
  ];

  const createInFolderActions = (): ActionItem[] => [
    {
      label: 'Carica audio',
      onPress: () => {
        void importAudio(currentFolderId);
      },
    },
    {
      label: 'Registra bozza',
      onPress: () =>
        navigation.navigate('RecordSketch', {
          folderId: currentFolderId ?? undefined,
        }),
    },
    {
      label: 'Crea cartella',
      onPress: () => setPrompt({ type: 'new-folder', parentId: currentFolderId }),
    },
  ];

  const folderActions = (folder: Folder): ActionItem[] => [
    {
      label: 'Rinomina',
      onPress: () => setPrompt({ type: 'rename-folder', id: folder.id, value: folder.name }),
    },
    {
      label: 'Sposta',
      onPress: () => setMover({ type: 'folder', id: folder.id }),
    },
    {
      label: 'Nuova sottocartella',
      onPress: () => setPrompt({ type: 'new-folder', parentId: folder.id }),
    },
    {
      label: 'Importa audio qui',
      onPress: () => {
        void importAudio(folder.id);
      },
    },
    {
      label: 'Registra bozza qui',
      onPress: () => navigation.navigate('RecordSketch', { folderId: folder.id }),
    },
    {
      label: 'Resoconto lezione',
      onPress: () => navigation.navigate('LessonRecap', { kind: 'folder', id: folder.id }),
    },
    {
      label: 'Elimina cartella',
      danger: true,
      onPress: () => {
        Alert.alert('Eliminare la cartella?', 'Le tracce restano in libreria.', [
          { text: 'Annulla', style: 'cancel' },
          {
            text: 'Elimina',
            style: 'destructive',
            onPress: () => {
              leaveIfViewing('folder', folder.id);
              useLibraryStore.getState().deleteFolder(folder.id);
            },
          },
        ]);
      },
    },
  ];

  const excludeFolderIds =
    mover?.type === 'folder'
      ? new Set([mover.id, ...folderDescendants(mover.id)])
      : undefined;

  const modals = (
    <>
      <ActionMenu
        visible={menu != null}
        title={
          menu?.type === 'track'
            ? menu.track.title
            : menu?.type === 'folder'
              ? menu.folder.name
              : menu?.type === 'create' ||
                  menu?.type === 'create-in-folder' ||
                  menu?.type === 'create-album'
                ? 'Nuovo'
                : menu?.type === 'album'
                  ? albums.find((item) => item.id === menu.albumId)?.name ?? 'Album'
                  : menu?.type === 'playlist'
                    ? playlists.find((item) => item.id === menu.playlistId)?.name ?? 'Playlist'
                    : menu?.type === 'separator'
                      ? menu.name
                      : ''
        }
        actions={
          menu?.type === 'track'
            ? trackActions(menu.track)
            : menu?.type === 'folder'
              ? folderActions(menu.folder)
              : menu?.type === 'create'
                ? createActions()
                : menu?.type === 'create-in-folder'
                  ? createInFolderActions()
                  : menu?.type === 'create-album'
                    ? createAlbumActions()
                  : menu?.type === 'album'
                    ? albumActions(menu.albumId)
                    : menu?.type === 'playlist'
                      ? playlistActions(menu.playlistId)
                      : menu?.type === 'separator'
                        ? separatorActions(menu.albumId, menu.separatorId, menu.name)
                        : []
        }
        onClose={() => setMenu(null)}
      />
      <PromptModal
        visible={prompt != null}
        title={
          prompt?.type === 'rename-track'
            ? 'Rinomina traccia'
            : prompt?.type === 'rename-folder'
              ? 'Rinomina cartella'
              : prompt?.type === 'rename-album'
                ? 'Rinomina album'
                : prompt?.type === 'rename-playlist'
                  ? 'Rinomina playlist'
              : prompt?.type === 'new-album'
                ? 'Nuovo album'
                : prompt?.type === 'drive-album'
                  ? 'Nome album Drive'
                : prompt?.type === 'new-playlist'
                  ? 'Nuova playlist'
                  : prompt?.type === 'new-separator'
                    ? 'Nome del separatore'
                    : prompt?.type === 'rename-separator'
                      ? 'Rinomina separatore'
                      : 'Nuova cartella'
        }
        placeholder={prompt?.type === 'new-separator' ? 'Bozze' : 'Nome'}
        confirmLabel={
          prompt?.type === 'new-folder' ||
          prompt?.type === 'new-album' ||
          prompt?.type === 'drive-album' ||
          prompt?.type === 'new-playlist'
            ? 'Crea'
            : prompt?.type === 'new-separator'
              ? 'Aggiungi'
              : 'Salva'
        }
        initialValue={
          prompt?.type === 'rename-track' ||
          prompt?.type === 'rename-folder' ||
          prompt?.type === 'rename-album' ||
          prompt?.type === 'rename-playlist' ||
          prompt?.type === 'rename-separator'
            ? prompt.value
            : ''
        }
        onCancel={() => {
          setPrompt(null);
          setPendingBundles([]);
        }}
        onSubmit={(value) => {
          const store = useLibraryStore.getState();
          if (prompt?.type === 'rename-track') {
            store.renameTrack(prompt.id, value);
          } else if (prompt?.type === 'rename-folder') {
            store.renameFolder(prompt.id, value);
          } else if (prompt?.type === 'rename-album') {
            store.renameAlbum(prompt.id, value);
          } else if (prompt?.type === 'rename-playlist') {
            store.renamePlaylist(prompt.id, value);
          } else if (prompt?.type === 'new-folder') {
            const id = store.createFolder(value, prompt.parentId);
            onOpened?.('folder', id);
          } else if (prompt?.type === 'new-album') {
            const id = store.createAlbum(value, { origin: 'local' });
            onOpened?.('album', id);
          } else if (prompt?.type === 'drive-album') {
            const id = store.createAlbum(value, {
              origin: 'drive',
              artist: 'Drive',
              driveFolderName: value.trim(),
            });
            store.importBundles(pendingBundles, { albumId: id });
            for (const bundle of pendingBundles) {
              void ensurePeaks(bundle.track).catch(() => undefined);
            }
            setPendingBundles([]);
            onOpened?.('album', id);
          } else if (prompt?.type === 'new-playlist') {
            const id = store.createPlaylist(value);
            onOpened?.('playlist', id);
          } else if (prompt?.type === 'new-separator') {
            store.addAlbumSeparator(prompt.albumId, value);
          } else if (prompt?.type === 'rename-separator') {
            store.renameAlbumSeparator(prompt.albumId, prompt.id, value);
          }
          setPrompt(null);
        }}
      />
      <MovePicker
        visible={mover != null}
        title={mover?.type === 'folder' ? 'Sposta cartella' : 'Sposta traccia'}
        folders={folders}
        excludeIds={excludeFolderIds}
        onClose={() => setMover(null)}
        onSelect={(folderId) => {
          const store = useLibraryStore.getState();
          if (mover?.type === 'track') {
            store.moveTrack(mover.id, folderId);
          } else if (mover?.type === 'folder') {
            store.moveFolder(mover.id, folderId);
          }
        }}
        onCreateFolder={(name) => {
          const store = useLibraryStore.getState();
          const folderId = store.createFolder(name, null);
          if (mover?.type === 'track') {
            store.moveTrack(mover.id, folderId);
          } else if (mover?.type === 'folder') {
            store.moveFolder(mover.id, folderId);
          }
          setMover(null);
        }}
      />
    </>
  );

  return {
    busy,
    importAudio,
    importDriveAlbum,
    importIntoAlbum: (albumId: string) => importAudio(null, albumId),
    pickTrackArtwork,
    openTrackMenu: (track: Track) => setMenu({ type: 'track', track }),
    openFolderMenu: (folder: Folder) => setMenu({ type: 'folder', folder }),
    openCreateMenu: () => setMenu({ type: 'create' }),
    openFolderCreateMenu: () => setMenu({ type: 'create-in-folder' }),
    openAlbumCreateMenu: () => setMenu({ type: 'create-album' }),
    openAlbumMenu: (albumId: string) => setMenu({ type: 'album', albumId }),
    openPlaylistMenu: (playlistId: string) => setMenu({ type: 'playlist', playlistId }),
    openSeparatorMenu: (albumId: string, separatorId: string, name: string) =>
      setMenu({ type: 'separator', albumId, separatorId, name }),
    newFolder: (parentId: string | null = currentFolderId) =>
      setPrompt({ type: 'new-folder', parentId }),
    newPlaylist: () => setPrompt({ type: 'new-playlist' }),
    confirmDeleteTrack: (track: Track) => {
      Alert.alert('Eliminare la traccia?', track.title, [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Elimina',
          style: 'destructive',
          onPress: () => useLibraryStore.getState().deleteTrack(track.id),
        },
      ]);
    },
    confirmDeleteFolder: (folder: Folder) => {
      Alert.alert('Eliminare la cartella?', 'Le tracce restano in libreria.', [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Elimina',
          style: 'destructive',
          onPress: () => {
            leaveIfViewing('folder', folder.id);
            useLibraryStore.getState().deleteFolder(folder.id);
          },
        },
      ]);
    },
    shareTrack: (track: Track) => {
        void shareSidecar(track, markersByTrackId[track.id] ?? [], sidecarSlug()).catch((error: unknown) => {
        Alert.alert(
          'Condivisione',
          error instanceof Error ? error.message : 'Non riesco ad aprire il foglio di share',
        );
      });
    },
    moveTrack: (track: Track) => setMover({ type: 'track', id: track.id }),
    moveFolder: (folder: Folder) => setMover({ type: 'folder', id: folder.id }),
    modals,
  };
}
