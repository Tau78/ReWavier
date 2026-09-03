import assert from 'node:assert/strict';

function audioMatchKey(fileName) {
  const decoded = decodeURIComponent(String(fileName).replace(/\+/g, ' '));
  const lower = decoded.toLowerCase();
  const dot = lower.lastIndexOf('.');
  const base = dot > 0 ? decoded.slice(0, decoded.lastIndexOf('.')) : decoded;
  return base.toLowerCase();
}

function importNameKey(track) {
  const raw = track.sourceFileName || track.title || '';
  return raw ? audioMatchKey(raw) : '';
}

function tracksAreSameImport(left, right) {
  if (left.id === right.id) {
    return true;
  }
  if (left.driveFileId && left.driveFileId === right.driveFileId) {
    return true;
  }
  const leftName = importNameKey(left);
  const rightName = importNameKey(right);
  return Boolean(leftName && leftName === rightName);
}

function trackQuality(track) {
  return (track.fileUri ? 4 : 0) + (track.downloaded ? 2 : 0) + (track.durationMs > 0 ? 1 : 0);
}

function collapseDuplicateTracks(tracks, albums) {
  const groups = [];
  for (const track of tracks) {
    const group = groups.find((items) => items.some((item) => tracksAreSameImport(item, track)));
    if (group) {
      group.push(track);
    } else {
      groups.push([track]);
    }
  }
  const winners = groups.map((group) =>
    group.reduce((best, track) => (trackQuality(track) > trackQuality(best) ? track : best)),
  );
  const keep = new Set(winners.map((track) => track.id));
  return {
    tracks: tracks.filter((track) => keep.has(track.id)),
    albums: albums.map((album) => ({
      ...album,
      trackIds: album.trackIds.filter((id, index) => keep.has(id) && album.trackIds.indexOf(id) === index),
    })),
  };
}

assert.equal(
  tracksAreSameImport(
    { id: 'a', driveFileId: 'drv1', title: 'x', sourceFileName: '10. [1984] The.m4a' },
    { id: 'b', driveFileId: 'drv1', title: 'y', sourceFileName: 'altro.wav' },
  ),
  true,
);
assert.equal(
  tracksAreSameImport(
    { id: 'b', title: '10. [1984] The', sourceFileName: '10. [1984] The.m4a' },
    { id: 'c', title: 'altro', sourceFileName: '10. [1984] The.wav' },
  ),
  true,
);
assert.equal(
  tracksAreSameImport(
    { id: 'd', driveFileId: 'one', title: '10. [1984] The', sourceFileName: '10. [1984] The.m4a' },
    { id: 'e', driveFileId: 'two', title: '10. [1984] The', sourceFileName: '10.%20%5B1984%5D%20The.m4a' },
  ),
  true,
);

const collapsed = collapseDuplicateTracks(
  [
    { id: 'old', title: '10', sourceFileName: '10. [1984] The.m4a', durationMs: 0 },
    {
      id: 'kept',
      title: '10',
      sourceFileName: '10. [1984] The.m4a',
      fileUri: 'Audio/me/10.m4a',
      downloaded: true,
      durationMs: 1000,
    },
    { id: 'again', driveFileId: 'other', title: '10. [1984] The', sourceFileName: '10. [1984] The.m4a' },
  ],
  [{ id: 'alb', trackIds: ['old', 'kept', 'kept', 'again', 'ghost'] }],
);

assert.deepEqual(
  collapsed.tracks.map((track) => track.id),
  ['kept'],
);
assert.deepEqual(collapsed.albums[0].trackIds, ['kept']);

console.log('check-import-dedupe: ok');
