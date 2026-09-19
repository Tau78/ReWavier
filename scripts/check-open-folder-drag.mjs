import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

function packRangeFor(ids, from, itemOf) {
  if (from < 0 || from >= ids.length) return { start: from, end: from };
  const lead = itemOf(ids[from]);
  if (!lead?.packWithChildren) return { start: from, end: from };
  const parentId = ids[from];
  let end = from;
  for (let index = from + 1; index < ids.length; index += 1) {
    const row = itemOf(ids[index]);
    if (row?.packParentId === parentId) {
      end = index;
      continue;
    }
    break;
  }
  return { start: from, end };
}

function movePack(ids, from, end, to) {
  const pack = ids.slice(from, end + 1);
  const without = [...ids.slice(0, from), ...ids.slice(end + 1)];
  const packLen = pack.length;
  let insertAt = to;
  if (to > end) insertAt = to - packLen;
  else if (to > from) insertAt = from;
  insertAt = Math.max(0, Math.min(without.length, insertAt));
  return [...without.slice(0, insertAt), ...pack, ...without.slice(insertAt)];
}

const ids = ['a', 'ver-1', 't1', 't2', 'b', 'c'];
const meta = {
  a: {},
  'ver-1': { packWithChildren: true },
  t1: { packParentId: 'ver-1' },
  t2: { packParentId: 'ver-1' },
  b: {},
  c: {},
};
const itemOf = (id) => meta[id];

assert.deepEqual(packRangeFor(ids, 1, itemOf), { start: 1, end: 3 });
assert.deepEqual(packRangeFor(ids, 0, itemOf), { start: 0, end: 0 });
assert.deepEqual(movePack(ids, 1, 3, 5), ['a', 'b', 'ver-1', 't1', 't2', 'c']);
assert.deepEqual(movePack(ids, 1, 3, 0), ['ver-1', 't1', 't2', 'a', 'b', 'c']);

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const list = readFileSync(join(root, 'src/features/library/ReorderableTrackList.tsx'), 'utf8');
const screen = readFileSync(join(root, 'src/features/library/CollectionScreen.tsx'), 'utf8');
assert.match(list, /packWithChildren/);
assert.match(list, /movePack/);
assert.match(screen, /packWithChildren: true/);
assert.match(screen, /packParentId: folder\.id/);
assert.doesNotMatch(screen, /draggable: !open/);

console.log('ok open folder drag pack');
