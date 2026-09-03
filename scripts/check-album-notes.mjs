import assert from 'node:assert/strict';

function albumNotesFromRemote(localNotes, localUpdatedAt, remoteNotes, remoteUpdatedAt) {
  const remote = remoteNotes.replace(/^\uFEFF/, '');
  const local = localNotes ?? '';
  if (remote === local) {
    return null;
  }
  if (remote.trim() && remoteUpdatedAt > localUpdatedAt) {
    return { notes: remote, updatedAt: remoteUpdatedAt };
  }
  if (local.trim() && localUpdatedAt >= remoteUpdatedAt) {
    return null;
  }
  if (remote.trim() && !local.trim()) {
    return { notes: remote, updatedAt: remoteUpdatedAt };
  }
  return null;
}

assert.equal(albumNotesFromRemote('ciao', 10, 'ciao', 20), null);
assert.deepEqual(albumNotesFromRemote('vecchio', 10, 'nuovo', 20), { notes: 'nuovo', updatedAt: 20 });
assert.equal(albumNotesFromRemote('locale', 30, 'remoto', 20), null);
assert.deepEqual(albumNotesFromRemote('', 0, 'dal drive', 5), { notes: 'dal drive', updatedAt: 5 });
assert.equal(albumNotesFromRemote('  ', 0, '', 0), null);

console.log('check-album-notes: ok');
