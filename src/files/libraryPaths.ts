import { Directory, Paths } from 'expo-file-system';

export function documentsDirectory(): Directory {
  return Paths.document;
}

/** User-facing folder: Files → On My iPhone → ReWavier → Audio */
export function audioDirectory(): Directory {
  const dir = new Directory(Paths.document, 'Audio');
  if (!dir.exists) {
    dir.create();
  }
  return dir;
}

export function libraryDirectory(): Directory {
  const dir = new Directory(Paths.document, 'rewavier');
  if (!dir.exists) {
    dir.create();
  }
  return dir;
}

function ensureDir(name: string): Directory {
  const dir = new Directory(libraryDirectory(), name);
  if (!dir.exists) {
    dir.create();
  }
  return dir;
}

export function inboxDirectory(): Directory {
  return ensureDir('inbox');
}

export function downloadsDirectory(): Directory {
  return ensureDir('downloads');
}
