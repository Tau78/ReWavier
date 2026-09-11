import assert from 'node:assert/strict';

const DRIVE_LIST_TIMEOUT_MS = 20_000;
const ALBUM_REFRESH_TIMEOUT_MS = 40_000;
const DRIVE_SLOW_MESSAGE = 'Drive non risponde. Riprova tra poco.';

assert.ok(DRIVE_LIST_TIMEOUT_MS <= ALBUM_REFRESH_TIMEOUT_MS);
assert.ok(DRIVE_SLOW_MESSAGE.includes('Riprova'));

function isAbortError(error) {
  if (!error || typeof error !== 'object') {
    return false;
  }
  return error.name === 'AbortError';
}

assert.equal(isAbortError({ name: 'AbortError' }), true);
assert.equal(isAbortError(new Error('no')), false);
assert.equal(isAbortError(null), false);

async function awaitJobOrTimeout(job, ms, isCancelled) {
  if (!job) {
    return 'done';
  }
  if (isCancelled?.()) {
    return 'cancelled';
  }
  let timer;
  let poll;
  const racers = [
    job.then(() => 'done').catch(() => 'done'),
    new Promise((resolve) => {
      timer = setTimeout(() => resolve('timeout'), ms);
    }),
  ];
  if (isCancelled) {
    racers.push(
      new Promise((resolve) => {
        const tick = () => {
          if (isCancelled()) {
            resolve('cancelled');
          }
        };
        tick();
        poll = setInterval(tick, 80);
      }),
    );
  }
  try {
    return await Promise.race(racers);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
    if (poll) {
      clearInterval(poll);
    }
  }
}

assert.equal(await awaitJobOrTimeout(null, 20), 'done');
assert.equal(await awaitJobOrTimeout(Promise.resolve('ok'), 50), 'done');
assert.equal(await awaitJobOrTimeout(Promise.reject(new Error('fail')), 50), 'done');
assert.equal(
  await awaitJobOrTimeout(new Promise(() => {}), 25),
  'timeout',
);
assert.equal(await awaitJobOrTimeout(new Promise(() => {}), 200, () => true), 'cancelled');
let cancelAfter = false;
setTimeout(() => {
  cancelAfter = true;
}, 15);
assert.equal(
  await awaitJobOrTimeout(new Promise(() => {}), 200, () => cancelAfter),
  'cancelled',
);

class DriveSlowError extends Error {
  constructor(message = DRIVE_SLOW_MESSAGE) {
    super(message);
    this.name = 'DriveSlowError';
  }
}

function isDriveSlowError(error) {
  return error instanceof DriveSlowError || (error instanceof Error && error.name === 'DriveSlowError');
}

async function withTimeout(promise, ms, message = DRIVE_SLOW_MESSAGE) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new DriveSlowError(message)), ms);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

assert.equal(await withTimeout(Promise.resolve(7), 50), 7);
await assert.rejects(() => withTimeout(new Promise(() => {}), 20), (error) => {
  assert.equal(isDriveSlowError(error), true);
  assert.equal(error.message, DRIVE_SLOW_MESSAGE);
  return true;
});

/** New Drive remotes join the album as rows; audio downloads after listing. */
function driveRemoteStubTrack(remote, albumName, id) {
  return {
    id,
    title: remote.name.replace(/\.[^.]+$/, ''),
    artist: albumName,
    durationMs: 0,
    sourceFileName: remote.name,
    downloaded: false,
    driveFileId: remote.id,
  };
}

const stub = driveRemoteStubTrack({ id: 'drv1', name: 'Take.m4a' }, '#Album', 'track-1');
assert.equal(stub.downloaded, false);
assert.equal(stub.fileUri, undefined);
assert.equal(stub.driveFileId, 'drv1');
assert.equal(stub.sourceFileName, 'Take.m4a');

console.log('ok album refresh');
