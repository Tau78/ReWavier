import { Platform } from 'react-native';
import { File } from 'expo-file-system';

import { inboxDirectory } from '../../files/downloads';
import { loadDeviceSyncPrefs, saveDeviceSyncPrefs } from '../../files/deviceSyncPersist';
import { audioDirectory } from '../../files/libraryPaths';
import {
  applyRemoteSnapshot,
  importLooseAudioFiles,
  listLocalBagFiles,
  writeSnapshotCopy,
} from './localSuitcase';
import { parseLibrarySnapshot } from './parseSnapshot';
import type { SuitcaseResult } from './driveSuitcase';

const AUDIO_DIR = 'Audio';
const LIBRARY_NAME = 'library.json';

type ICloudApi = {
  defaultICloudContainerPath: string | null;
  isICloudAvailableAsync: () => Promise<boolean>;
  createDirAsync: (path: string) => Promise<boolean>;
  readDirAsync: (path: string, options?: { isFullPath?: boolean }) => Promise<string[]>;
  isExistAsync: (path: string, isDirectory: boolean) => Promise<boolean>;
  uploadFileAsync: (options: { destinationPath: string; filePath: string }) => Promise<string>;
  downloadFileAsync: (path: string, destinationDir: string) => Promise<string>;
};

async function loadICloud(): Promise<ICloudApi | null> {
  if (Platform.OS !== 'ios') {
    return null;
  }
  try {
    return (await import('@oleg_svetlichnyi/expo-icloud-storage')) as ICloudApi;
  } catch {
    return null;
  }
}

function fileName(path: string): string {
  const parts = path.replace(/\/$/, '').split('/');
  return decodeURIComponent(parts[parts.length - 1] ?? '');
}

export async function icloudStatus(): Promise<'ready' | 'need-build' | 'off' | 'android'> {
  if (Platform.OS !== 'ios') {
    return 'android';
  }
  const api = await loadICloud();
  if (!api) {
    return 'need-build';
  }
  try {
    const on = await api.isICloudAvailableAsync();
    return on && api.defaultICloudContainerPath ? 'ready' : 'off';
  } catch {
    return 'need-build';
  }
}

export async function syncICloudSuitcase(): Promise<SuitcaseResult> {
  const status = await icloudStatus();
  if (status === 'android') {
    return { pushed: 0, pulled: 0, message: '' };
  }
  if (status === 'need-build') {
    return {
      pushed: 0,
      pulled: 0,
      message: 'Su iPhone la copia iCloud parte dal prossimo aggiornamento dell’app.',
    };
  }
  if (status === 'off') {
    return {
      pushed: 0,
      pulled: 0,
      message: 'Su questo iPhone iCloud Drive è spento. Accendilo in Impostazioni di iPhone.',
    };
  }

  const api = await loadICloud();
  if (!api?.defaultICloudContainerPath) {
    return { pushed: 0, pulled: 0, message: 'iCloud non è pronto su questo iPhone.' };
  }

  await api.createDirAsync(AUDIO_DIR);
  const root = `${api.defaultICloudContainerPath}/Documents`;
  let pushed = 0;
  let pulled = 0;

  if (await api.isExistAsync(LIBRARY_NAME, false)) {
    const downloaded = await api.downloadFileAsync(`${root}/${LIBRARY_NAME}`, inboxDirectory().uri);
    const parsed = await parseLibrarySnapshot(asFileUri(downloaded));
    if (parsed) {
      await applyRemoteSnapshot(parsed);
      pulled += 1;
    }
  }

  const remoteNames = (await api.readDirAsync(AUDIO_DIR, { isFullPath: false })).map(fileName);
  const localFiles = listLocalBagFiles();
  const localByName = new Map(localFiles.map((file) => [file.name.toLowerCase(), file]));
  const remoteByName = new Map(
    remoteNames
      .filter((name) => name && !name.startsWith('.'))
      .map((name) => [name.toLowerCase(), name]),
  );

  for (const name of remoteNames) {
    if (!name || name.startsWith('.')) {
      continue;
    }
    const local = localByName.get(name.toLowerCase());
    const remotePath = `${root}/${AUDIO_DIR}/${name}`;
    if (!local) {
      await api.downloadFileAsync(remotePath, audioDirectory().uri);
      pulled += 1;
      continue;
    }
    const remoteSize = icloudFileSize(remotePath);
    if (remoteSize !== undefined && local.size !== undefined && remoteSize !== local.size) {
      await api.downloadFileAsync(remotePath, audioDirectory().uri);
      pulled += 1;
    }
  }

  await importLooseAudioFiles();

  for (const local of listLocalBagFiles()) {
    const dest = `${AUDIO_DIR}/${local.name}`;
    const remoteName = remoteByName.get(local.name.toLowerCase());
    if (remoteName) {
      const remoteSize = icloudFileSize(`${root}/${AUDIO_DIR}/${remoteName}`);
      if (remoteSize !== undefined && local.size !== undefined && remoteSize === local.size) {
        continue;
      }
    }
    await api.uploadFileAsync({ destinationPath: dest, filePath: local.uri });
    pushed += 1;
  }

  const snapshotUri = new File(inboxDirectory(), 'icloud-library.json').uri;
  await writeSnapshotCopy(snapshotUri);
  await api.uploadFileAsync({
    destinationPath: LIBRARY_NAME,
    filePath: snapshotUri,
  });
  pushed += 1;

  const prefs = await loadDeviceSyncPrefs();
  await saveDeviceSyncPrefs({ ...prefs, lastICloudAt: Date.now() });

  return {
    pushed,
    pulled,
    message:
      pulled > 0 || pushed > 1
        ? 'Libreria allineata su iCloud. La trovi in File → iCloud Drive → ReWavier.'
        : 'iCloud è già in pari.',
  };
}

function asFileUri(path: string): string {
  return path.startsWith('file:') ? path : `file://${path}`;
}

function icloudFileSize(fullPath: string): number | undefined {
  try {
    const file = new File(asFileUri(fullPath));
    if (!file.exists) {
      return undefined;
    }
    return typeof file.size === 'number' ? file.size : undefined;
  } catch {
    return undefined;
  }
}
