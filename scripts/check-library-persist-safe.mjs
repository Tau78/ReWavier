import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const persist = readFileSync(join(root, 'src/files/libraryPersist.ts'), 'utf8');
const store = readFileSync(join(root, 'src/store/libraryStore.ts'), 'utf8');
const app = readFileSync(join(root, 'src/app/AuthenticatedApp.tsx'), 'utf8');
const rootApp = readFileSync(join(root, 'App.tsx'), 'utf8');

assert.match(persist, /SNAPSHOT_BAK_NAME/);
assert.match(persist, /library\.json\.bak/);
assert.match(persist, /shouldPersistAfterHydrate/);
assert.match(persist, /isWeakerLibrarySnapshot/);
assert.match(persist, /incomingFolders/);
assert.match(persist, /dedupeAlbumsByDriveFolder/);
assert.match(persist, /copyAsync\(\{ from: dest, to: bak \}\)/);
assert.match(persist, /isMissingFileError/);
assert.match(persist, /probe !== 'exists'/);
assert.match(persist, /getInfoAsync\(fileUri\)/);
assert.match(persist, /pickRicherSnapshot/);
assert.match(persist, /Fail closed/);
assert.doesNotMatch(persist, /withTimeout\(/);
assert.doesNotMatch(persist, /exists = await pathExistsAsync\(uri\)/);
assert.doesNotMatch(persist, /pathExistsAsync\(uri\)/);

assert.match(store, /shouldPersistAfterHydrate/);
assert.match(store, /recoverLibraryFromDiskIfWeaker/);
assert.match(store, /scheduleLibraryPersistFlush/);
assert.match(store, /persistReady = allowPersist/);
assert.match(store, /if \(allowPersist\) \{\s*schedulePersist\(\);/s);
assert.match(store, /createAlbum[\s\S]*?void flushLibraryPersist\(\);/);
assert.match(store, /linkAlbumDrive[\s\S]*?void flushLibraryPersist\(\);/);

assert.match(app, /recoverLibraryFromDiskIfWeaker/);
assert.match(app, /scheduleLibraryPersistFlush/);
assert.match(app, /state === 'background' \|\| state === 'inactive'/);
assert.match(app, /addEventListener\('blur'/);
assert.match(rootApp, /scheduleLibraryPersistFlush/);

function uniquePersistIds(ids, cap = 400) {
  const out = [];
  const seen = new Set();
  for (const raw of ids ?? []) {
    const id = typeof raw === 'string' ? raw.trim() : '';
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    out.push(id);
  }
  return out.length > cap ? out.slice(out.length - cap) : out;
}

function albumSurvivesTombstones(album, removedAlbumIds, removedDriveFolderIds) {
  if (removedAlbumIds.has(album.id)) {
    return false;
  }
  const folderId = album.driveFolderId?.trim();
  return !(folderId && removedDriveFolderIds.has(folderId));
}

function isWeakerLibrarySnapshot(incoming, onDisk) {
  const removedAlbums = new Set(uniquePersistIds(incoming.removedAlbumIds));
  const removedFolders = new Set(uniquePersistIds(incoming.removedDriveFolderIds));
  const incomingAlbumIds = new Set(incoming.albums.map((album) => album.id));
  const incomingFolders = new Set(
    incoming.albums
      .map((album) => album.driveFolderId?.trim())
      .filter((id) => Boolean(id)),
  );
  for (const album of onDisk.albums) {
    if (!albumSurvivesTombstones(album, removedAlbums, removedFolders)) {
      continue;
    }
    if (incomingAlbumIds.has(album.id)) {
      continue;
    }
    const folderId = album.driveFolderId?.trim();
    if (folderId && incomingFolders.has(folderId)) {
      continue;
    }
    return true;
  }
  return false;
}

function shouldPersistAfterHydrate(result) {
  return result.status === 'loaded' || result.status === 'missing';
}

function isMissingFileError(error) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /not found|does not exist|ENOENT|No such file|FileNotFound|couldn['’]?t be opened|could not be opened|Unable to resolve|no such file or directory/i.test(
    message,
  );
}

assert.equal(shouldPersistAfterHydrate({ status: 'loaded', snapshot: {} }), true);
assert.equal(shouldPersistAfterHydrate({ status: 'missing' }), true);
assert.equal(shouldPersistAfterHydrate({ status: 'unreadable' }), false);

assert.equal(isMissingFileError(new Error('File not found')), true);
assert.equal(isMissingFileError(new Error('Permission denied')), false);

const disk = {
  albums: [{ id: 'a1', name: 'Band', driveFolderId: 'f1' }],
  playlists: [],
  removedAlbumIds: [],
  removedDriveFolderIds: [],
};
assert.equal(
  isWeakerLibrarySnapshot(
    { albums: [], playlists: [], removedAlbumIds: [], removedDriveFolderIds: [] },
    disk,
  ),
  true,
);
assert.equal(
  isWeakerLibrarySnapshot(
    {
      albums: [],
      playlists: [],
      removedAlbumIds: ['a1'],
      removedDriveFolderIds: ['f1'],
    },
    disk,
  ),
  false,
);
assert.equal(
  isWeakerLibrarySnapshot(
    {
      albums: [{ id: 'a1', name: 'Band', driveFolderId: 'f1' }],
      playlists: [],
      removedAlbumIds: [],
      removedDriveFolderIds: [],
    },
    disk,
  ),
  false,
);
assert.equal(
  isWeakerLibrarySnapshot(
    {
      albums: [{ id: 'a2', name: 'Band', driveFolderId: 'f1' }],
      playlists: [],
      removedAlbumIds: [],
      removedDriveFolderIds: [],
    },
    disk,
  ),
  false,
);

console.log('check-library-persist-safe: ok');
