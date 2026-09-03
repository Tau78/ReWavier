import assert from 'node:assert/strict';

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

console.log('check-album-order: ok');
