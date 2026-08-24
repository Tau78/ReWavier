import { Directory, Paths } from 'expo-file-system';

import { ensureDirAsync } from './fsSafe';
import { getActiveLibraryOwner, usesPrivateLibrary } from './libraryOwner';

export function documentsDirectory(): Directory {
  return Paths.document;
}

export function sharedAudioDirectory(): Directory {
  return new Directory(Paths.document, 'Audio');
}

/** Review login uses its own Audio folder so it cannot see someone else’s files. */
export function audioDirectory(): Directory {
  const owner = getActiveLibraryOwner();
  if (usesPrivateLibrary(owner) && owner) {
    return new Directory(Paths.document, 'Audio', owner);
  }
  return sharedAudioDirectory();
}

export function libraryDirectory(): Directory {
  return new Directory(Paths.document, 'rewavier');
}

export function userLibraryDirectory(owner = getActiveLibraryOwner()): Directory {
  if (usesPrivateLibrary(owner) && owner) {
    return new Directory(libraryDirectory(), 'users', owner);
  }
  return libraryDirectory();
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
