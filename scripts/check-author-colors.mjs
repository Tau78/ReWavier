import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BAND_COLORS = [
  '#FF6B35',
  '#4A9EFF',
  '#34C759',
  '#FFD60A',
  '#BF5AF2',
  '#FF375F',
  '#64D2FF',
  '#FF9F0A',
  '#5E5CE6',
  '#AC8E68',
];

function colorForAuthorSeed(seed) {
  const key = seed.trim().toLowerCase() || 'anon';
  let hash = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return BAND_COLORS[(hash >>> 0) % BAND_COLORS.length];
}

function resolveAuthorColor(preferred, seed) {
  const chosen = typeof preferred === 'string' ? preferred.trim() : '';
  if (chosen) return chosen;
  return colorForAuthorSeed(seed);
}

assert.equal(colorForAuthorSeed('mauro'), colorForAuthorSeed('Mauro'));
assert.notEqual(colorForAuthorSeed('mauro'), colorForAuthorSeed('fabio'));
assert.equal(resolveAuthorColor('#4A9EFF', 'mauro'), '#4A9EFF');
assert.equal(resolveAuthorColor(null, 'mauro'), colorForAuthorSeed('mauro'));
assert.ok(BAND_COLORS.includes(colorForAuthorSeed('user-123')));

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const bandSrc = readFileSync(join(root, 'src/domain/bandColors.ts'), 'utf8');
const markers = readFileSync(join(root, 'src/domain/markers.ts'), 'utf8');
const session = readFileSync(join(root, 'src/store/sessionStore.ts'), 'utf8');
assert.match(bandSrc, /colorForAuthorSeed/);
assert.match(bandSrc, /resolveAuthorColor/);
assert.match(markers, /resolveAuthorColor\(user\?\.bandColor/);
assert.match(session, /ensurePersonalBandColor/);

console.log('ok author colors');
