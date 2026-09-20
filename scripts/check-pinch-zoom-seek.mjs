import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'src/features/player/Waveform.tsx'), 'utf8');

assert.match(src, /Gesture\.Exclusive\(pinch/);
assert.match(src, /\.maxPointers\(1\)/);
assert.match(src, /pinchActive/);
assert.doesNotMatch(src, /Gesture\.Simultaneous\(pinch/);

// Detail: scroll the off-screen tape; overview still scrubs.
assert.match(src, /mode: 'scrub' \| 'scroll'/);
assert.match(src, /'scroll'/);
assert.match(src, /beginDetailScroll/);
assert.match(src, /applyDetailViewStart/);
assert.match(src, /followPlayheadRef/);
assert.match(src, /playheadOutsideView/);
assert.match(src, /Trascina per scorrere l’onda fuori schermo/);
assert.match(src, /assignMarkerLanes/);
assert.match(src, /BUBBLE_LANE_STEP/);
assert.doesNotMatch(src, /detailPagerRef/);

console.log('ok pinch zoom no seek; detail pan scrolls view; bubble lanes');
