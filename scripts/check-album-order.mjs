import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

function compareAlbumTrackNames(left, right) {
  const a = (left.sourceFileName ?? `${left.title}.m4a`).trim();
  const b = (right.sourceFileName ?? `${right.title}.m4a`).trim();
  return a.localeCompare(b, 'it', { numeric: true, sensitivity: 'base' });
}

function orderedAlbumItemIds(album, tracks) {
  if ((album.orderUpdatedAt ?? 0) > 0) {
    return album.trackIds;
  }
  const byId = new Map(tracks.map((track) => [track.id, track]));
  const trackIds = album.trackIds.filter((id) => byId.has(id));
  return [...trackIds].sort((left, right) =>
    compareAlbumTrackNames(byId.get(left), byId.get(right)),
  );
}

const tracks = [
  { id: 'c', title: '03. [5125] Roo', sourceFileName: '03. [5125] Roo.mp3' },
  { id: 'b', title: '02. [5125] Jad', sourceFileName: '02. [5125] Jad.mp3' },
  { id: 'a', title: '01. [1997] Into', sourceFileName: '01. [1997] Into.mp3' },
  { id: 'd', title: '07. [1984] 80s', sourceFileName: '07. [1984] 80s.mp3' },
  { id: 'e', title: '16. 3141 The Cassand', sourceFileName: '16. 3141 The Cassand.mp3' },
];

const album = { trackIds: ['c', 'b', 'a', 'd', 'e'] };
assert.deepEqual(
  orderedAlbumItemIds(album, tracks),
  ['a', 'b', 'c', 'd', 'e'],
);

const custom = { trackIds: ['c', 'b', 'a'], orderUpdatedAt: 1 };
assert.deepEqual(orderedAlbumItemIds(custom, tracks), ['c', 'b', 'a']);

function audioBasename(fileName) {
  const dot = fileName.lastIndexOf('.');
  return dot > 0 ? fileName.slice(0, dot) : fileName;
}

function nameKey(name) {
  return audioBasename(name).trim().toLowerCase();
}

function trackOrderName(track) {
  return track.sourceFileName ?? `${track.title}.m4a`;
}

function findTrack(tracks, name) {
  const key = nameKey(name);
  return tracks.find((track) => nameKey(trackOrderName(track)) === key);
}

function applyAlbumOrderFile(album, allTracks, parsed) {
  const albumTracks = allTracks.filter(
    (track) =>
      album.trackIds.includes(track.id) ||
      (album.versionFolders ?? []).some((folder) => folder.trackIds.includes(track.id)),
  );
  const seen = new Set();
  const take = (track) => {
    if (!track || seen.has(track.id)) return undefined;
    seen.add(track.id);
    return track;
  };
  const trackIds = [];
  const versionFolders = [];
  for (const item of parsed.items) {
    if (item.kind === 'file') {
      const track = take(findTrack(albumTracks, item.name));
      if (track) trackIds.push(track.id);
      continue;
    }
    const inner = item.files.map((name) => take(findTrack(albumTracks, name))).filter(Boolean);
    versionFolders.push({
      id: 'ver-kept',
      name: item.name,
      trackIds: inner.map((track) => track.id),
      chosenId: findTrack(inner, item.chosen)?.id ?? inner[0].id,
    });
    trackIds.push('ver-kept');
  }
  return { ...album, trackIds, versionFolders, orderUpdatedAt: parsed.updatedAt };
}

const packedAlbum = {
  trackIds: ['ver-1', 'c'],
  versionFolders: [{ id: 'ver-1', name: 'The Code Within', trackIds: ['a', 'b'], chosenId: 'a' }],
};
const layout = {
  updatedAt: 99,
  items: [
    {
      kind: 'folder',
      name: 'The Code Within',
      files: ['01. [1997] Into.mp3', '02. [5125] Jad.mp3'],
      chosen: '02. [5125] Jad.mp3',
    },
    { kind: 'file', name: '03. [5125] Roo.mp3' },
  ],
};
const applied = applyAlbumOrderFile(packedAlbum, tracks, layout);
assert.deepEqual(applied.trackIds, ['ver-kept', 'c']);
assert.deepEqual(applied.versionFolders[0].trackIds, ['a', 'b']);
assert.equal(applied.versionFolders[0].chosenId, 'b');
assert.ok(!applied.trackIds.includes('a'));
assert.ok(!applied.trackIds.includes('b'));

function mergeAlbumOrderFromCloud(previousIds, incomingTrackIds, nestedTrackIds = []) {
  const nested = new Set(nestedTrackIds);
  const next = incomingTrackIds.filter(
    (id) => !id.startsWith('sep-') && !id.startsWith('ver-') && !nested.has(id),
  );
  let lastIncomingIndex = -1;
  for (const id of previousIds) {
    if (id.startsWith('sep-') || id.startsWith('ver-')) {
      const at = lastIncomingIndex + 1;
      next.splice(at, 0, id);
      lastIncomingIndex = at;
      continue;
    }
    const index = next.indexOf(id);
    if (index >= 0) lastIncomingIndex = index;
  }
  return next;
}

assert.deepEqual(
  mergeAlbumOrderFromCloud(['ver-1', 'c'], ['a', 'b', 'c'], ['a', 'b']),
  ['ver-1', 'c'],
);

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const orderSrc = readFileSync(join(root, 'src/domain/albumOrder.ts'), 'utf8');
const syncSrc = readFileSync(join(root, 'src/cloud/syncEngine.ts'), 'utf8');
const storeSrc = readFileSync(join(root, 'src/store/libraryStore.ts'), 'utf8');
assert.match(orderSrc, /kind: 'folder'/);
assert.match(syncSrc, /applyCloudAlbumOrder/);
assert.match(syncSrc, /buildAlbumOrderFile/);
assert.match(storeSrc, /shareAlbumLayout/);
assert.match(storeSrc, /dropAlbumVersion/);

console.log('check-album-order: ok');
