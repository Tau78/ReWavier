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

function trackMatchesRemote(track, remote) {
  if (track.driveFileId && track.driveFileId === remote.id) {
    return true;
  }
  if (!track.sourceFileName) {
    return false;
  }
  return (
    audioBasename(track.sourceFileName).toLowerCase() === audioBasename(remote.name).toLowerCase()
  );
}

function trackPresentRemotely(track, remotes) {
  return remotes.some((remote) => trackMatchesRemote(track, remote));
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

console.log('ok remote audio change prefers hash/size; missing remotes are pruned');
