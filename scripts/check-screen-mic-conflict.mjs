import assert from 'node:assert/strict';

function shouldExplainScreenMicConflict(screenCaptured, startFailed) {
  return screenCaptured === true && startFailed === true;
}

assert.equal(shouldExplainScreenMicConflict(false, false), false);
assert.equal(shouldExplainScreenMicConflict(false, true), false);
assert.equal(shouldExplainScreenMicConflict(true, false), false);
assert.equal(shouldExplainScreenMicConflict(true, true), true);

console.log('ok screen mic conflict is gated');
