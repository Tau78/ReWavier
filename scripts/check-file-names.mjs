import assert from 'node:assert/strict';

function decodeOverEncodedName(name) {
  let current = name.trim();
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
  return current;
}

function fileExtension(name) {
  const match = decodeOverEncodedName(name).match(/(\.[a-zA-Z0-9]{2,8})$/);
  return match?.[1] ?? '';
}

function safeTempFileName(prefix, id, originalName) {
  const ext = originalName ? fileExtension(originalName) : '';
  const safePrefix = prefix.replace(/[^a-zA-Z0-9._-]/g, '') || 'tmp';
  const safeId = id.replace(/[^a-zA-Z0-9._-]/g, '') || 'file';
  return `${safePrefix}-${safeId}${ext}`;
}

function safeDisplayFileName(name) {
  return decodeOverEncodedName(name).replace(/[/\\?%*:|"<>]/g, '-').trim() || 'traccia.m4a';
}

const original = '11. [5125] ReNew (The Ark is Built).mp3';
const once = encodeURIComponent(original);
const twice = encodeURIComponent(once);
const triple = encodeURIComponent(twice);

assert.equal(decodeOverEncodedName(original), original);
assert.equal(decodeOverEncodedName(once), original);
assert.equal(decodeOverEncodedName(twice), original);
assert.equal(decodeOverEncodedName(triple), original);
assert.equal(
  decodeOverEncodedName('11.%252520%5B5125%5D%252520ReNew%252520(The%252520Ark%252520is%252520Built).mp3'),
  original,
);

assert.equal(fileExtension(original), '.mp3');
assert.equal(fileExtension(triple), '.mp3');
assert.equal(safeTempFileName('sync', 'track-mtklr5z5', original), 'sync-track-mtklr5z5.mp3');
assert.doesNotMatch(safeTempFileName('sync', 'id', original), / |%|\[/);
assert.equal(safeDisplayFileName(triple), original);

console.log('ok file names decode Drive copies with spaces and brackets');
