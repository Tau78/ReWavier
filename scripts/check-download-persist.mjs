import assert from 'node:assert/strict';

function keepLocalMedia(local, merged) {
  const byId = new Map(local.map((track) => [track.id, track]));
  return merged.map((track) => {
    const prev = byId.get(track.id);
    if (!prev) {
      return track;
    }
    const fileUri = track.fileUri || prev.fileUri;
    const inboxUri = track.inboxUri || prev.inboxUri;
    return {
      ...track,
      fileUri,
      inboxUri,
      downloaded: Boolean(fileUri) || track.downloaded || prev.downloaded,
      downloadedAt: track.downloadedAt || prev.downloadedAt,
      durationMs: Math.max(track.durationMs ?? 0, prev.durationMs ?? 0),
    };
  });
}

const live = [
  {
    id: 't1',
    fileUri: 'Audio/me/take.m4a',
    downloaded: true,
    downloadedAt: 9,
    durationMs: 247441,
  },
];
const fromSuitcase = [
  {
    id: 't1',
    fileUri: undefined,
    downloaded: false,
    durationMs: 0,
  },
];

const kept = keepLocalMedia(live, fromSuitcase)[0];
assert.equal(kept.fileUri, 'Audio/me/take.m4a');
assert.equal(kept.downloaded, true);
assert.equal(kept.downloadedAt, 9);
assert.equal(kept.durationMs, 247441);

assert.equal(keepLocalMedia([], [{ id: 'new' }])[0].id, 'new');

console.log('check-download-persist: ok');
