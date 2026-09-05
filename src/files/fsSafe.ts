import { Directory, File } from 'expo-file-system';
import * as LegacyFS from 'expo-file-system/legacy';

export async function pathExistsAsync(uri: string): Promise<boolean> {
  try {
    const info = await LegacyFS.getInfoAsync(uri);
    return info.exists === true;
  } catch {
    return false;
  }
}

function createDir(uri: string): void {
  new Directory(uri).create({ intermediates: true, idempotent: true });
}

export async function ensureDirAsync(uri: string): Promise<void> {
  try {
    createDir(uri);
  } catch {
    // iCloud può essere lento: la scrittura fallirà se la cartella non c’è.
  }
}

/** Surfaces creation errors — required before downloadAsync. */
export async function ensureDirStrictAsync(uri: string): Promise<void> {
  createDir(uri);
}

export function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => {
      setTimeout(() => resolve(fallback), ms);
    }),
  ]);
}

/** Parent of a file URI (…/inbox/foo.mp3 → …/inbox). */
export function parentDirUri(fileUri: string): string {
  const clean = fileUri.replace(/\/$/, '');
  const idx = clean.lastIndexOf('/');
  return idx > 0 ? clean.slice(0, idx) : clean;
}

export async function ensureParentDirAsync(fileUri: string): Promise<void> {
  new File(fileUri).parentDirectory.create({ intermediates: true, idempotent: true });
}
