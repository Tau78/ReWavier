import { Directory, Paths } from 'expo-file-system';

import { ensureDirAsync } from './fsSafe';

export function documentsDirectory(): Directory {
  return Paths.document;
}

/** User-facing folder: Files → On My iPhone → ReWavier → Audio */
export function audioDirectory(): Directory {
  return new Directory(Paths.document, 'Audio');
}

export function libraryDirectory(): Directory {
  return new Directory(Paths.document, 'rewavier');
}

export async function ensureAudioDirectory(): Promise<Directory> {
  const dir = audioDirectory();
  await ensureDirAsync(dir.uri);
  return dir;
}

export async function ensureLibraryDirectory(): Promise<Directory> {
  const dir = libraryDirectory();
  await ensureDirAsync(dir.uri);
  return dir;
}

function childDirectory(name: string): Directory {
  return new Directory(libraryDirectory(), name);
}

async function ensureChildDirectory(name: string): Promise<Directory> {
  const dir = childDirectory(name);
  await ensureDirAsync(dir.uri);
  return dir;
}

export function inboxDirectory(): Directory {
  return childDirectory('inbox');
}

export function downloadsDirectory(): Directory {
  return childDirectory('downloads');
}

export async function ensureInboxDirectory(): Promise<Directory> {
  return ensureChildDirectory('inbox');
}

export async function ensureDownloadsDirectory(): Promise<Directory> {
  return ensureChildDirectory('downloads');
}
