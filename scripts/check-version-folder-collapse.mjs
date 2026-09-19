import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

function isSeparatorId(id) {
  return id.startsWith('sep-');
}
function isVersionFolderId(id) {
  return id.startsWith('ver-');
}

function healAlbumAfterCollapse(album, keep, remapId = (id) => id) {
  const versionFolders = (album.versionFolders ?? [])
    .map((folder) => {
      const trackIds = [...new Set(folder.trackIds.map(remapId).filter((id) => keep.has(id)))];
      if (trackIds.length === 0) return null;
      const chosen = remapId(folder.chosenId);
      return {
        ...folder,
        trackIds,
        chosenId: trackIds.includes(chosen) ? chosen : trackIds[0],
      };
    })
    .filter(Boolean);

  const nested = new Set(versionFolders.flatMap((folder) => folder.trackIds));
  const folderById = new Map(versionFolders.map((folder) => [folder.id, folder]));
  const sepIds = new Set((album.separators ?? []).map((item) => item.id));
  const nextIds = [];
  const seen = new Set();

  for (const id of album.trackIds) {
    if (isSeparatorId(id)) {
      if (sepIds.has(id) && !seen.has(id)) {
        seen.add(id);
        nextIds.push(id);
      }
      continue;
    }
    if (isVersionFolderId(id)) {
      if (folderById.has(id) && !seen.has(id)) {
        seen.add(id);
        nextIds.push(id);
      }
      continue;
    }
    const remapped = remapId(id);
    if (!keep.has(remapped) || seen.has(remapped) || nested.has(remapped)) continue;
    seen.add(remapped);
    nextIds.push(remapped);
  }

  for (const folder of versionFolders) {
    if (seen.has(folder.id)) continue;
    for (let i = nextIds.length - 1; i >= 0; i -= 1) {
      if (folder.trackIds.includes(nextIds[i])) nextIds.splice(i, 1);
    }
    nextIds.push(folder.id);
    seen.add(folder.id);
  }

  return {
    ...album,
    trackIds: nextIds,
    versionFolders: versionFolders.length > 0 ? versionFolders : undefined,
  };
}

// Old bug: collapse kept only track ids → ver-* gone, children flattened later.
const broken = {
  trackIds: ['a', 'b', 'c'],
  versionFolders: [{ id: 'ver-1', name: 'Code', trackIds: ['a', 'b'], chosenId: 'a' }],
};
const keep = new Set(['a', 'b', 'c']);
const healed = healAlbumAfterCollapse(broken, keep);
assert.deepEqual(healed.trackIds, ['c', 'ver-1']);
assert.ok(healed.trackIds.includes('ver-1'));
assert.ok(!healed.trackIds.includes('a'));
assert.ok(!healed.trackIds.includes('b'));

// Healthy album keeps ver-* through collapse filter.
const healthy = {
  trackIds: ['ver-1', 'c'],
  versionFolders: [{ id: 'ver-1', name: 'Code', trackIds: ['a', 'b'], chosenId: 'a' }],
};
assert.deepEqual(healAlbumAfterCollapse(healthy, keep).trackIds, ['ver-1', 'c']);

function localAlbumHasLinkedFolders(album) {
  const ids = new Set(album.trackIds);
  if ((album.versionFolders ?? []).some((folder) => ids.has(folder.id))) return true;
  return (album.separators ?? []).some((item) => ids.has(item.id));
}

assert.equal(localAlbumHasLinkedFolders(broken), false);
assert.equal(localAlbumHasLinkedFolders(healed), true);

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const store = readFileSync(join(root, 'src/store/libraryStore.ts'), 'utf8');
const order = readFileSync(join(root, 'src/domain/albumOrder.ts'), 'utf8');
assert.match(store, /healAlbumAfterCollapse/);
assert.match(store, /isVersionFolderId\(id\)/);
assert.match(order, /localAlbumHasLinkedFolders/);

console.log('ok version folder collapse heal');
