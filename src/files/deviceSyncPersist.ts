import * as LegacyFS from 'expo-file-system/legacy';

import type { LinkedKind } from '../cloud/deviceSync/deviceRegistry';
import { pathExistsAsync, withTimeout } from './fsSafe';
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

function prefsFileUri(): string {
  return `${libraryDirectory().uri}/${FILE_NAME}`;
}

export async function loadDeviceSyncPrefs(): Promise<DeviceSyncPrefs> {
  const uri = prefsFileUri();
  const exists = await withTimeout(pathExistsAsync(uri), 2000, false);
  if (!exists) {
    return {};
  }
  try {
    const raw = await withTimeout(LegacyFS.readAsStringAsync(uri), 3000, '');
    if (!raw) {
      return {};
    }
    return JSON.parse(raw) as DeviceSyncPrefs;
  } catch {
    return {};
  }
}

export async function saveDeviceSyncPrefs(prefs: DeviceSyncPrefs): Promise<void> {
  await LegacyFS.writeAsStringAsync(prefsFileUri(), JSON.stringify(prefs));
}
