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

console.log('ok collection download visual');
