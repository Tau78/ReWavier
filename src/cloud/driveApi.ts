import { File } from 'expo-file-system';
import * as LegacyFS from 'expo-file-system/legacy';

import {
  DRIVE_LIST_TIMEOUT_MS,
  DriveSlowError,
  isAbortError,
  isDriveSlowError,
} from '../domain/albumRefresh';
import { DownloadPausedError, isDownloadPausedError } from '../domain/collectionDownloadVisual';
import { softDownloadFraction } from '../domain/downloadProgress';
import { ensureParentDirAsync } from '../files/fsSafe';
import { throwIfDownloadPaused, useDownloadProgressStore } from '../store/downloadProgressStore';

import { googleTokenHasDriveScope } from '../auth/googleAuthResult';
import { getValidGoogleAccessToken, loadGoogleAuth } from '../auth/googleToken';
import { inboxDirectory } from '../files/libraryPaths';
import { folderBelongsOnSharedTab, parseDriveFolderLink } from './driveFolderLink';
import { roleFromDriveCapabilities, type FolderRole } from '../domain/folderRole';
import {
  SHARED_DRIVES_SIDECAR_NAME,
  loadPinnedSharedDrives,
  mergeSharedDrivePins,
  parseSharedDriveCatalog,
  rememberSharedDrives,
  savePinnedSharedDrives,
  serializeSharedDriveCatalog,
  sortSharedDriveEntries,
  type SharedDrivePin,
} from './sharedDriveCatalog';

const DRIVE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const DRIVE_FIELDS = 'id,name,mimeType,modifiedTime,md5Checksum,size,driveId';
/** No byte progress for this long → abort (VPN / hung native download). */
const DOWNLOAD_STALL_MS = 90_000;
/** Absolute ceiling for one file download. */
const DOWNLOAD_HARD_MS = 12 * 60_000;
const DOWNLOAD_TOO_SLOW = 'Drive ci ha messo troppo. Riprova.';

export const DRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder';

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  md5Checksum?: string;
  size?: string;
  /** Present on items that live in a Shared Drive. */
  driveId?: string;
  ownedByMe?: boolean;
};

export function isDriveFolder(file: Pick<DriveFile, 'mimeType'>): boolean {
  return file.mimeType === DRIVE_FOLDER_MIME;
}

async function token(): Promise<string> {
  return getValidGoogleAccessToken();
}

function driveErrorMessage(status: number): string {
  if (status === 401) {
    return 'Sessione Google scaduta. Accedi di nuovo con Google.';
  }
  if (status === 403) {
    return 'ReWavier non vede le cartelle. Esci e entra di nuovo con Google.';
  }
  return 'Drive non ha aperto le cartelle. Riprova tra poco.';
}

/** Parse Drive JSON after HTTP ok. Never throws SyntaxError — sync/import can catch this. */
async function safeJsonParse<T>(response: Response, context: string): Promise<T> {
  const raw = (await response.text()).trim();
  if (!raw) {
    throw new Error(`Drive ${context}: risposta vuota dopo HTTP ok.`);
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(`Drive ${context}: risposta non JSON dopo HTTP ok.`);
  }
}

