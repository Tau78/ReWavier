import { Directory } from 'expo-file-system';
import * as LegacyFS from 'expo-file-system/legacy';

/** Keep `scripts/check-fs-safe.mjs` in sync with toFileUri / parentDirUri. */

/** Legacy downloadAsync needs a file:// URI and an existing parent folder. */
export function toFileUri(uri: string): string {
  const trimmed = uri.trim();
  if (!trimmed) {
    return trimmed;
  }
  const withoutSlash = trimmed.length > 8 && trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
  if (withoutSlash.startsWith('file://')) {
    return withoutSlash;
  }
  if (withoutSlash.startsWith('/')) {
    return `file://${withoutSlash}`;
  }
  return withoutSlash;
}

export async function pathExistsAsync(uri: string): Promise<boolean> {
  try {
    const info = await LegacyFS.getInfoAsync(toFileUri(uri));
    return info.exists === true;
  } catch {
    return false;
  }
}

async function dirExistsAsync(uri: string): Promise<boolean> {
  try {
    const info = await LegacyFS.getInfoAsync(toFileUri(uri));
    return info.exists === true && info.isDirectory === true;
  } catch {
    return false;
  }
}

function createDirNewApi(uri: string): void {
  new Directory(toFileUri(uri)).create({ intermediates: true, idempotent: true });
}

/** Same native module as downloadAsync — creates intermediates, then verifies. */
async function createDirLegacyAsync(uri: string): Promise<void> {
  const dirUri = toFileUri(uri);
  if (await dirExistsAsync(dirUri)) {
    return;
  }
  try {
    const info = await LegacyFS.getInfoAsync(dirUri);
    if (info.exists && !info.isDirectory) {
      await LegacyFS.deleteAsync(dirUri, { idempotent: true });
    }
  } catch {
    // missing is fine
  }
  try {
    await LegacyFS.makeDirectoryAsync(dirUri, { intermediates: true });
  } catch {
    try {
      createDirNewApi(dirUri);
    } catch {
      // verified below
    }
  }
  if (!(await dirExistsAsync(dirUri))) {
    throw new Error('La cartella sul telefono non è pronta. Riprova.');
  }
}

export async function ensureDirAsync(uri: string): Promise<void> {
  try {
    await createDirLegacyAsync(uri);
  } catch {
    // iCloud può essere lento: la scrittura fallirà se la cartella non c’è.
  }
}

/** Surfaces creation errors — required before downloadAsync. */
export async function ensureDirStrictAsync(uri: string): Promise<void> {
  await createDirLegacyAsync(uri);
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
  await ensureDirStrictAsync(parentDirUri(fileUri));
}
