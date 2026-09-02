import assert from 'node:assert/strict';

function folderDownloadPercent(done, total, fileFraction = 0) {
  if (total <= 0) {
    return 0;
  }
  const raw = ((done + Math.max(0, Math.min(1, fileFraction))) / total) * 100;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

assert.equal(folderDownloadPercent(0, 0), 0);
assert.equal(folderDownloadPercent(0, 4), 0);
assert.equal(folderDownloadPercent(1, 4), 25);
assert.equal(folderDownloadPercent(1, 4, 0.5), 38);
assert.equal(folderDownloadPercent(4, 4), 100);
assert.equal(folderDownloadPercent(4, 4, 1), 100);

console.log('ok folder download percent');
