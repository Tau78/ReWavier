import { File } from 'expo-file-system';
import * as LegacyFS from 'expo-file-system/legacy';

import type { LinkedKind } from '../cloud/deviceSync/deviceRegistry';
import { libraryDirectory } from './libraryPaths';

export type DeviceSyncPrefs = {
  driveFolderId?: string;
  driveAudioFolderId?: string;
  lastDriveAt?: number;
  lastICloudAt?: number;
  deviceId?: string;
  deviceName?: string;
  deviceKind?: LinkedKind;
  unlinked?: boolean;
};

const FILE_NAME = 'device-sync.json';

function prefsFile(): File {
  return new File(libraryDirectory(), FILE_NAME);
}

export async function loadDeviceSyncPrefs(): Promise<DeviceSyncPrefs> {
  const file = prefsFile();
  if (!file.exists) {
    return {};
  }
  try {
    return JSON.parse(await LegacyFS.readAsStringAsync(file.uri)) as DeviceSyncPrefs;
  } catch {
    return {};
  }
}

export async function saveDeviceSyncPrefs(prefs: DeviceSyncPrefs): Promise<void> {
  await LegacyFS.writeAsStringAsync(prefsFile().uri, JSON.stringify(prefs));
}
