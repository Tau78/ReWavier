import { File } from 'expo-file-system';
import * as LegacyFS from 'expo-file-system/legacy';

import { inboxDirectory } from '../../files/downloads';
import { loadDeviceSyncPrefs, saveDeviceSyncPrefs } from '../../files/deviceSyncPersist';
import { audioDirectory } from '../../files/libraryPaths';
import {
  createDriveFolder,
  downloadDriveFile,
  findChildByName,
  findFolderByName,
  getDriveFile,
  hasDriveToken,
  listFolderChildren,
  updateDriveFileMedia,
  uploadDriveFile,
  type DriveFile,
} from '../driveApi';
import {
  applyRemoteSnapshot,
  importLooseAudioFiles,
  listLocalBagFiles,
  mimeForBagName,
  writeSnapshotCopy,
} from './localSuitcase';
import { parseLibrarySnapshot } from './parseSnapshot';

const ROOT_NAME = 'ReWavier';
const AUDIO_NAME = 'Audio';
const LIBRARY_NAME = 'library.json';

export type SuitcaseResult = {
  pushed: number;
  pulled: number;
  message: string;
};

async function ensureFolders(): Promise<{ rootId: string; audioId: string }> {
  const prefs = await loadDeviceSyncPrefs();
  let rootId = prefs.driveFolderId;
  if (rootId) {
    const existing = await getDriveFile(rootId);
    if (!existing) {
      rootId = undefined;
    }
  }
  if (!rootId) {
    const found = await findFolderByName(ROOT_NAME);
    if (found && found.name.toLowerCase() === ROOT_NAME.toLowerCase()) {
      rootId = found.id;
    } else {
      rootId = (await createDriveFolder(ROOT_NAME)).id;
    }
  }
  let audioId = prefs.driveAudioFolderId;
  if (audioId) {
    const existing = await getDriveFile(audioId);
    if (!existing) {
      audioId = undefined;
    }
  }
  if (!audioId) {
    const found = await findChildByName(rootId, AUDIO_NAME);
    audioId = found?.id ?? (await createDriveFolder(AUDIO_NAME, rootId)).id;
  }
  await saveDeviceSyncPrefs({ ...prefs, driveFolderId: rootId, driveAudioFolderId: audioId });
  return { rootId, audioId };
}

async function upsertFile(folderId: string, name: string, fileUri: string, remote?: DriveFile) {
  const mimeType = mimeForBagName(name);
  if (remote) {
    await updateDriveFileMedia(remote.id, fileUri, mimeType);
    return;
  }
  await uploadDriveFile({ name, folderId, fileUri, mimeType });
}

async function pullFile(remote: DriveFile): Promise<void> {
  const dest = new File(audioDirectory(), remote.name);
  if (dest.exists && dest.size != null && remote.size && Number(remote.size) === dest.size) {
    return;
  }
  const tmp = new File(inboxDirectory(), `bag-${remote.id}-${remote.name.replace(/[/\\?%*:|"<>]/g, '-')}`);
  const uri = await downloadDriveFile(remote.id, tmp.uri);
  await LegacyFS.copyAsync({ from: uri, to: dest.uri });
  try {
    tmp.delete();
  } catch {
    // temp already gone
  }
}

export async function syncDriveSuitcase(): Promise<SuitcaseResult> {
  if (!(await hasDriveToken())) {
    return {
      pushed: 0,
      pulled: 0,
      message: 'Per iPhone e Android collega Google: usa la cartella ReWavier su Drive.',
    };
  }

  const { rootId, audioId } = await ensureFolders();
  let pushed = 0;
  let pulled = 0;

  const remoteLibrary = await findChildByName(rootId, LIBRARY_NAME);
  if (remoteLibrary) {
    const tmp = new File(inboxDirectory(), 'bag-library.json');
    await downloadDriveFile(remoteLibrary.id, tmp.uri);
    const parsed = await parseLibrarySnapshot(tmp.uri);
    if (tmp.exists) {
      tmp.delete();
    }
    if (parsed) {
      await applyRemoteSnapshot(parsed);
      pulled += 1;
    }
  }

  const remoteFiles = await listFolderChildren(audioId);
  const remoteByName = new Map(remoteFiles.map((file) => [file.name.toLowerCase(), file]));
  const localFiles = listLocalBagFiles();
  const localByName = new Map(localFiles.map((file) => [file.name.toLowerCase(), file]));

  for (const remote of remoteFiles) {
    const local = localByName.get(remote.name.toLowerCase());
    if (!local) {
      await pullFile(remote);
      pulled += 1;
      continue;
    }
    if (remote.size && local.size && Number(remote.size) !== local.size && remote.modifiedTime) {
      const remoteMs = Date.parse(remote.modifiedTime);
      if (Number.isFinite(remoteMs)) {
        await pullFile(remote);
        pulled += 1;
      }
    }
  }

  await importLooseAudioFiles();

  for (const local of listLocalBagFiles()) {
    const remote = remoteByName.get(local.name.toLowerCase());
    if (remote && remote.size && local.size && Number(remote.size) === local.size) {
      continue;
    }
    await upsertFile(audioId, local.name, local.uri, remote);
    pushed += 1;
  }

  const snapshotUri = new File(inboxDirectory(), 'bag-library-out.json').uri;
  await writeSnapshotCopy(snapshotUri);
  const libraryRemote = await findChildByName(rootId, LIBRARY_NAME);
  await upsertFile(rootId, LIBRARY_NAME, snapshotUri, libraryRemote ?? undefined);
  pushed += 1;
  try {
    new File(snapshotUri).delete();
  } catch {
    // ignore
  }

  const prefs = await loadDeviceSyncPrefs();
  await saveDeviceSyncPrefs({ ...prefs, lastDriveAt: Date.now() });

  return {
    pushed,
    pulled,
    message:
      pulled > 0 || pushed > 1
        ? 'Libreria allineata su Drive. La trovi nella cartella ReWavier.'
        : 'Drive è già in pari.',
  };
}
