import assert from 'node:assert/strict';

// Keep in sync with src/cloud/deviceSync/mergeLibrary.ts

function trackKey(track) {
  return (track.sourceFileName || track.title || '').trim().toLowerCase();
}

function finiteMs(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

function longerDuration(localMs, incomingMs) {
  return Math.max(finiteMs(localMs), finiteMs(incomingMs));
}

function withoutPhoneFiles(track) {
  return {
    ...track,
    fileUri: undefined,
    inboxUri: undefined,
    downloaded: false,
    downloadedAt: undefined,
  };
}

function mergeTracks(local, remote) {
  const byId = new Map(local.map((track) => [track.id, track]));
  const byKey = new Map(local.map((track) => [trackKey(track), track]));
  for (const raw of remote) {
    const incoming = withoutPhoneFiles(raw);
    const existing = byId.get(incoming.id) ?? byKey.get(trackKey(incoming));
    if (!existing) {
      byId.set(incoming.id, incoming);
      continue;
    }
    byId.set(existing.id, {
      ...existing,
      title: existing.title || incoming.title,
      artist: existing.artist || incoming.artist,
      durationMs: longerDuration(existing.durationMs, incoming.durationMs),
      sourceFileName: existing.sourceFileName || incoming.sourceFileName,
      artworkUri: existing.artworkUri || incoming.artworkUri,
      fileUri: existing.fileUri,
      inboxUri: existing.inboxUri,
      downloaded: Boolean(existing.fileUri || existing.inboxUri || existing.downloaded),
      downloadedAt: existing.downloadedAt || incoming.downloadedAt,
    });
  }
  return [...byId.values()];
}

function keepLocalMedia(local, merged) {
  const byId = new Map(local.map((track) => [track.id, track]));
  const byKey = new Map(local.map((track) => [trackKey(track), track]));
  return merged.map((track) => {
    const prev = byId.get(track.id) ?? byKey.get(trackKey(track));
    if (!prev) {
      return withoutPhoneFiles(track);
    }
    const fileUri = prev.fileUri || track.fileUri;
    const inboxUri = prev.inboxUri || track.inboxUri;
    return {
      ...track,
      fileUri,
      inboxUri,
      artworkUri: prev.artworkUri || track.artworkUri,
      downloaded: Boolean(fileUri || inboxUri || prev.downloaded),
      downloadedAt: prev.downloadedAt || track.downloadedAt,
      durationMs: longerDuration(prev.durationMs, track.durationMs),
    };
  });
}

function sanitizeLike(local, tracks, { wipeThisPhoneFiles = false } = {}) {
  const onThisPhone = new Set(
    local.flatMap((track) => [track.fileUri, track.inboxUri, track.artworkUri].filter(Boolean)),
  );
  return tracks.map((track) => {
    const keepFile = track.fileUri && onThisPhone.has(track.fileUri) && !wipeThisPhoneFiles;
    const keepInbox = track.inboxUri && onThisPhone.has(track.inboxUri) && !wipeThisPhoneFiles;
    const keepArt = track.artworkUri && onThisPhone.has(track.artworkUri) && !wipeThisPhoneFiles;
    return {
      ...track,
      fileUri: keepFile ? track.fileUri : undefined,
      inboxUri: keepInbox ? track.inboxUri : undefined,
      artworkUri: keepArt ? track.artworkUri : undefined,
      downloaded: Boolean(keepFile),
      downloadedAt: keepFile ? track.downloadedAt : undefined,
    };
  });
}

/** Same order as applyRemoteSnapshot: merge → keep → sanitize → keep from live tracks. */
function applyStyle(local, remote, opts) {
  const merged = mergeTracks(local, remote);
  const kept = keepLocalMedia(local, merged);
  const cleaned = sanitizeLike(local, kept, opts);
  return keepLocalMedia(local, cleaned);
}

const live = [
  {
    id: 't1',
    title: 'Take',
    sourceFileName: 'take.m4a',
    fileUri: 'Audio/me/take.m4a',
    inboxUri: 'inbox/take.m4a',
    artworkUri: 'Audio/me/cover.jpg',
    downloaded: true,
    downloadedAt: 9,
    durationMs: 247441,
  },
];

const staleSuitcase = [
  {
    id: 't1',
    title: 'Take',
    sourceFileName: 'take.m4a',
    fileUri: undefined,
    inboxUri: undefined,
    artworkUri: undefined,
    downloaded: false,
    downloadedAt: undefined,
    durationMs: 0,
  },
];

const otherPhoneSuitcase = [
  {
    id: 't1',
    title: 'Take',
    sourceFileName: 'take.m4a',
    fileUri: 'Audio/other-phone/take.m4a',
    inboxUri: 'inbox/other-phone/take.m4a',
    artworkUri: 'Audio/other-phone/cover.jpg',
    downloaded: true,
    downloadedAt: 1,
    durationMs: 0,
  },
];

function assertKeptThisPhone(track) {
  assert.equal(track.fileUri, 'Audio/me/take.m4a');
  assert.equal(track.inboxUri, 'inbox/take.m4a');
  assert.equal(track.artworkUri, 'Audio/me/cover.jpg');
  assert.equal(track.downloaded, true);
  assert.equal(track.downloadedAt, 9);
  assert.equal(track.durationMs, 247441);
}

const keptFromKeep = keepLocalMedia(live, staleSuitcase)[0];
assertKeptThisPhone(keptFromKeep);

assert.equal(keepLocalMedia([], [{ id: 'new', fileUri: 'Audio/other/x.m4a', downloaded: true }])[0].fileUri, undefined);
assert.equal(keepLocalMedia([], [{ id: 'new' }])[0].id, 'new');

const fromStale = applyStyle(live, staleSuitcase)[0];
assertKeptThisPhone(fromStale);

const fromOtherPhone = applyStyle(live, otherPhoneSuitcase)[0];
assertKeptThisPhone(fromOtherPhone);
assert.notEqual(fromOtherPhone.fileUri, 'Audio/other-phone/take.m4a');

const durationZeroLoses = applyStyle(live, [{ ...staleSuitcase[0], durationMs: 0 }])[0];
assert.equal(durationZeroLoses.durationMs, 247441);
assert.equal(longerDuration(247441, 0), 247441);
assert.equal(longerDuration(0, 0), 0);
assert.equal(longerDuration(Number.NaN, 247441), 247441);

const afterWipe = applyStyle(live, otherPhoneSuitcase, { wipeThisPhoneFiles: true })[0];
assertKeptThisPhone(afterWipe);

const once = applyStyle(live, staleSuitcase);
const twice = applyStyle(once, otherPhoneSuitcase);
assertKeptThisPhone(twice[0]);
const thrice = applyStyle(twice, staleSuitcase);
assertKeptThisPhone(thrice[0]);

console.log('check-download-persist: ok');
