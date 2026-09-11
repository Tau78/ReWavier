import assert from 'node:assert/strict';

function audioBasename(fileName) {
  const sidecar = '.rewavier.json';
  if (fileName.toLowerCase().endsWith(sidecar)) {
    const without = fileName.slice(0, -sidecar.length);
    const parts = without.split('.');
    if (parts.length >= 2 && /^[a-z0-9_-]+$/i.test(parts[parts.length - 1] ?? '')) {
      return parts.slice(0, -1).join('.');
    }
    return without;
  }
  const dot = fileName.lastIndexOf('.');
  return dot > 0 ? fileName.slice(0, dot) : fileName;
}

function decodeFileNameForMatch(fileName) {
  let current = fileName.trim();
  for (let i = 0; i < 5; i += 1) {
    try {
      const next = decodeURIComponent(current.replace(/\+/g, ' '));
      if (next === current) {
        break;
      }
      current = next;
    } catch {
      break;
    }
  }
  try {
    return current.normalize('NFC');
  } catch {
    return current;
  }
}

const AUDIO_EXT = /\.(wav|aiff|aif|mp4|mp3|aac|m4a|caf|flac|ogg|json)$/i;

function audioMatchKey(fileName) {
  const decoded = decodeFileNameForMatch(fileName);
  const hasAudioExt = AUDIO_EXT.test(decoded) || decoded.toLowerCase().endsWith('.rewavier.json');
  return (hasAudioExt ? audioBasename(decoded) : decoded).toLowerCase();
}

function uniqueRemotes(remotes) {
  const seen = new Set();
  const out = [];
  for (const remote of remotes) {
    if (seen.has(remote.id)) {
      continue;
    }
    seen.add(remote.id);
    out.push(remote);
  }
  return out;
}

function trackNameMatchesRemote(track, remote) {
  const remoteKey = audioMatchKey(remote.name);
  if (!remoteKey) {
    return false;
  }
  if (track.sourceFileName && audioMatchKey(track.sourceFileName) === remoteKey) {
    return true;
  }
  if (track.title && audioMatchKey(track.title) === remoteKey) {
    return true;
  }
  return false;
}

function trackMatchesRemote(track, remote) {
  if (track.driveFileId && track.driveFileId === remote.id) {
    return true;
  }
  return trackNameMatchesRemote(track, remote);
}

function findLocalsMatchingRemote(tracks, remote) {
  const byId = tracks.filter((track) => track.driveFileId === remote.id);
  if (byId.length > 0) {
    return byId;
  }
  return tracks.filter((track) => !track.driveFileId && trackNameMatchesRemote(track, remote));
}

function findBestLocalForRemote(tracks, remote) {
  return preferDownloadedTrack(findLocalsMatchingRemote(tracks, remote));
}

function trackPresentRemotely(track, remotes) {
  return remotes.some((remote) => trackMatchesRemote(track, remote));
}

function localTrackQuality(track) {
  return (track.fileUri ? 4 : 0) + (track.downloaded ? 2 : 0) + ((track.durationMs ?? 0) > 0 ? 1 : 0);
}

function preferDownloadedTrack(tracks) {
  if (tracks.length === 0) {
    return undefined;
  }
  return tracks.reduce((best, track) =>
    localTrackQuality(track) > localTrackQuality(best) ? track : best,
  );
}

function createRemoteClaimSet() {
  return { ids: new Set(), names: new Set() };
}

function remoteIsClaimed(claimed, remote) {
  return claimed.ids.has(remote.id);
}

function claimRemote(claimed, remote) {
  claimed.ids.add(remote.id);
}

