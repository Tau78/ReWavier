import assert from 'node:assert/strict';

function accountsWithoutUser(accounts, user) {
  const email = user.email.trim().toLowerCase();
  return accounts.filter((item) => item.id !== user.id && item.email !== email);
}

const accounts = [
  { id: 'user-1', email: 'a@example.com', passwordHash: 'x', displayName: 'A' },
  { id: 'user-2', email: 'b@example.com', passwordHash: 'y', displayName: 'B' },
];

assert.deepEqual(
  accountsWithoutUser(accounts, { id: 'user-1', email: 'A@example.com' }).map((item) => item.id),
  ['user-2'],
);

assert.deepEqual(
  accountsWithoutUser(accounts, { id: 'user-app-review', email: 'review@rewavier.app' }),
  accounts,
);

console.log('ok account deletion filter');
