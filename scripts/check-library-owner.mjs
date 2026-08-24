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

assert.equal(ownerKeyForUser('google:abc'), 'google-abc');
assert.equal(ownerKeyForUser('user-app-review'), 'user-app-review');
assert.notEqual(ownerKeyForUser('google:abc'), ownerKeyForUser('user-app-review'));
assert.equal(isDemoUser({ id: 'user-app-review', email: 'review@rewavier.app' }), true);
assert.equal(isDemoUser({ id: 'google:abc', email: 'm@example.com' }), false);

console.log('ok library owner isolation');
