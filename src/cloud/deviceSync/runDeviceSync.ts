import { Platform } from 'react-native';

import { shouldSkipCloudSync } from '../../auth/demoAccount';
import { useSessionStore } from '../../store/sessionStore';
import { loadDeviceSyncPrefs, saveDeviceSyncPrefs } from '../../files/deviceSyncPersist';
import { useDeviceStore } from '../../store/deviceStore';
import { ensureLocalDevice } from './deviceIdentity';
import { isRevoked } from './deviceRegistry';
import { loadMergedRegistry, touchThisDevice } from './registryIO';
import { syncDriveSuitcase, type SuitcaseResult } from './driveSuitcase';
import { icloudStatus, syncICloudSuitcase } from './icloudSuitcase';

export type DeviceSyncSummary = {
  icloud: SuitcaseResult;
  drive: SuitcaseResult;
  message: string;
};

function pickMessage(icloud: SuitcaseResult, drive: SuitcaseResult): string {
  const parts = [icloud.message, drive.message].filter(Boolean);
  if (parts.length === 0) {
    return 'Niente da allineare sugli altri telefoni.';
  }
  if (icloud.pulled + icloud.pushed + drive.pulled + drive.pushed === 0) {
    return parts[0] ?? '';
  }
  if (Platform.OS === 'ios' && icloud.pulled + icloud.pushed > 0 && drive.pulled + drive.pushed > 0) {
    return 'Libreria allineata su iCloud e su Drive.';
  }
  return parts[0] ?? '';
}

function skippedSummary(message = ''): DeviceSyncSummary {
  const skipped: SuitcaseResult = { pushed: 0, pulled: 0, message };
  return { icloud: skipped, drive: skipped, message };
}

export async function runDeviceSync(): Promise<DeviceSyncSummary> {
  if (shouldSkipCloudSync(useSessionStore.getState().user)) {
    return skippedSummary();
  }
  const prefs = await loadDeviceSyncPrefs();
  const self = await ensureLocalDevice();
  const registry = await loadMergedRegistry().catch(() => null);
  if (prefs.unlinked || (registry && isRevoked(registry, self.id))) {
    if (!prefs.unlinked && registry && isRevoked(registry, self.id)) {
      await saveDeviceSyncPrefs({ ...prefs, unlinked: true });
    }
    void useDeviceStore.getState().refresh();
    const skipped: SuitcaseResult = {
      pushed: 0,
      pulled: 0,
      message: 'Questo telefono è scollegato. Tocca Collega di nuovo per allineare.',
    };
    return { icloud: skipped, drive: skipped, message: skipped.message };
  }

  const icloud = await syncICloudSuitcase().catch(
    (error): SuitcaseResult => ({
      pushed: 0,
      pulled: 0,
      message: error instanceof Error ? error.message : 'Copia iCloud non riuscita.',
    }),
  );
  const drive = await syncDriveSuitcase().catch(
    (error): SuitcaseResult => ({
      pushed: 0,
      pulled: 0,
      message: error instanceof Error ? error.message : 'Copia Drive non riuscita.',
    }),
  );
  if ((await icloudStatus()) === 'ready' && !icloud.message.includes('non riuscita')) {
    await touchThisDevice('icloud').catch(() => undefined);
  }
  if (drive.pushed + drive.pulled > 0 || drive.message.includes('in pari')) {
    await touchThisDevice('drive').catch(() => undefined);
  }
  void useDeviceStore.getState().refresh();
  return { icloud, drive, message: pickMessage(icloud, drive) };
}

export { icloudStatus };