async function fetchDriveOnce(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (isAbortError(error) || controller.signal.aborted) {
      throw new DriveSlowError();
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchDrive(url: string, init: RequestInit, timeoutMs = DRIVE_LIST_TIMEOUT_MS): Promise<Response> {
  try {
    return await fetchDriveOnce(url, init, timeoutMs);
  } catch (error) {
    if (isDriveSlowError(error)) {
      return fetchDriveOnce(url, init, timeoutMs);
    }
    throw error;
  }
}

async function driveGet<T>(path: string): Promise<T> {
  const call = async (access: string) =>
    fetchDrive(`${DRIVE}${path}`, {
      headers: { Authorization: `Bearer ${access}` },
    });
  let response = await call(await token());
  if (response.status === 401) {
    response = await call(await getValidGoogleAccessToken(true));
  }
  if (!response.ok) {
    throw new Error(driveErrorMessage(response.status));
  }
  return safeJsonParse<T>(response, `GET ${path}`);
}

export async function hasDriveToken(): Promise<boolean> {
  const auth = await loadGoogleAuth();
  if (!auth?.accessToken) {
    return false;
  }
  if (!auth.scope) {
    return true;
  }
  return googleTokenHasDriveScope(auth.scope);
}

function nameContainsFilter(query?: string): string {
  const needle = query?.trim();
  if (!needle) {
    return '';
  }
  return ` and name contains '${needle.replace(/'/g, "\\'")}'`;
}

export async function listDriveFolders(query?: string): Promise<DriveFile[]> {
  const q = encodeURIComponent(
    `mimeType = 'application/vnd.google-apps.folder' and trashed = false and 'me' in owners${nameContainsFilter(query)}`,
  );
  const fields = 'files(id,name,mimeType,modifiedTime)';
  const mine = `/files?q=${q}&pageSize=40&fields=${fields}&orderBy=${encodeURIComponent('modifiedTime desc')}&corpora=user`;
  const files = (await driveGet<{ files?: DriveFile[] }>(mine)).files ?? [];
  return [...files].sort((a, b) => (b.modifiedTime ?? '').localeCompare(a.modifiedTime ?? ''));
}

export type SharedDriveKind = 'shared-drive' | 'shared-folder';

export type SharedDriveEntry = DriveFile & { sharedKind: SharedDriveKind };

function sharedKindFor(file: Pick<DriveFile, 'id' | 'driveId'>): SharedDriveKind {
  return file.driveId && file.driveId === file.id ? 'shared-drive' : 'shared-folder';
}

function entryFromPin(pin: SharedDrivePin): SharedDriveEntry {
  return {
    id: pin.id,
    name: pin.name,
    mimeType: DRIVE_FOLDER_MIME,
    driveId: pin.id,
    sharedKind: 'shared-drive',
  };
}

async function driveGetText(path: string): Promise<string> {
  const call = async (access: string) =>
    fetchDrive(`${DRIVE}${path}`, {
      headers: { Authorization: `Bearer ${access}` },
    });
  let response = await call(await token());
  if (response.status === 401) {
    response = await call(await getValidGoogleAccessToken(true));
  }
  if (!response.ok) {
    throw new Error(driveErrorMessage(response.status));
  }
  return (await response.text()).trim();
}

async function findSharedDrivesSidecar(): Promise<DriveFile | null> {
  const q = encodeURIComponent(`name = '${SHARED_DRIVES_SIDECAR_NAME}' and trashed = false`);
  const files = await listFoldersQuiet(
    `/files?q=${q}&pageSize=1&fields=files(id,name)&corpora=user&orderBy=${encodeURIComponent('modifiedTime desc')}`,
  );
  return files[0] ?? null;
}

async function readSharedDrivesSidecar(): Promise<SharedDrivePin[]> {
  try {
    const file = await findSharedDrivesSidecar();
    if (!file) {
      return [];
    }
    const raw = await driveGetText(`/files/${encodeURIComponent(file.id)}?alt=media`);
    if (!raw) {
      return [];
    }
    return parseSharedDriveCatalog(JSON.parse(raw) as unknown);
  } catch {
    return [];
  }
}

async function writeSharedDrivesSidecar(pins: SharedDrivePin[]): Promise<void> {
  if (pins.length === 0) {
    return;
  }
  const tmp = new File(inboxDirectory(), 'shared-drives-sidecar.json');
  try {
    tmp.write(serializeSharedDriveCatalog(pins));
    const existing = await findSharedDrivesSidecar();
    if (existing) {
      await updateDriveFileMedia(existing.id, tmp.uri, 'application/json');
    } else {
      await uploadDriveFile({
        name: SHARED_DRIVES_SIDECAR_NAME,
        folderId: 'root',
        fileUri: tmp.uri,
        mimeType: 'application/json',
      });
    }
  } catch {
    // drive.file may not write this file; the list on the phone still works.
  } finally {
    try {
      if (tmp.exists) {
        tmp.delete();
      }
    } catch {
      // temp
    }
  }
}

function persistSharedDrivesInBackground(pins: SharedDrivePin[], mode: 'merge' | 'replace' = 'merge'): void {
  if (pins.length === 0) {
    return;
  }
  const save = mode === 'replace' ? savePinnedSharedDrives(pins) : rememberSharedDrives(pins);
  void save.then((merged) => writeSharedDrivesSidecar(merged)).catch(() => undefined);
}

/** Remember a Shared Drive root so Drive Condivisi lists it like on iPhone. */
export async function rememberSharedDriveFromFolder(
  folder: Pick<DriveFile, 'id' | 'name' | 'driveId'> & { sharedKind?: SharedDriveKind },
): Promise<void> {
  const driveId =
    folder.driveId ||
    (folder.sharedKind === 'shared-drive' ? folder.id : undefined);
  if (!driveId) {
    return;
  }
  let name = folder.driveId && folder.driveId !== folder.id ? '' : folder.name;
  if (!name) {
    const root = await getDriveFile(driveId);
    if (root?.name) {
      name = root.name;
    }
  }
  if (!name) {
    name = folder.name;
  }
  const merged = await rememberSharedDrives([{ id: driveId, name }]);
  void writeSharedDrivesSidecar(merged).catch(() => undefined);
}

async function listFoldersQuiet(path: string): Promise<DriveFile[]> {
  try {
    return (await driveGet<{ files?: DriveFile[] }>(path)).files ?? [];
  } catch {
    return [];
  }
}

async function listDriveRootsQuiet(
  path: string,
  key: 'drives' | 'teamDrives',
): Promise<SharedDrivePin[]> {
  try {
    const data = await driveGet<Record<string, { id?: string; name?: string }[] | undefined>>(path);
    const rows = data[key] ?? [];
    return rows
      .filter((drive): drive is { id: string; name: string } => Boolean(drive.id && drive.name))
      .map((drive) => ({ id: drive.id, name: drive.name }));
  } catch {
    return [];
  }
}

/** Shared Drives (team) plus folders someone shared with you. */
export async function listSharedDriveEntries(
  query?: string,
  extras?: { knownDrives?: SharedDrivePin[] },
): Promise<SharedDriveEntry[]> {
  const rawQuery = query?.trim() ?? '';
  const needle = rawQuery.toLowerCase();
  const linkId = rawQuery ? parseDriveFolderLink(rawQuery) : null;
  const matches = (name: string) => !needle || Boolean(linkId) || name.toLowerCase().includes(needle);

  const seen = new Set<string>();
  const out: SharedDriveEntry[] = [];
  const push = (entry: SharedDriveEntry) => {
    if (seen.has(entry.id) || !matches(entry.name)) {
      return;
    }
    seen.add(entry.id);
    out.push(entry);
  };

  if (linkId) {
    const file = await getDriveFile(linkId);
    if (file && isDriveFolder(file)) {
      push({ ...file, sharedKind: sharedKindFor(file) });
      void rememberSharedDriveFromFolder(file);
    }
    return out;
  }

  const pinned = mergeSharedDrivePins(await loadPinnedSharedDrives(), extras?.knownDrives ?? []);
  for (const pin of pinned) {
    push(entryFromPin(pin));
  }
  if (!needle && extras?.knownDrives && extras.knownDrives.length > 0) {
    persistSharedDrivesInBackground(extras.knownDrives);
  }

  let fromApi: SharedDrivePin[] = [];
  const driveQuery = needle
    ? `&q=${encodeURIComponent(`name contains '${needle.replace(/'/g, "\\'")}'`)}`
    : '';
  fromApi = await listDriveRootsQuiet(`/drives?pageSize=50&fields=drives(id,name)${driveQuery}`, 'drives');
  if (fromApi.length === 0) {
    fromApi = await listDriveRootsQuiet(
      `/teamdrives?pageSize=50&fields=teamDrives(id,name)${driveQuery}`,
      'teamDrives',
    );
  }
  for (const drive of fromApi) {
    push(entryFromPin(drive));
  }

  if (fromApi.length > 0) {
    persistSharedDrivesInBackground(fromApi, 'replace');
  } else if (pinned.length === 0) {
    // Same Google account on another phone can reuse this list. Not required: each phone lists on its own.
    const remote = await readSharedDrivesSidecar();
    for (const pin of remote) {
      push(entryFromPin(pin));
    }
    persistSharedDrivesInBackground(remote);
  } else {
    void readSharedDrivesSidecar()
      .then((remote) => persistSharedDrivesInBackground(remote))
      .catch(() => undefined);
  }

  const folderFields = 'files(id,name,mimeType,modifiedTime,driveId,ownedByMe)';
  const inSharedDrivesQ = encodeURIComponent(
    `mimeType = 'application/vnd.google-apps.folder' and trashed = false and not 'me' in owners${nameContainsFilter(rawQuery)}`,
  );
  const sharedWithMeQ = encodeURIComponent(
    `mimeType = 'application/vnd.google-apps.folder' and trashed = false and sharedWithMe = true and not 'me' in owners${nameContainsFilter(rawQuery)}`,
  );
  const [fromSharedDrives, fromSharedWithMe] = await Promise.all([
    listFoldersQuiet(
      `/files?q=${inSharedDrivesQ}&pageSize=40&fields=${folderFields}&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives`,
    ),
    listFoldersQuiet(
      `/files?q=${sharedWithMeQ}&pageSize=40&fields=${folderFields}&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    ),
  ]);
  const listed = [...fromSharedDrives, ...fromSharedWithMe].filter(folderBelongsOnSharedTab);
  const driveIds = new Set<string>();
  for (const folder of listed) {
    if (folder.driveId) {
      driveIds.add(folder.driveId);
    }
  }
  for (const id of driveIds) {
    if (seen.has(id)) {
      continue;
    }
    const asRoot = listed.find((folder) => folder.id === id);
    let name = asRoot?.name ?? '';
    if (!name) {
      const meta = await getDriveFile(id);
      name = meta?.name ?? listed.find((folder) => folder.driveId === id)?.name ?? '';
    }
    if (name) {
      push(entryFromPin({ id, name }));
    }
  }
  for (const folder of listed) {
    if (folder.driveId && seen.has(folder.driveId) && folder.id !== folder.driveId) {
      continue;
    }
    push({ ...folder, sharedKind: sharedKindFor(folder) });
  }

  return sortSharedDriveEntries(out);
}

export async function fetchFolderRole(folderId: string): Promise<FolderRole> {
  const fields = 'ownedByMe,capabilities(canEdit,canComment)';
  const data = await driveGet<{
    ownedByMe?: boolean;
    capabilities?: { canEdit?: boolean; canComment?: boolean };
  }>(
    `/files/${encodeURIComponent(folderId)}?fields=${encodeURIComponent(fields)}&supportsAllDrives=true`,
  );
  return roleFromDriveCapabilities(data);
}

export async function getDriveFile(fileId: string): Promise<DriveFile | null> {
  try {
    return await driveGet<DriveFile>(
      `/files/${encodeURIComponent(fileId)}?supportsAllDrives=true&fields=${encodeURIComponent(DRIVE_FIELDS)}`,
    );
  } catch {
    return null;
  }
}

export async function createDriveFolder(name: string, parentId?: string): Promise<DriveFile> {
  const body: Record<string, unknown> = {
    name,
    mimeType: 'application/vnd.google-apps.folder',
  };
  if (parentId) {
    body.parents = [parentId];
  }
  const call = async (access: string) =>
    fetch(`${DRIVE}/files?supportsAllDrives=true&fields=${encodeURIComponent(DRIVE_FIELDS)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${access}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify(body),
    });
  let response = await call(await token());
  if (response.status === 401) {
    response = await call(await getValidGoogleAccessToken(true));
  }
  if (!response.ok) {
    throw new Error(driveErrorMessage(response.status));
  }
  return safeJsonParse<DriveFile>(response, 'createFolder');
}

export async function findFolderByName(name: string): Promise<DriveFile | null> {
  const [mine, shared] = await Promise.all([listDriveFolders(name), listSharedDriveEntries(name)]);
  const folders = [...mine, ...shared];
  const lower = name.trim().toLowerCase();
  return folders.find((folder) => folder.name.toLowerCase() === lower) ?? folders[0] ?? null;
}

/** Cap on Drive list pages per folder (100 files/page → 800 max). */
const FOLDER_MAX_PAGES = 8;

export type DriveFolderChildrenResult = {
  files: DriveFile[];
  /** True when listing stopped at FOLDER_MAX_PAGES with more pages left. */
  truncated: boolean;
};

export async function listFolderChildren(
  folderId: string,
  options?: { sharedDriveId?: string },
): Promise<DriveFolderChildrenResult> {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
  const driveScope = options?.sharedDriveId
    ? `&corpora=drive&driveId=${encodeURIComponent(options.sharedDriveId)}`
    : '';
  const files: DriveFile[] = [];
  let page: string | undefined;
  for (let i = 0; i < FOLDER_MAX_PAGES; i += 1) {
    const tokenParam = page ? `&pageToken=${encodeURIComponent(page)}` : '';
    const data = await driveGet<{ files?: DriveFile[]; nextPageToken?: string }>(
      `/files?q=${q}&pageSize=100&fields=nextPageToken,files(id,name,mimeType,modifiedTime,md5Checksum,size)&supportsAllDrives=true&includeItemsFromAllDrives=true${driveScope}${tokenParam}`,
    );
    files.push(...(data.files ?? []));
    page = data.nextPageToken;
    if (!page) {
      break;
    }
  }
  // Still have nextPageToken after the page cap → incomplete folder listing.
  return { files, truncated: Boolean(page) };
}

const TREE_MAX_NODES = 80;

export type DriveFolderTreeNode = {
  id: string;
  parentId: string | null;
  name: string;
  children: DriveFile[];
};

export type DriveFolderTreeResult = {
  nodes: DriveFolderTreeNode[];
  /**
   * True when the walk hit TREE_MAX_NODES with folders still queued, or any
   * folder listing hit FOLDER_MAX_PAGES. Callers must not treat the remote
   * view as complete (no surplus local deletes).
   */
  truncated: boolean;
};

/** Root first. `maxDepth` 0 = only this folder’s children. */
export async function listDriveFolderTree(
  folderId: string,
  folderName: string,
  maxDepth: number,
  options?: { sharedDriveId?: string },
): Promise<DriveFolderTreeResult> {
  const nodes: DriveFolderTreeNode[] = [];
  const queue: { id: string; parentId: string | null; name: string; depth: number }[] = [
    { id: folderId, parentId: null, name: folderName, depth: 0 },
  ];
  const seen = new Set<string>();
  let truncated = false;
  while (queue.length > 0 && nodes.length < TREE_MAX_NODES) {
    const current = queue.shift();
    if (!current || seen.has(current.id)) {
      continue;
    }
    seen.add(current.id);
    const listed = await listFolderChildren(current.id, options);
    if (listed.truncated) {
      truncated = true;
    }
    nodes.push({
      id: current.id,
      parentId: current.parentId,
      name: current.name,
      children: listed.files,
    });
    if (current.depth >= maxDepth) {
      continue;
    }
    for (const child of listed.files.filter(isDriveFolder)) {
      queue.push({
        id: child.id,
        parentId: current.id,
        name: child.name,
        depth: current.depth + 1,
      });
    }
  }
  // Stopped because of TREE_MAX_NODES while folders remain → incomplete tree.
  if (queue.length > 0) {
    truncated = true;
  }
  return { nodes, truncated };
}

function friendlyDownloadError(error: unknown): Error {
  if (isDownloadPausedError(error) || useDownloadProgressStore.getState().pauseRequested) {
    return error instanceof DownloadPausedError ? error : new DownloadPausedError();
  }
  const raw = error instanceof Error ? error.message : String(error ?? '');
  if (raw === DOWNLOAD_TOO_SLOW || /ci ha messo troppo/i.test(raw)) {
    return new Error(DOWNLOAD_TOO_SLOW);
  }
  if (
    /downloadAsync|does not exist|makeDirectory|ENOENT|Directory '/i.test(raw) ||
    raw.includes('file://') ||
    raw.includes('/Users/') ||
    raw.includes('Containers/')
  ) {
    return new Error('Questo brano non è arrivato sul telefono. Riprova.');
  }
  return error instanceof Error ? error : new Error('Questo brano non è arrivato sul telefono. Riprova.');
}

/** Parse Drive upload/update JSON body. Never throws SyntaxError — syncEngine can catch this. */
function parseDriveUploadBody(body: string, context: 'upload' | 'update'): DriveFile {
  const raw = typeof body === 'string' ? body.trim() : '';
  if (!raw) {
    throw new Error(`Drive ${context}: risposta vuota dopo HTTP ok.`);
  }
  try {
    const parsed = JSON.parse(raw) as DriveFile;
    if (parsed && typeof parsed === 'object' && typeof parsed.id === 'string' && parsed.id.length > 0) {
      return parsed;
    }
  } catch {
    // empty / HTML / non-JSON
  }
  throw new Error(`Drive ${context}: risposta non JSON dopo HTTP ok.`);
}

async function downloadDriveFileOnce(
  fileId: string,
  destUri: string,
  access: string,
  onProgress?: (fraction: number) => void,
): Promise<string> {
  const url = `${DRIVE}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`;
  // downloadAsync (legacy) does not create parents — inbox is often missing on first import.
  await ensureParentDirAsync(destUri);
  const dest = new File(destUri);
  if (dest.exists) {
    dest.delete();
  }
  const headers = { Authorization: `Bearer ${access}` };
  throwIfDownloadPaused();

  let lastBytes = 0;
  let lastProgressAt = Date.now();
  const startedAt = Date.now();
  let abortedForStall = false;

  const resumable = LegacyFS.createDownloadResumable(url, destUri, { headers }, ({
    totalBytesWritten,
    totalBytesExpectedToWrite,
  }) => {
    if (totalBytesWritten > lastBytes) {
      lastBytes = totalBytesWritten;
      lastProgressAt = Date.now();
    }
    if (totalBytesExpectedToWrite > 0) {
      onProgress?.(totalBytesWritten / totalBytesExpectedToWrite);
      return;
    }
    if (totalBytesWritten > 0) {
      onProgress?.(softDownloadFraction(totalBytesWritten));
    }
  });
  useDownloadProgressStore.getState().setCurrentCancel(() => {
    void resumable.pauseAsync();
  });

  const watch = setInterval(() => {
    const now = Date.now();
    if (now - lastProgressAt > DOWNLOAD_STALL_MS || now - startedAt > DOWNLOAD_HARD_MS) {
      abortedForStall = true;
      void resumable.pauseAsync();
    }
  }, 4_000);

  try {
    const result = await resumable.downloadAsync();
    throwIfDownloadPaused();
    if (abortedForStall) {
      throw new Error(DOWNLOAD_TOO_SLOW);
    }
    if (result?.status === 401) {
      throw new Error('Sessione Google scaduta. Accedi di nuovo con Google.');
    }
    if (!result || result.status !== 200) {
      throw new Error('Drive non ha scaricato il brano. Riprova.');
    }
    if (dest.exists) {
      return dest.uri;
    }
    return result.uri;
  } catch (error) {
    if (abortedForStall) {
      throw new Error(DOWNLOAD_TOO_SLOW);
    }
    if (isDownloadPausedError(error) || useDownloadProgressStore.getState().pauseRequested) {
      throw new DownloadPausedError();
    }
    throw friendlyDownloadError(error);
  } finally {
    clearInterval(watch);
    useDownloadProgressStore.getState().setCurrentCancel(null);
  }
}

export async function downloadDriveFile(
  fileId: string,
  destUri: string,
  onProgress?: (fraction: number) => void,
): Promise<string> {
  try {
    return await downloadDriveFileOnce(fileId, destUri, await token(), onProgress);
  } catch (error) {
    if (isDownloadPausedError(error) || useDownloadProgressStore.getState().pauseRequested) {
      throw new DownloadPausedError();
    }
    const raw = error instanceof Error ? error.message : String(error ?? '');
    const authFail =
      /Sessione Google scaduta|401|unauthorized/i.test(raw) ||
      raw.includes('Google Drive non collegato');
    if (!authFail) {
      throw friendlyDownloadError(error);
    }
    try {
      const access = await getValidGoogleAccessToken(true);
      return await downloadDriveFileOnce(fileId, destUri, access, onProgress);
    } catch (retryError) {
      if (isDownloadPausedError(retryError) || useDownloadProgressStore.getState().pauseRequested) {
        throw new DownloadPausedError();
      }
      throw friendlyDownloadError(retryError);
    }
  }
}

export async function getDriveFileParentId(fileId: string): Promise<string | undefined> {
  const data = await driveGet<{ parents?: string[] }>(
    `/files/${encodeURIComponent(fileId)}?supportsAllDrives=true&fields=parents`,
  );
  return data.parents?.[0];
}

export async function findChildByName(folderId: string, name: string): Promise<DriveFile | null> {
  const lower = name.trim().toLowerCase();
  const { files } = await listFolderChildren(folderId);
  return files.find((file) => file.name.toLowerCase() === lower) ?? null;
}

export async function uploadDriveFile(params: {
  name: string;
  folderId: string;
  fileUri: string;
  mimeType: string;
}): Promise<DriveFile> {
  const access = await token();
  const init = await fetch(
    `${DRIVE_UPLOAD}/files?uploadType=resumable&supportsAllDrives=true&fields=${encodeURIComponent(DRIVE_FIELDS)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${access}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': params.mimeType,
      },
      body: JSON.stringify({
        name: params.name,
        parents: [params.folderId],
        mimeType: params.mimeType,
      }),
    },
  );
  if (init.status === 401) {
    throw new Error('Sessione Google scaduta. Accedi di nuovo con Google.');
  }
  if (init.status === 403) {
    throw new Error('Ricollega Google per caricare sulla cartella Drive.');
  }
  if (!init.ok) {
    throw new Error(`Drive upload ${init.status}`);
  }
  const session = init.headers.get('Location');
  if (!session) {
    throw new Error('Drive non ha aperto la sessione di upload.');
  }
  const result = await LegacyFS.uploadAsync(session, params.fileUri, {
    httpMethod: 'PUT',
    headers: {
      Authorization: `Bearer ${access}`,
      'Content-Type': params.mimeType,
    },
    uploadType: LegacyFS.FileSystemUploadType.BINARY_CONTENT,
  });
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`Drive upload ${result.status}`);
  }
  return parseDriveUploadBody(result.body, 'upload');
}

export async function updateDriveFileMedia(
  fileId: string,
  fileUri: string,
  mimeType: string,
): Promise<DriveFile> {
  const access = await token();
  const result = await LegacyFS.uploadAsync(
    `${DRIVE_UPLOAD}/files/${encodeURIComponent(fileId)}?uploadType=media&supportsAllDrives=true&fields=${encodeURIComponent(DRIVE_FIELDS)}`,
    fileUri,
    {
      httpMethod: 'PATCH',
      headers: {
        Authorization: `Bearer ${access}`,
        'Content-Type': mimeType,
      },
      uploadType: LegacyFS.FileSystemUploadType.BINARY_CONTENT,
    },
  );
  if (result.status === 401) {
    throw new Error('Sessione Google scaduta. Accedi di nuovo con Google.');
  }
  if (result.status === 403) {
    throw new Error('Ricollega Google per aggiornare il file su Drive.');
  }
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`Drive update ${result.status}`);
  }
  try {
    return parseDriveUploadBody(result.body, 'update');
  } catch {
    // Media update succeeded; body may still be empty/HTML. Callers already know fileId.
    return { id: fileId, name: '', mimeType };
  }
}

export async function renameDriveFile(fileId: string, name: string): Promise<DriveFile> {
  const call = async (access: string) =>
    fetch(
      `${DRIVE}/files/${encodeURIComponent(fileId)}?supportsAllDrives=true&fields=${encodeURIComponent(DRIVE_FIELDS)}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${access}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
        body: JSON.stringify({ name }),
      },
    );
  let response = await call(await token());
  if (response.status === 401) {
    response = await call(await getValidGoogleAccessToken(true));
  }
  if (!response.ok) {
    throw new Error(driveErrorMessage(response.status));
  }
  return safeJsonParse<DriveFile>(response, 'rename');
}

export async function deleteDriveFile(fileId: string): Promise<void> {
  const access = await token();
  const response = await fetch(
    `${DRIVE}/files/${encodeURIComponent(fileId)}?supportsAllDrives=true`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${access}` },
    },
  );
  if (response.status === 404 || response.status === 204 || response.ok) {
    return;
  }
  throw new Error(driveErrorMessage(response.status));
}
