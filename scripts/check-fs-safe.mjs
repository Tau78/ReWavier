import assert from 'node:assert/strict';

/** Mirrors `src/files/fsSafe.ts`. Keep both in sync. */

function encodeFilePath(path) {
  return path
    .split('/')
    .map((segment) => {
      if (!segment) {
        return '';
      }
      try {
        return encodeURIComponent(decodeURIComponent(segment.replace(/\+/g, ' ')));
      } catch {
        return encodeURIComponent(segment);
      }
    })
    .join('/');
}

function toFileUri(uri) {
  const trimmed = uri.trim();
  if (!trimmed) {
    return trimmed;
  }
  const withoutSlash = trimmed.length > 8 && trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
  if (withoutSlash.startsWith('file://')) {
    return `file://${encodeFilePath(withoutSlash.slice('file://'.length))}`;
  }
  if (withoutSlash.startsWith('/')) {
    return `file://${encodeFilePath(withoutSlash)}`;
  }
  return withoutSlash;
}

function parentDirUri(fileUri) {
  const clean = fileUri.replace(/\/$/, '');
  const idx = clean.lastIndexOf('/');
  return idx > 0 ? clean.slice(0, idx) : clean;
}

const inboxFile =
  "file:///var/mobile/Containers/Data/Application/0808FCE6-DEB3-4934-8F83-2BE70E0C953A/Documents/rewavier/inbox/sync-1.mp3";
const inboxDir =
  "file:///var/mobile/Containers/Data/Application/0808FCE6-DEB3-4934-8F83-2BE70E0C953A/Documents/rewavier/inbox";

assert.equal(parentDirUri(inboxFile), inboxDir);
assert.equal(
  parentDirUri(`${inboxDir}/`),
  "file:///var/mobile/Containers/Data/Application/0808FCE6-DEB3-4934-8F83-2BE70E0C953A/Documents/rewavier",
);
assert.equal(toFileUri(`${inboxDir}/`), inboxDir);
assert.equal(
  toFileUri(
    "/var/mobile/Containers/Data/Application/0808FCE6-DEB3-4934-8F83-2BE70E0C953A/Documents/rewavier/inbox",
  ),
  inboxDir,
);
assert.equal(toFileUri(inboxDir), inboxDir);
assert.equal(toFileUri(''), '');
assert.equal(parentDirUri('foo.mp3'), 'foo.mp3');

const androidBracket =
  'file:///data/user/0/app.rewavier/files/Audio/user-mu3u0ebs/05. [1983] First Ripples.mp3';
const androidBracketEncoded =
  'file:///data/user/0/app.rewavier/files/Audio/user-mu3u0ebs/05.%20%5B1983%5D%20First%20Ripples.mp3';
assert.equal(toFileUri(androidBracket), androidBracketEncoded);
assert.equal(
  toFileUri(
    'file:///data/user/0/app.rewavier/files/Audio/user-mu3u0ebs/05.%20[1983]%20First%20Ripples.mp3',
  ),
  androidBracketEncoded,
);
assert.doesNotMatch(toFileUri(androidBracket), /\[|\]/);

console.log('ok fsSafe parent of dest URI is the inbox folder downloadAsync requires');
console.log('ok toFileUri encodes brackets for Android URI.create');
