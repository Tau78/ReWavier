import { Directory, Paths } from 'expo-file-system';

import { getActiveLibraryOwner } from './libraryOwner';

function createDir(dir: Directory): Directory {
  dir.create({ intermediates: true, idempotent: true });
  return dir;
}

function createDirIfNeeded(dir: Directory): Directory {
  try {
    createDir(dir);
  } catch {
    // listing and recover tolerate a missing folder
  }
  return dir;
}

export function documentsDirectory(): Directory {
  return Paths.document;
}

/** Shared Audio folder (legacy files stay here). */
export function sharedAudioDirectory(): Directory {
  return new Directory(Paths.document, 'Audio');
}

/** This account’s audio. Files → ReWavier → Audio → (cartella dell’accesso) */
export function audioDirectory(): Directory {
  const owner = getActiveLibraryOwner();
  if (owner) {
    return new Directory(Paths.document, 'Audio', owner);
  }
  return sharedAudioDirectory();
}

export function libraryDirectory(): Directory {
  return new Directory(Paths.document, 'rewavier');
}

export function userLibraryDirectory(owner = getActiveLibraryOwner()): Directory {
  if (!owner) {
    return libraryDirectory();
  }
  return new Directory(libraryDirectory(), 'users', owner);
}

export async function ensureAudioDirectory(): Promise<Directory> {
  return createDir(audioDirectory());
}

export async function ensureLibraryDirectory(): Promise<Directory> {
  return createDir(libraryDirectory());
}

function childDirectory(name: string): Directory {
  return new Directory(libraryDirectory(), name);
}

async function ensureChildDirectory(name: string): Promise<Directory> {
  return createDir(childDirectory(name));
}

export function inboxDirectory(): Directory {
  return createDirIfNeeded(childDirectory('inbox'));
}

export function downloadsDirectory(): Directory {
  return createDirIfNeeded(childDirectory('downloads'));
}

export async function ensureInboxDirectory(): Promise<Directory> {
  return ensureChildDirectory('inbox');
}

export async function ensureDownloadsDirectory(): Promise<Directory> {
  return ensureChildDirectory('downloads');
}
