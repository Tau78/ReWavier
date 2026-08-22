import * as LegacyFS from 'expo-file-system/legacy';

import { sanitizeSnapshot, type LibrarySnapshot } from '../../files/libraryPersist';

export async function parseLibrarySnapshot(uri: string): Promise<LibrarySnapshot | null> {
  try {
    const parsed = JSON.parse(await LegacyFS.readAsStringAsync(uri)) as LibrarySnapshot;
    if (!Array.isArray(parsed.tracks)) {
      return null;
    }
    return sanitizeSnapshot(parsed);
  } catch {
    return null;
  }
}