function surplusLocalTracks(tracks, remotes) {
  const claimedTrackIds = new Set();
  const claimed = createRemoteClaimSet();
  const remoteIds = new Set(uniqueRemotes(remotes).map((remote) => remote.id));
  for (const remote of uniqueRemotes(remotes)) {
    if (remoteIsClaimed(claimed, remote)) {
      continue;
    }
    const candidates = tracks.filter(
      (track) => !claimedTrackIds.has(track.id) && findLocalsMatchingRemote([track], remote).length > 0,
    );
    const best = preferDownloadedTrack(candidates);
    if (!best) {
      continue;
    }
    claimedTrackIds.add(best.id);
    claimRemote(claimed, remote);
  }
  return tracks.filter((track) => {
    if (claimedTrackIds.has(track.id)) {
      return false;
    }
    if (track.driveFileId && remoteIds.has(track.driveFileId)) {
      return false;
    }
    return true;
  });
}

function remoteAudioChanged(track, remote) {
  if (remote.md5Checksum && track.remoteHash) {
    return remote.md5Checksum !== track.remoteHash;
  }
  if (remote.size != null && remote.size !== '' && track.remoteSize != null) {
    return Number(remote.size) !== track.remoteSize;
  }
  if (remote.modifiedTime && track.remoteModifiedAt) {
    return Date.parse(remote.modifiedTime) > Date.parse(track.remoteModifiedAt);
  }
  return Boolean(remote.modifiedTime && !track.remoteModifiedAt);
}


function remoteReplacesLocalTrack(track, remote, remotes) {
  if (!track.driveFileId || track.driveFileId === remote.id) {
    return false;
  }
  if (!trackNameMatchesRemote(track, remote)) {
    return false;
  }
  return !remotes.some((item) => item.id === track.driveFileId);
}


// Hash wins: newer mtime with same hash is NOT a new version
assert.equal(
  remoteAudioChanged(
    { remoteHash: 'abc', remoteModifiedAt: '2020-01-01T00:00:00.000Z' },
    { id: '1', name: 'a.m4a', md5Checksum: 'abc', modifiedTime: '2026-01-01T00:00:00.000Z' },
  ),
  false,
);
assert.equal(
  remoteAudioChanged(
    { remoteHash: 'abc' },
    { id: '1', name: 'a.m4a', md5Checksum: 'def' },
  ),
  true,
);

// Size when hash missing
assert.equal(
  remoteAudioChanged(
    { remoteSize: 1000 },
    { id: '1', name: 'a.m4a', size: '1000' },
  ),
  false,
);
assert.equal(
  remoteAudioChanged(
    { remoteSize: 1000 },
    { id: '1', name: 'a.m4a', size: '2000' },
  ),
  true,
);

// Match by Drive id or basename
assert.equal(
  trackMatchesRemote({ driveFileId: 'x', sourceFileName: 'old.m4a' }, { id: 'x', name: 'new.m4a' }),
  true,
);
assert.equal(
  trackMatchesRemote({ sourceFileName: 'Take 3.wav' }, { id: 'y', name: 'Take 3.wav' }),
  true,
);
assert.equal(
  trackPresentRemotely({ driveFileId: 'gone', sourceFileName: 'gone.m4a' }, [
    { id: 'other', name: 'stay.m4a' },
  ]),
  false,
);
assert.equal(
  trackPresentRemotely({ driveFileId: 'stay', sourceFileName: 'stay.m4a' }, [
    { id: 'stay', name: 'stay.m4a' },
  ]),
  true,
);

const original = '10. [1984] The Distance.m4a';
const once = encodeURIComponent(original);
const twice = encodeURIComponent(once);

// Encoded vs decoded names are the same file
assert.equal(
  trackMatchesRemote({ sourceFileName: original }, { id: 'enc', name: once }),
  true,
);
assert.equal(
  trackMatchesRemote({ sourceFileName: once }, { id: 'enc', name: original }),
  true,
);
assert.equal(
  trackMatchesRemote({ sourceFileName: original }, { id: 'enc', name: twice }),
  true,
);
assert.equal(
  trackMatchesRemote({ title: '10. [1984] The Distance' }, { id: 'enc', name: once }),
  true,
);
assert.equal(
  audioMatchKey('10. [1984] The Distance'),
  audioMatchKey(original),
);
assert.equal(
  trackMatchesRemote({ sourceFileName: '10. [1984] The Distance.m4a' }, { id: 'x', name: '10. Other.m4a' }),
  false,
);

