import { File } from 'expo-file-system';
import * as LegacyFS from 'expo-file-system/legacy';

import { getValidGoogleAccessToken, loadGoogleAuth } from '../auth/googleToken';

const DRIVE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const DRIVE_FIELDS = 'id,name,mimeType,modifiedTime,md5Checksum,size';

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  md5Checksum?: string;
  size?: string;
};

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

async function driveGet<T>(path: string): Promise<T> {
  const call = async (access: string) =>
    fetch(`${DRIVE}${path}`, {
      headers: { Authorization: `Bearer ${access}` },
    });
  let response = await call(await token());
  if (response.status === 401) {
    response = await call(await getValidGoogleAccessToken(true));
  }
  if (!response.ok) {
    throw new Error(driveErrorMessage(response.status));
  }
  return (await response.json()) as T;
}

export async function hasDriveToken(): Promise<boolean> {
  return Boolean((await loadGoogleAuth())?.accessToken);
}

export async function listDriveFolders(query?: string): Promise<DriveFile[]> {
  const nameFilter = query?.trim()
    ? ` and name contains '${query.trim().replace(/'/g, "\\'")}'`
    : '';
  const q = encodeURIComponent(
    `mimeType = 'application/vnd.google-apps.folder' and trashed = false${nameFilter}`,
  );
  const fields = 'files(id,name,mimeType,modifiedTime)';
  const shared = `/files?q=${q}&pageSize=40&fields=${fields}&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives`;
  const mine = `/files?q=${q}&pageSize=40&fields=${fields}&orderBy=${encodeURIComponent('modifiedTime desc')}`;
  let files: DriveFile[] = [];
  try {
    files = (await driveGet<{ files?: DriveFile[] }>(shared)).files ?? [];
  } catch {
    files = (await driveGet<{ files?: DriveFile[] }>(mine)).files ?? [];
  }
  return [...files].sort((a, b) => (b.modifiedTime ?? '').localeCompare(a.modifiedTime ?? ''));
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
  return (await response.json()) as DriveFile;
}

export async function findFolderByName(name: string): Promise<DriveFile | null> {
  const folders = await listDriveFolders(name);
  const lower = name.trim().toLowerCase();
  return folders.find((folder) => folder.name.toLowerCase() === lower) ?? folders[0] ?? null;
}

export async function listFolderChildren(folderId: string): Promise<DriveFile[]> {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
  const files: DriveFile[] = [];
  let page: string | undefined;
  for (let i = 0; i < 8; i += 1) {
    const tokenParam = page ? `&pageToken=${encodeURIComponent(page)}` : '';
    const data = await driveGet<{ files?: DriveFile[]; nextPageToken?: string }>(
      `/files?q=${q}&pageSize=100&fields=nextPageToken,files(id,name,mimeType,modifiedTime,md5Checksum,size)&supportsAllDrives=true&includeItemsFromAllDrives=true${tokenParam}`,
    );
    files.push(...(data.files ?? []));
    page = data.nextPageToken;
    if (!page) {
      break;
    }
  }
  return files;
}

export async function downloadDriveFile(fileId: string, destUri: string): Promise<string> {
  const access = await token();
  const url = `${DRIVE}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`;
  const dest = new File(destUri);
  if (dest.exists) {
    dest.delete();
  }
  const result = await LegacyFS.downloadAsync(url, destUri, {
    headers: { Authorization: `Bearer ${access}` },
  });
  if (result.status !== 200) {
    throw new Error(`Download Drive non riuscito (${result.status})`);
  }
  return result.uri;
}

export async function getDriveFileParentId(fileId: string): Promise<string | undefined> {
  const data = await driveGet<{ parents?: string[] }>(
    `/files/${encodeURIComponent(fileId)}?supportsAllDrives=true&fields=parents`,
  );
  return data.parents?.[0];
}

export async function findChildByName(folderId: string, name: string): Promise<DriveFile | null> {
  const lower = name.trim().toLowerCase();
  const children = await listFolderChildren(folderId);
  return children.find((file) => file.name.toLowerCase() === lower) ?? null;
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
  return JSON.parse(result.body) as DriveFile;
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
  return JSON.parse(result.body) as DriveFile;
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
  return (await response.json()) as DriveFile;
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
