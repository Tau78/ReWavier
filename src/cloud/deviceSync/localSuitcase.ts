import { File } from 'expo-file-system';
import * as LegacyFS from 'expo-file-system/legacy';

import { isAudioName } from '../../domain/audioFormats';
import { isSidecarName } from '../../domain/sidecar';
import { scanAudioFolder } from '../../files/audioFolder';
import {
  loadLibrarySnapshot,
  saveLibrarySnapshot,
  sanitizeSnapshot,
  type LibrarySnapshot,
} from '../../files/libraryPersist';
import { audioDirectory } from '../../files/libraryPaths';
import { useLibraryStore } from '../../store/libraryStore';
import { mergeLibrarySnapshots } from './mergeLibrary';

const SKIP = new Set(['Come usare questa cartella.txt', '.DS_Store']);

export type LocalBagFile = {
  name: string;
  uri: string;
  size?: number;
};

function basename(uri: string): string {
  const clean = uri.split('?')[0] ?? uri;
  const parts = clean.replace(/\/$/, '').split('/');
  return decodeURIComponent(parts[parts.length - 1] ?? '');
}

export function listLocalBagFiles(): LocalBagFile[] {
  const dir = audioDirectory();
  if (!dir.exists) {
    return [];
  }
  try {
    return dir
      .list()
      .map((entry) => {
        const name = basename(entry.uri);
        const file = new File(entry.uri);
        return {
          name,
          uri: entry.uri,
          size: typeof file.size === 'number' ? file.size : undefined,
        };
      })
      .filter((item) => item.name && !SKIP.has(item.name) && (isAudioName(item.name) || isSidecarName(item.name)));
  } catch {
    return [];
  }
}

export function snapshotFromStore(): LibrarySnapshot {
  const state = useLibraryStore.getState();
  return {
    version: 2,
    tracks: state.tracks,
    folders: state.folders,
    albums: state.albums,
    playlists: state.playlists,
    smartPlaylists: state.smartPlaylists,
    markersByTrackId: state.markersByTrackId,
  };
}

export async function importLooseAudioFiles(): Promise<number> {
  const extras = await scanAudioFolder(useLibraryStore.getState().tracks);
  if (extras.length === 0) {
    return 0;
  }
  useLibraryStore.getState().importBundles(extras);
  return extras.length;
}

export async function applyRemoteSnapshot(remote: LibrarySnapshot): Promise<void> {
  const local = (await loadLibrarySnapshot()) ?? snapshotFromStore();
  const merged = sanitizeSnapshot(mergeLibrarySnapshots(local, remote));
  useLibraryStore.setState({
    tracks: merged.tracks,
    folders: merged.folders,
    albums: merged.albums,
    playlists: merged.playlists,
    smartPlaylists: merged.smartPlaylists,
    markersByTrackId: merged.markersByTrackId,
  });
  await saveLibrarySnapshot(merged);
  await importLooseAudioFiles();
}

export async function writeSnapshotCopy(destUri: string): Promise<void> {
  await LegacyFS.writeAsStringAsync(destUri, JSON.stringify(snapshotFromStore()));
}

export function mimeForBagName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.json')) {
    return 'application/json';
  }
  if (lower.endsWith('.wav')) {
    return 'audio/wav';
  }
  if (lower.endsWith('.mp3')) {
    return 'audio/mpeg';
  }
  if (lower.endsWith('.m4a') || lower.endsWith('.mp4') || lower.endsWith('.aac')) {
    return 'audio/mp4';
  }
  if (lower.endsWith('.aiff') || lower.endsWith('.aif')) {
    return 'audio/aiff';
  }
  if (lower.endsWith('.flac')) {
    return 'audio/flac';
  }
  if (lower.endsWith('.ogg')) {
    return 'audio/ogg';
  }
  return 'application/octet-stream';
}
