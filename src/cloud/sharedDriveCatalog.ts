/** Pins saved on this phone. A copy on Drive helps the same Google account on another phone. */
/** Keep `scripts/check-shared-drive-catalog.mjs` in sync. */

import * as LegacyFS from 'expo-file-system/legacy';

import { ensureDirAsync, pathExistsAsync, withTimeout } from '../files/fsSafe';
import { userLibraryDirectory } from '../files/libraryPaths';

export type SharedDrivePin = { id: string; name: string };

export const SHARED_DRIVES_SIDECAR_NAME = '.rewavier-shared-drives.json';
const CATALOG_FILE = 'shared-drives.json';
const PIN_ID_RE = /^[a-zA-Z0-9_-]{10,}$/;

function catalogFileUri(): string {
  return `${userLibraryDirectory().uri}/${CATALOG_FILE}`;
}

export function isSharedDrivePinId(id: string): boolean {
  return PIN_ID_RE.test(id.trim());
}

export function parseSharedDriveCatalog(raw: unknown): SharedDrivePin[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return [];
  }
  const drives = (raw as { drives?: unknown }).drives;
  if (!Array.isArray(drives)) {
    return [];
  }
  const out: SharedDrivePin[] = [];
  const seen = new Set<string>();
  for (const item of drives) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const id = typeof (item as { id?: unknown }).id === 'string' ? (item as { id: string }).id.trim() : '';
    const name =
      typeof (item as { name?: unknown }).name === 'string' ? (item as { name: string }).name.trim() : '';
    if (!isSharedDrivePinId(id) || !name || seen.has(id)) {
      continue;
    }
    seen.add(id);
    out.push({ id, name });
  }
  return out;
}

export function serializeSharedDriveCatalog(pins: SharedDrivePin[]): string {
  return JSON.stringify({ version: 1, drives: mergeSharedDrivePins(pins) });
}

export function mergeSharedDrivePins(...groups: SharedDrivePin[][]): SharedDrivePin[] {
  const byId = new Map<string, SharedDrivePin>();
  for (const group of groups) {
    for (const pin of group) {
      const id = pin.id.trim();
      const name = pin.name.trim();
      if (!isSharedDrivePinId(id) || !name) {
        continue;
      }
      byId.set(id, { id, name });
    }
  }
  return [...byId.values()];
}

/** Unique Shared Drive roots already linked as albums on this phone.
 * Nested folders (es. «#Album» inside DPB) only contribute the Drive id — never the folder name. */
export function pinsFromAlbums(
  albums: {
    name: string;
    driveFolderName?: string;
    driveFolderId?: string;
    driveSharedDriveId?: string;
  }[],
): SharedDrivePin[] {
  const byId = new Map<string, SharedDrivePin>();
  for (const album of albums) {
    const id = album.driveSharedDriveId?.trim() ?? '';
    if (!isSharedDrivePinId(id)) {
      continue;
    }
    const isRoot = album.driveFolderId === id;
    if (!isRoot) {
      if (!byId.has(id)) {
        byId.set(id, { id, name: '' });
      }
      continue;
    }
    const label = (album.driveFolderName || album.name).trim();
    if (!label) {
      continue;
    }
    byId.set(id, { id, name: label });
  }
  return [...byId.values()];
}

export function compareSharedDriveEntries(
  a: { sharedKind?: string; name: string },
  b: { sharedKind?: string; name: string },
): number {
  const rank = (kind?: string) => (kind === 'shared-drive' ? 0 : 1);
  const delta = rank(a.sharedKind) - rank(b.sharedKind);
  if (delta !== 0) {
    return delta;
  }
  return a.name.localeCompare(b.name, 'it', { sensitivity: 'base' });
}

export function sortSharedDriveEntries<T extends { sharedKind?: string; name: string }>(items: T[]): T[] {
  return [...items].sort(compareSharedDriveEntries);
}

export async function loadPinnedSharedDrives(): Promise<SharedDrivePin[]> {
  const uri = catalogFileUri();
  const exists = await withTimeout(pathExistsAsync(uri), 2000, false);
  if (!exists) {
    return [];
  }
  try {
    const raw = await withTimeout(LegacyFS.readAsStringAsync(uri), 3000, '');
    if (!raw) {
      return [];
    }
    return parseSharedDriveCatalog(JSON.parse(raw) as unknown);
  } catch {
    return [];
  }
}

export async function rememberSharedDrives(pins: SharedDrivePin[]): Promise<SharedDrivePin[]> {
  return writePinnedSharedDrives(mergeSharedDrivePins(await loadPinnedSharedDrives(), pins));
}

export async function savePinnedSharedDrives(pins: SharedDrivePin[]): Promise<SharedDrivePin[]> {
  return writePinnedSharedDrives(mergeSharedDrivePins(pins));
}

async function writePinnedSharedDrives(merged: SharedDrivePin[]): Promise<SharedDrivePin[]> {
  await ensureDirAsync(userLibraryDirectory().uri);
  await LegacyFS.writeAsStringAsync(catalogFileUri(), serializeSharedDriveCatalog(merged));
  return merged;
}
