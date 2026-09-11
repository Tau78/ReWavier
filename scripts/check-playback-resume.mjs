import assert from 'node:assert/strict';

function collectionResumeKey(kind, id) {
  return `${kind}:${id}`;
}

function resumePositionMs(positionMs, durationMs) {
  if (!Number.isFinite(positionMs) || positionMs < 1500) {
    return undefined;
  }
  if (durationMs > 0 && positionMs >= durationMs - 2500) {
    return undefined;
  }
  return Math.max(0, Math.round(positionMs));
}

function pickResumeTrackId(saved, playableIds) {
  if (saved && playableIds.includes(saved.trackId)) {
    return saved.trackId;
  }
  return undefined;
}

function albumContainsTrackId(album, trackId) {
  if (album.trackIds.includes(trackId)) {
    return true;
  }
  return (album.versionFolders ?? []).some((folder) => folder.trackIds.includes(trackId));
}

function collectionKeysForTrackId(trackId, albums, playlists, folders) {
  const keys = [];
  for (const album of albums) {
    if (albumContainsTrackId(album, trackId)) {
      keys.push(collectionResumeKey('album', album.id));
    }
  }
  for (const playlist of playlists) {
    if (playlist.trackIds.includes(trackId)) {
      keys.push(collectionResumeKey('playlist', playlist.id));
    }
  }
  for (const folder of folders) {
    if (folder.trackIds.includes(trackId)) {
      keys.push(collectionResumeKey('folder', folder.id));
    }
  }
  return keys;
}

assert.equal(collectionResumeKey('album', 'a1'), 'album:a1');
assert.equal(resumePositionMs(0, 180_000), undefined);
assert.equal(resumePositionMs(800, 180_000), undefined);
assert.equal(resumePositionMs(12_000, 180_000), 12_000);
assert.equal(resumePositionMs(178_000, 180_000), undefined);
assert.equal(pickResumeTrackId({ trackId: 't2', positionMs: 9000, updatedAt: 1 }, ['t1', 't2']), 't2');
assert.equal(pickResumeTrackId({ trackId: 'gone', positionMs: 9000, updatedAt: 1 }, ['t1', 't2']), undefined);

const keys = collectionKeysForTrackId(
  't2',
  [
    { id: 'alb', trackIds: ['t1'], versionFolders: [{ id: 'vf', trackIds: ['t2'], chosenId: 't2' }] },
    { id: 'other', trackIds: ['t9'] },
  ],
  [{ id: 'pl', trackIds: ['t2', 't3'] }],
  [{ id: 'fd', trackIds: ['t8'] }],
);
assert.deepEqual(keys.sort(), ['album:alb', 'playlist:pl']);

function startAtMsForTrack(tracks, trackId, durationMs) {
  const saved = tracks[trackId];
  if (!saved) {
    return undefined;
  }
  return resumePositionMs(saved.positionMs, durationMs);
}

function startAtMsForCollection(collections, tracks, key, trackId, durationMs) {
  const collection = collections[key];
  if (collection && collection.trackId === trackId) {
    const fromCollection = resumePositionMs(collection.positionMs, durationMs);
    if (fromCollection != null) {
      return fromCollection;
    }
  }
  return startAtMsForTrack(tracks, trackId, durationMs);
}

assert.equal(
  startAtMsForCollection(
    { 'album:a': { trackId: 't2', positionMs: 45_000, updatedAt: 1 } },
    { t2: { positionMs: 12_000, updatedAt: 1 } },
    'album:a',
    't2',
    180_000,
  ),
  45_000,
);
assert.equal(
  startAtMsForCollection(
    { 'album:a': { trackId: 't2', positionMs: 400, updatedAt: 1 } },
    { t2: { positionMs: 12_000, updatedAt: 1 } },
    'album:a',
    't2',
    180_000,
  ),
  12_000,
);
assert.equal(startAtMsForTrack({}, 't2', 180_000), undefined);

console.log('ok playback resume');
