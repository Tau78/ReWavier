import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const markers = readFileSync(join(root, 'src/domain/markers.ts'), 'utf8');
const row = readFileSync(join(root, 'src/features/library/TrackRow.tsx'), 'utf8');

assert.match(markers, /export function noteAuthorDots/);
assert.match(markers, /export type NoteAuthorDot/);
assert.match(markers, /noteAuthorInitial/);
assert.match(row, /noteAuthors/);
assert.match(row, /authorDot/);
assert.match(row, /authorInitial/);
assert.match(row, /Nessun appunto/);
assert.doesNotMatch(row, /\$\{noteCount\} appunti/);
assert.doesNotMatch(row, /noteCount:/);

console.log('ok note author dots');
