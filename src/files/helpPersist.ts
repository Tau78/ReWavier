import * as LegacyFS from 'expo-file-system/legacy';

import { ensureDirAsync, pathExistsAsync, withTimeout } from './fsSafe';
import { libraryDirectory } from './libraryPaths';

export type HelpSnapshot = {
  tourDone: boolean;
};

const FILE_NAME = 'help.json';

function helpFileUri(): string {
  return `${libraryDirectory().uri}/${FILE_NAME}`;
}

export async function loadHelpSnapshot(): Promise<HelpSnapshot> {
  const uri = helpFileUri();
  const exists = await withTimeout(pathExistsAsync(uri), 2000, false);
  if (!exists) {
    return { tourDone: false };
  }
  try {
    const raw = await withTimeout(LegacyFS.readAsStringAsync(uri), 3000, '');
    if (!raw) {
      return { tourDone: false };
    }
    const parsed = JSON.parse(raw) as Partial<HelpSnapshot>;
    return { tourDone: parsed.tourDone === true };
  } catch {
    return { tourDone: false };
  }
}

export async function saveHelpSnapshot(snapshot: HelpSnapshot): Promise<void> {
  await ensureDirAsync(libraryDirectory().uri);
  await LegacyFS.writeAsStringAsync(helpFileUri(), JSON.stringify({ tourDone: snapshot.tourDone }));
}
