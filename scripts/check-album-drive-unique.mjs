import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const domain = readFileSync(join(root, 'src/domain/albumDriveUnique.ts'), 'utf8');
const persist = readFileSync(join(root, 'src/files/libraryPersist.ts'), 'utf8');
const store = readFileSync(join(root, 'src/store/libraryStore.ts'), 'utf8');
const engine = readFileSync(join(root, 'src/cloud/syncEngine.ts'), 'utf8');
const merge = readFileSync(join(root, 'src/cloud/deviceSync/mergeLibrary.ts'), 'utf8');

assert.match(domain, /export function dedupeAlbumsByDriveFolder/);
assert.match(domain, /export function findAlbumByDriveFolderId/);
assert.match(persist, /dedupeAlbumsByDriveFolder/);
assert.match(persist, /incomingFolders/);
assert.match(store, /driveFolderId\?\.trim\(\) === driveFolderId/);
assert.match(store, /Same Google folder must stay one album/);
assert.match(engine, /album\.driveFolderId\?\.trim\(\) === folderId\.trim\(\)/);
assert.match(engine, /resolvedAlbumId/);
assert.match(merge, /dedupeAlbumsByDriveFolder/);

function flattenAlbumTrackIds(album) {
  const nested = new Set((album.versionFolders ?? []).flatMap((folder) => folder.trackIds));
  const out = [];
  for (const id of album.trackIds ?? []) {
    if (id.startsWith('ver-')) {
      const folder = (album.versionFolders ?? []).find((item) => item.id === id);
      if (folder) {
        out.push(...folder.trackIds);
      }
      continue;
    }
    if (!id.startsWith('sep-') && !nested.has(id)) {
      out.push(id);
    }
  }
  for (const folder of album.versionFolders ?? []) {
    for (const id of folder.trackIds) {
      if (!out.includes(id)) {
        out.push(id);
      }
    }
  }
  return out;
}

function albumRichness(album) {
  return flattenAlbumTrackIds(album).length * 1000 + (album.documents?.length ?? 0) * 10;
}

function preferAlbum(left, right) {
  const leftScore = albumRichness(left);
  const rightScore = albumRichness(right);
  if (rightScore !== leftScore) {
    return rightScore > leftScore ? right : left;
  }
  return left.id <= right.id ? left : right;
}

function mergeSameDriveFolder(winner, loser) {
  const seen = new Set(winner.trackIds);
  const trackIds = [...winner.trackIds];
  for (const id of loser.trackIds) {
    if (!seen.has(id)) {
      trackIds.push(id);
      seen.add(id);
    }
  }
  return { ...winner, trackIds };
}

function dedupeAlbumsByDriveFolder(albums) {
  const kept = [];
  const byFolder = new Map();
  const removedDuplicateIds = [];
  for (const album of albums) {
    const key = album.driveFolderId?.trim() ?? '';
    if (!key) {
      kept.push(album);
      continue;
    }
    const existing = byFolder.get(key);
    if (!existing) {
      byFolder.set(key, album);
      continue;
    }
    const winner = preferAlbum(existing, album);
    const loser = winner.id === existing.id ? album : existing;
    byFolder.set(key, mergeSameDriveFolder(winner, loser));
    removedDuplicateIds.push(loser.id);
  }
  for (const album of byFolder.values()) {
    kept.push(album);
  }
  return { albums: kept, removedDuplicateIds };
}

const a1 = { id: 'a1', name: '#Album', driveFolderId: 'folder-1', trackIds: ['t1', 't2'] };
const a2 = { id: 'a2', name: '#Album', driveFolderId: 'folder-1', trackIds: ['t2', 't3'] };
const a3 = { id: 'a3', name: 'Local', trackIds: ['t9'] };
const result = dedupeAlbumsByDriveFolder([a1, a2, a3]);
assert.equal(result.albums.length, 2);
assert.equal(result.removedDuplicateIds.length, 1);
const drive = result.albums.find((album) => album.driveFolderId === 'folder-1');
assert.ok(drive);
assert.deepEqual(drive.trackIds.sort(), ['t1', 't2', 't3']);
assert.ok(result.albums.some((album) => album.id === 'a3'));

console.log('check-album-drive-unique: ok');
