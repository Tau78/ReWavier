import { Platform } from 'react-native';

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

export async function runDeviceSync(): Promise<DeviceSyncSummary> {
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
  return { icloud, drive, message: pickMessage(icloud, drive) };
}

export { icloudStatus };
