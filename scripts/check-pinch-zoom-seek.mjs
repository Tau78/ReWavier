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

console.log('ok pinch zoom no seek');
