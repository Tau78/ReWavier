import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const persist = readFileSync(join(root, 'src/files/libraryPersist.ts'), 'utf8');
const store = readFileSync(join(root, 'src/store/libraryStore.ts'), 'utf8');
const merge = readFileSync(join(root, 'src/cloud/deviceSync/mergeLibrary.ts'), 'utf8');
const suitcase = readFileSync(join(root, 'src/cloud/deviceSync/localSuitcase.ts'), 'utf8');
const app = readFileSync(join(root, 'src/app/AuthenticatedApp.tsx'), 'utf8');

assert.match(persist, /removedAlbumIds/);
assert.match(persist, /removedDriveFolderIds/);
assert.match(store, /void flushLibraryPersist\(\)/);
assert.match(store, /removedDriveFolderIds: driveFolderId/);
assert.match(merge, /albumIsRemoved/);
assert.match(suitcase, /snapshotFrom\(/);
assert.match(suitcase, /removedAlbumIds: cleaned\.removedAlbumIds/);
assert.match(app, /state === 'background' \|\| state === 'inactive'/);

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

function albumIsRemoved(album, removedAlbumIds, removedDriveFolderIds) {
  if (removedAlbumIds.has(album.id)) {
    return true;
  }
  const folderId = album.driveFolderId?.trim();
  return Boolean(folderId && removedDriveFolderIds.has(folderId));
}

function mergeAlbums(local, remote, removedAlbumIds, removedDriveFolderIds) {
  const byId = new Map(
    local.filter((album) => !albumIsRemoved(album, removedAlbumIds, removedDriveFolderIds)).map((album) => [
      album.id,
      album,
    ]),
  );
  for (const incoming of remote) {
    if (albumIsRemoved(incoming, removedAlbumIds, removedDriveFolderIds)) {
      continue;
    }
    if (!byId.has(incoming.id)) {
      byId.set(incoming.id, incoming);
    }
  }
  return [...byId.values()];
}

const gone = { id: 'album-1', name: 'Cloud', driveFolderId: 'folder-1' };
const other = { id: 'album-2', name: 'Altro' };
const remoteCopy = { id: 'album-1', name: 'Cloud', driveFolderId: 'folder-1' };
const reimported = { id: 'album-3', name: 'Cloud', driveFolderId: 'folder-1' };

assert.deepEqual(
  mergeAlbums([gone, other], [remoteCopy], new Set(['album-1']), new Set(['folder-1'])).map((a) => a.id),
  ['album-2'],
);
assert.deepEqual(
  mergeAlbums([], [remoteCopy], new Set(['album-1']), new Set()).map((a) => a.id),
  [],
);
assert.deepEqual(
  mergeAlbums([], [remoteCopy], new Set(), new Set(['folder-1'])).map((a) => a.id),
  [],
);
assert.deepEqual(
  mergeAlbums([], [reimported], new Set(['album-1']), new Set()).map((a) => a.id),
  ['album-3'],
);

const tombstones = uniquePersistIds(['album-1', 'album-1', ' folder-x ', '']);
assert.deepEqual(tombstones, ['album-1', 'folder-x']);

const many = uniquePersistIds(Array.from({ length: 410 }, (_, i) => `id-${i}`));
assert.equal(many.length, 400);
assert.equal(many[0], 'id-10');
assert.equal(many.at(-1), 'id-409');

console.log('check-album-tombstone: ok');
