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

function audioMatchKey(fileName) {
  const decoded = fileName.trim().toLowerCase();
  const dot = decoded.lastIndexOf('.');
  return dot > 0 ? decoded.slice(0, dot) : decoded;
}

function trackOrderName(track) {
  return track.sourceFileName ?? `${track.title}.m4a`;
}

function findTrack(list, name) {
  const key = audioMatchKey(name);
  return list.find((track) => audioMatchKey(trackOrderName(track)) === key);
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
    const declared = item.files.length;
    const inner = item.files.map((name) => take(findTrack(albumTracks, name))).filter(Boolean);
    if (inner.length === 0) continue;
    if (declared >= 2 || inner.length >= 2) {
      versionFolders.push({
        id: 'ver-kept',
        name: item.name,
        trackIds: inner.map((track) => track.id),
        chosenId: findTrack(inner, item.chosen)?.id ?? inner[0].id,
      });
      trackIds.push('ver-kept');
      continue;
    }
    for (const track of inner) trackIds.push(track.id);
  }
  for (const track of albumTracks) {
    if (!seen.has(track.id)) trackIds.push(track.id);
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

// Partial match: only one take on phone — still keep the folder (no dissolve/stamp lock-in).
const partial = applyAlbumOrderFile(
  { trackIds: ['a', 'c'], versionFolders: [] },
  tracks.filter((track) => track.id === 'a' || track.id === 'c'),
  layout,
);
assert.deepEqual(partial.trackIds, ['ver-kept', 'c']);
assert.deepEqual(partial.versionFolders[0].trackIds, ['a']);

function remoteAlbumOrderHasLayout(parsed) {
  if (!parsed || parsed.updatedAt <= 0) return false;
  if ((parsed.items ?? []).some((item) => item.kind === 'folder' || item.kind === 'separator')) {
    return true;
  }
  return (parsed.items ?? []).length > 0 || parsed.files.length > 0;
}

function shouldApplyRemoteAlbumOrder(local, remote) {
  if (!remoteAlbumOrderHasLayout(remote)) return false;
  const localStamp = local.orderUpdatedAt ?? 0;
  if (remote.updatedAt > localStamp) return true;
  if (localStamp <= 0) return true;
  const remoteHasFolders = (remote.items ?? []).some(
    (item) => item.kind === 'folder' || item.kind === 'separator',
  );
  const localHasFolders =
    (local.versionFolders ?? []).length > 0 || (local.separators ?? []).length > 0;
  return remoteHasFolders && !localHasFolders;
}

function shouldPushLocalAlbumOrder(local, remote) {
  const localStamp = local.orderUpdatedAt ?? 0;
  if (localStamp <= 0) return false;
  if ((local.versionFolders ?? []).length === 0 && (local.separators ?? []).length === 0 && localStamp <= 0) {
    return false;
  }
  if (!remote) return true;
  if (shouldApplyRemoteAlbumOrder(local, remote)) return false;
  if (localStamp <= remote.updatedAt) return false;
  const remoteHasFolders = (remote.items ?? []).some(
    (item) => item.kind === 'folder' || item.kind === 'separator',
  );
  const localHasFolders =
    (local.versionFolders ?? []).length > 0 || (local.separators ?? []).length > 0;
  if (remoteHasFolders && !localHasFolders) return false;
  return true;
}

// First phone: no stamp → inherit, never push.
assert.equal(
  shouldApplyRemoteAlbumOrder({ orderUpdatedAt: 0, versionFolders: [] }, layout),
  true,
);
assert.equal(
  shouldPushLocalAlbumOrder({ orderUpdatedAt: 0, trackIds: ['a'], versionFolders: [] }, layout),
  false,
);

// Stale flat local must not overwrite remote folders.
assert.equal(
  shouldPushLocalAlbumOrder(
    { orderUpdatedAt: 200, trackIds: ['a', 'b'], versionFolders: [] },
    { ...layout, updatedAt: 50 },
  ),
  false,
);
assert.equal(
  shouldApplyRemoteAlbumOrder(
    { orderUpdatedAt: 200, versionFolders: [] },
    { ...layout, updatedAt: 50 },
  ),
  true,
);

// Intentional local folder newer than remote → push.
assert.equal(
  shouldPushLocalAlbumOrder(
    {
      orderUpdatedAt: 200,
      trackIds: ['ver-1'],
      versionFolders: [{ id: 'ver-1', name: 'X', trackIds: ['a', 'b'], chosenId: 'a' }],
    },
    { ...layout, updatedAt: 50 },
  ),
  true,
);

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
assert.match(orderSrc, /ORDER_FILE_NAME = '\.rewavier\.order\.json'/);
assert.match(orderSrc, /shouldApplyRemoteAlbumOrder/);
assert.match(orderSrc, /shouldPushLocalAlbumOrder/);
assert.match(orderSrc, /kind: 'folder'/);
assert.match(syncSrc, /pullAlbumLayout/);
assert.match(syncSrc, /reconcileAlbumOrderFromChildren/);
assert.match(syncSrc, /applyCloudAlbumOrder/);
assert.match(syncSrc, /buildAlbumOrderFile/);
assert.match(syncSrc, /await pullAlbumLayout\(albumId\)/);
assert.match(storeSrc, /shareAlbumLayout/);
assert.match(storeSrc, /dropAlbumVersion/);

console.log('check-album-order: ok');
