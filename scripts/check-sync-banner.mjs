import assert from 'node:assert/strict';

const SYNC_STALE_MS = 20_000;

function libraryNeedsBanner(state) {
  if (state.pendingReviews.length > 0) {
    return true;
  }
  if (state.needsFolderLink || state.needsFileRefresh) {
    return true;
  }
  return state.status === 'error' && Boolean(state.message);
}

function isSyncInFlight(state, now = Date.now()) {
  if (state.status !== 'syncing') {
    return false;
  }
  const startedAt = state.startedAt ?? 0;
  if (startedAt <= 0) {
    return false;
  }
  return now - startedAt < SYNC_STALE_MS;
}

const quiet = {
  pendingReviews: [],
  needsFolderLink: false,
  needsFileRefresh: false,
};

assert.equal(
  libraryNeedsBanner({
    ...quiet,
    status: 'syncing',
    message: 'Allineo i brani…',
  }),
  false,
);
assert.equal(
  libraryNeedsBanner({
    ...quiet,
    status: 'idle',
    message: 'iCloud è già in pari.',
  }),
  false,
);
assert.equal(
  libraryNeedsBanner({
    ...quiet,
    status: 'idle',
    message: null,
    pendingReviews: [{ title: 'Take' }],
  }),
  true,
);
assert.equal(
  libraryNeedsBanner({
    ...quiet,
    status: 'error',
    message: 'Allineamento non riuscito. Riprova tra un attimo.',
  }),
  true,
);
assert.equal(
  libraryNeedsBanner({
    ...quiet,
    status: 'idle',
    needsFolderLink: true,
  }),
  true,
);

const now = 1_000_000;
assert.equal(isSyncInFlight({ status: 'syncing', startedAt: now - 1_000 }, now), true);
assert.equal(isSyncInFlight({ status: 'syncing', startedAt: now - SYNC_STALE_MS - 1 }, now), false);
assert.equal(isSyncInFlight({ status: 'idle', startedAt: now }, now), false);

console.log('ok sync banner stays off unless action is needed');
