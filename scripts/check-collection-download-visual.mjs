import assert from 'node:assert/strict';

function collectionDownloadVisual(input) {
  if (input.active) {
    return 'pause';
  }
  if (input.missingLocal) {
    return 'download';
  }
  if (input.driveHasNews) {
    return 'update';
  }
  return 'done';
}

assert.equal(collectionDownloadVisual({ active: true, missingLocal: true, driveHasNews: true }), 'pause');
assert.equal(collectionDownloadVisual({ active: false, missingLocal: true, driveHasNews: true }), 'download');
assert.equal(collectionDownloadVisual({ active: false, missingLocal: false, driveHasNews: true }), 'update');
assert.equal(collectionDownloadVisual({ active: false, missingLocal: false, driveHasNews: false }), 'done');

function collectionDownloadGlyph(visual) {
  if (visual === 'pause') return '❚❚';
  if (visual === 'update') return '↻';
  if (visual === 'done') return '✓';
  return '↓';
}

assert.equal(collectionDownloadGlyph('pause'), '❚❚');
assert.equal(collectionDownloadGlyph('update'), '↻');
assert.equal(collectionDownloadGlyph('done'), '✓');
assert.equal(collectionDownloadGlyph('download'), '↓');

function drivePeekNewsCount(peek) {
  // Only brand-new remotes pulse Aggiorna; replaces download in the background.
  return Math.max(0, peek.newRemoteCount);
}

assert.equal(drivePeekNewsCount({ newRemoteCount: 2, changedTrackIds: ['a', 'a'] }), 2);
assert.equal(drivePeekNewsCount({ newRemoteCount: 0, changedTrackIds: ['a'] }), 0);
assert.equal(drivePeekNewsCount({ newRemoteCount: 0, changedTrackIds: [] }), 0);

console.log('ok collection download visual');
