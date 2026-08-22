import { File } from 'expo-file-system';
import * as LegacyFS from 'expo-file-system/legacy';

import { inboxDirectory } from '../../files/downloads';
import { loadDeviceSyncPrefs, saveDeviceSyncPrefs } from '../../files/deviceSyncPersist';
import {
  downloadDriveFile,
  findChildByName,
  hasDriveToken,
  updateDriveFileMedia,
  uploadDriveFile,
} from '../driveApi';
import { ensureLocalDevice } from './deviceIdentity';
import {
  EMPTY_REGISTRY,
  isRevoked,
  mergeRegistries,
  parseDeviceRegistry,
  registerDevice,
  revokeDevice,
  type DeviceRegistry,
  type LinkedVia,
} from './deviceRegistry';
import { ensureDriveLibraryFolders } from './driveSuitcase';
import { icloudStatus } from './icloudSuitcase';

export const DEVICES_FILE = 'telefoni.json';

async function readJsonFile(uri: string): Promise<unknown | null> {
  try {
    return JSON.parse(await LegacyFS.readAsStringAsync(uri));
  } catch {
    return null;
  }
}

async function writeJsonFile(uri: string, data: DeviceRegistry): Promise<void> {
  await LegacyFS.writeAsStringAsync(uri, JSON.stringify(data));
}

async function pullDriveRegistry(): Promise<DeviceRegistry> {
  if (!(await hasDriveToken())) {
    return { ...EMPTY_REGISTRY };
  }
  const { rootId } = await ensureDriveLibraryFolders();
  const remote = await findChildByName(rootId, DEVICES_FILE);
  if (!remote) {
    return { ...EMPTY_REGISTRY };
  }
  const tmp = new File(inboxDirectory(), 'bag-telefoni.json');
  await downloadDriveFile(remote.id, tmp.uri);
  const parsed = parseDeviceRegistry(await readJsonFile(tmp.uri));
  if (tmp.exists) {
    tmp.delete();
  }
  return parsed;
}

async function pushDriveRegistry(registry: DeviceRegistry): Promise<void> {
  if (!(await hasDriveToken())) {
    return;
  }
  const { rootId } = await ensureDriveLibraryFolders();
  const uri = new File(inboxDirectory(), 'bag-telefoni-out.json').uri;
  await writeJsonFile(uri, registry);
  const remote = await findChildByName(rootId, DEVICES_FILE);
  if (remote) {
    await updateDriveFileMedia(remote.id, uri, 'application/json');
  } else {
    await uploadDriveFile({
      name: DEVICES_FILE,
      folderId: rootId,
      fileUri: uri,
      mimeType: 'application/json',
    });
  }
  try {
    new File(uri).delete();
  } catch {
    // ignore
  }
}

async function loadICloudApi() {
  try {
    return await import('@oleg_svetlichnyi/expo-icloud-storage');
  } catch {
    return null;
  }
}

async function pullICloudRegistry(): Promise<DeviceRegistry> {
  if ((await icloudStatus()) !== 'ready') {
    return { ...EMPTY_REGISTRY };
  }
  const api = await loadICloudApi();
  if (!api?.defaultICloudContainerPath) {
    return { ...EMPTY_REGISTRY };
  }
  const exists = await api.isExistAsync(DEVICES_FILE, false);
  if (!exists) {
    return { ...EMPTY_REGISTRY };
  }
  const root = `${api.defaultICloudContainerPath}/Documents`;
  const downloaded = await api.downloadFileAsync(`${root}/${DEVICES_FILE}`, inboxDirectory().uri);
  const uri = downloaded.startsWith('file:') ? downloaded : `file://${downloaded}`;
  return parseDeviceRegistry(await readJsonFile(uri));
}

async function pushICloudRegistry(registry: DeviceRegistry): Promise<void> {
  if ((await icloudStatus()) !== 'ready') {
    return;
  }
  const api = await loadICloudApi();
  if (!api) {
    return;
  }
  const uri = new File(inboxDirectory(), 'icloud-telefoni.json').uri;
  await writeJsonFile(uri, registry);
  await api.uploadFileAsync({ destinationPath: DEVICES_FILE, filePath: uri });
}

export async function loadMergedRegistry(): Promise<DeviceRegistry> {
  const [drive, icloud] = await Promise.all([
    pullDriveRegistry().catch(() => EMPTY_REGISTRY),
    pullICloudRegistry().catch(() => EMPTY_REGISTRY),
  ]);
  return mergeRegistries(drive, icloud);
}

export async function publishRegistry(registry: DeviceRegistry): Promise<void> {
  await Promise.all([
    pushDriveRegistry(registry).catch(() => undefined),
    pushICloudRegistry(registry).catch(() => undefined),
  ]);
}

export async function touchThisDevice(via: LinkedVia): Promise<DeviceRegistry | 'revoked'> {
  const prefs = await loadDeviceSyncPrefs();
  if (prefs.unlinked) {
    return 'revoked';
  }
  const self = await ensureLocalDevice();
  const current = await loadMergedRegistry();
  if (isRevoked(current, self.id)) {
    return 'revoked';
  }
  const next = registerDevice(current, self, via);
  await publishRegistry(next);
  return next;
}

export async function unlinkRemoteDevice(deviceId: string): Promise<DeviceRegistry> {
  const self = await ensureLocalDevice();
  const next = revokeDevice(await loadMergedRegistry(), deviceId);
  await publishRegistry(next);
  if (deviceId === self.id) {
    const prefs = await loadDeviceSyncPrefs();
    await saveDeviceSyncPrefs({ ...prefs, unlinked: true });
  }
  return next;
}

export async function relinkThisDevice(): Promise<DeviceRegistry> {
  const prefs = await loadDeviceSyncPrefs();
  await saveDeviceSyncPrefs({ ...prefs, unlinked: false });
  const self = await ensureLocalDevice();
  const current = await loadMergedRegistry();
  const cleaned: DeviceRegistry = {
    ...current,
    revokedIds: current.revokedIds.filter((id) => id !== self.id),
  };
  const next = registerDevice(cleaned, self, prefs.lastDriveAt ? 'drive' : 'icloud');
  await publishRegistry(next);
  return next;
}
