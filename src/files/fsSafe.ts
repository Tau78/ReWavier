import * as LegacyFS from 'expo-file-system/legacy';

export async function pathExistsAsync(uri: string): Promise<boolean> {
  try {
    const info = await LegacyFS.getInfoAsync(uri);
    return info.exists === true;
  } catch {
    return false;
  }
}

export async function ensureDirAsync(uri: string): Promise<void> {
  try {
    if (!(await pathExistsAsync(uri))) {
      await LegacyFS.makeDirectoryAsync(uri, { intermediates: true });
    }
  } catch {
    // iCloud può essere lento: la scrittura fallirà se la cartella non c’è.
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => {
      setTimeout(() => resolve(fallback), ms);
    }),
  ]);
}
