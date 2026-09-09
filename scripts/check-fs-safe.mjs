import assert from 'node:assert/strict';

/** Mirrors `src/files/fsSafe.ts`. Keep both in sync. */

function toFileUri(uri) {
  const trimmed = uri.trim();
  if (!trimmed) {
    return trimmed;
  }
  const withoutSlash = trimmed.length > 8 && trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
  if (withoutSlash.startsWith('file://')) {
    return withoutSlash;
  }
  if (withoutSlash.startsWith('/')) {
    return `file://${withoutSlash}`;
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

console.log('ok fsSafe parent of dest URI is the inbox folder downloadAsync requires');