// Unicode NFC vs NFD
assert.equal(
  trackMatchesRemote({ sourceFileName: 'Café.m4a' }, { id: 'nfc', name: 'Cafe\u0301.m4a' }),
  true,
);

// Same driveFileId, different name (rename on Drive)
assert.equal(
  trackMatchesRemote(
    { driveFileId: 'same', sourceFileName: 'old take.m4a' },
    { id: 'same', name: '10. [1984] The Distance.m4a' },
  ),
  true,
);

// Duplicate locals vs one remote: keep the downloaded row
const locals = [
  { id: 'ghost', sourceFileName: original, durationMs: 0 },
  { id: 'ghost2', sourceFileName: once, durationMs: 0 },
  {
    id: 'kept',
    sourceFileName: original,
    fileUri: 'file://audio/10.m4a',
    downloaded: true,
    durationMs: 1000,
  },
];
const oneRemote = [{ id: 'drv', name: original }];
assert.equal(preferDownloadedTrack(locals)?.id, 'kept');
assert.deepEqual(
  surplusLocalTracks(locals, oneRemote)
    .map((track) => track.id)
    .sort(),
  ['ghost', 'ghost2'],
);

// Same name, two Drive ids (01 / 02): both stay
assert.deepEqual(
  surplusLocalTracks(
    [
      { id: 'root', driveFileId: 'a', sourceFileName: original, fileUri: 'file://a', downloaded: true },
      { id: 'copy', driveFileId: 'b', sourceFileName: original },
    ],
    [
      { id: 'a', name: original },
      { id: 'b', name: original },
    ],
  ).map((track) => track.id),
  [],
);

// Same remote listed twice is one claim; another Drive id is a second file
const claimed = createRemoteClaimSet();
claimRemote(claimed, { id: 'drv', name: original });
assert.equal(remoteIsClaimed(claimed, { id: 'drv', name: original }), true);
assert.equal(remoteIsClaimed(claimed, { id: 'other', name: once }), false);
assert.deepEqual(
  uniqueRemotes([
    { id: 'drv', name: original },
    { id: 'drv', name: original },
  ]).map((remote) => remote.id),
  ['drv'],
);


// Delete+reupload: same name, new id, old id gone
assert.equal(
  remoteReplacesLocalTrack(
    { driveFileId: 'old', sourceFileName: original },
    { id: 'new', name: original },
    [{ id: 'new', name: original }],
  ),
  true,
);
// Version folder twin: both ids still present
assert.equal(
  remoteReplacesLocalTrack(
    { driveFileId: 'a', sourceFileName: original },
    { id: 'b', name: original },
    [
      { id: 'a', name: original },
      { id: 'b', name: original },
    ],
  ),
  false,
);

// Versions 01 / 02 / 03 are three files, even if the rest of the name matches
const take1 = { id: 'v1', driveFileId: 'd1', sourceFileName: 'Room Pt.1 01.mp3', title: 'Room Pt.1 01' };
const take2 = { id: 'v2', driveFileId: 'd2', sourceFileName: 'Room Pt.1 02.mp3', title: 'Room Pt.1 02' };
const take3 = { id: 'v3', driveFileId: 'd3', sourceFileName: 'Room Pt.1 03.mp3', title: 'Room Pt.1 03' };
assert.equal(findBestLocalForRemote([take1, take2, take3], { id: 'd2', name: 'Room Pt.1 02.mp3' })?.id, 'v2');
assert.equal(findBestLocalForRemote([take1, take2, take3], { id: 'd3', name: 'Room Pt.1 03.mp3' })?.id, 'v3');
assert.equal(findBestLocalForRemote([take1], { id: 'd2', name: 'Room Pt.1 02.mp3' }), undefined);
assert.equal(remoteIsClaimed((() => {
  const set = createRemoteClaimSet();
  claimRemote(set, { id: 'd1', name: 'Room Pt.1 01.mp3' });
  return set;
})(), { id: 'd2', name: 'Room Pt.1 02.mp3' }), false);

console.log('ok remote audio change prefers hash/size; missing remotes are pruned; names match across encoding');
