import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const persist = readFileSync(join(root, 'src/files/libraryPersist.ts'), 'utf8');
const store = readFileSync(join(root, 'src/store/libraryStore.ts'), 'utf8');

assert.match(persist, /SNAPSHOT_BAK_NAME/);
assert.match(persist, /library\.json\.bak/);
assert.match(persist, /shouldPersistAfterHydrate/);
assert.match(persist, /status: 'unreadable'/);
assert.match(persist, /copyAsync\(\{ from: dest, to: bak \}\)/);
assert.doesNotMatch(persist, /withTimeout\(/);

assert.match(store, /shouldPersistAfterHydrate/);
assert.match(store, /allowPersist/);
assert.match(store, /persistReady = allowPersist/);
assert.match(store, /if \(allowPersist\) \{\s*schedulePersist\(\);/s);
assert.match(store, /createAlbum[\s\S]*?void flushLibraryPersist\(\);/);
assert.match(store, /linkAlbumDrive[\s\S]*?void flushLibraryPersist\(\);/);

function shouldPersistAfterHydrate(result) {
  return result.status === 'loaded' || result.status === 'missing';
}

assert.equal(shouldPersistAfterHydrate({ status: 'loaded', snapshot: {} }), true);
assert.equal(shouldPersistAfterHydrate({ status: 'missing' }), true);
assert.equal(shouldPersistAfterHydrate({ status: 'unreadable' }), false);

console.log('check-library-persist-safe: ok');
