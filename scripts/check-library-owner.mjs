import assert from 'node:assert/strict';

function ownerKeyForUser(userId) {
  const key = userId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return key || 'utente';
}

function isDemoUser(user) {
  if (!user) {
    return false;
  }
  return (
    user.id === 'user-app-review' ||
    user.email?.trim().toLowerCase() === 'review@rewavier.app'
  );
}

function shouldSkipCloudSync(user) {
  return isDemoUser(user);
}

function snapshotBelongsToOwner(snapshotOwner, activeOwnerKey, requireOwnerKey) {
  if (activeOwnerKey && snapshotOwner && snapshotOwner !== activeOwnerKey) {
    return false;
  }
  if (requireOwnerKey && snapshotOwner !== activeOwnerKey) {
    return false;
  }
  return true;
}

assert.equal(ownerKeyForUser('google:abc'), 'google-abc');
assert.equal(ownerKeyForUser('user-app-review'), 'user-app-review');
assert.notEqual(ownerKeyForUser('google:abc'), ownerKeyForUser('user-app-review'));
assert.equal(isDemoUser({ id: 'user-app-review', email: 'review@rewavier.app' }), true);
assert.equal(isDemoUser({ id: 'google:abc', email: 'm@example.com' }), false);
assert.equal(shouldSkipCloudSync({ id: 'user-app-review', email: 'review@rewavier.app' }), true);
assert.equal(shouldSkipCloudSync({ id: 'google:abc', email: 'm@example.com' }), false);
assert.equal(shouldSkipCloudSync(null), true);

const demoOwner = ownerKeyForUser('user-app-review');
assert.equal(snapshotBelongsToOwner(undefined, demoOwner, true), false);
assert.equal(snapshotBelongsToOwner('google-abc', demoOwner, true), false);
assert.equal(snapshotBelongsToOwner(demoOwner, demoOwner, true), true);
assert.equal(snapshotBelongsToOwner(undefined, 'google-abc', false), true);
assert.equal(snapshotBelongsToOwner('user-app-review', 'google-abc', false), false);

console.log('ok library owner isolation');
