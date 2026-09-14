import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const hero = readFileSync(join(root, 'src/features/library/AlbumHero.tsx'), 'utf8');
const screen = readFileSync(join(root, 'src/features/library/CollectionScreen.tsx'), 'utf8');
const row = readFileSync(join(root, 'src/features/library/TrackRow.tsx'), 'utf8');

assert.match(hero, /export function albumListMeta/);
assert.doesNotMatch(hero, /styles\.title/);
assert.doesNotMatch(hero, /styles\.meta/);

assert.match(screen, /headerAlbumName/);
assert.match(screen, /toolbarMeta/);
assert.match(screen, /sortIconBtn/);
assert.match(screen, /albumListMeta/);
assert.match(screen, /hideArtist/);
assert.match(row, /hideArtist/);
assert.doesNotMatch(screen, />Tracce</);
assert.match(screen, /Ordina per nome/);

function albumListMeta(album, trackCount) {
  const countLabel = `${trackCount} ${trackCount === 1 ? 'traccia' : 'tracce'}`;
  const artist = album.artist?.trim() ?? '';
  const artistRepeatsDrive =
    !artist || artist.toLowerCase() === 'drive' || artist === album.name;
  if (album.origin === 'drive') {
    return artistRepeatsDrive ? `Drive · ${countLabel}` : `${artist} · ${countLabel}`;
  }
  return artistRepeatsDrive ? countLabel : `${artist} · ${countLabel}`;
}

assert.equal(
  albumListMeta({ origin: 'drive', artist: 'Drive', name: '#Album' }, 19),
  'Drive · 19 tracce',
);
assert.equal(albumListMeta({ origin: 'drive', artist: '', name: 'X' }, 1), 'Drive · 1 traccia');
assert.equal(albumListMeta({ origin: 'local', artist: 'Mia', name: 'X' }, 3), 'Mia · 3 tracce');

console.log('ok album compact');
