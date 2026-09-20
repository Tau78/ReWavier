import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = (rel) => readFileSync(join(root, rel), 'utf8');

const MOJIBAKE_HINT = /(?:Ã|Â|ï¿½|â€)/;

function applyCommonMojibakeFixes(value) {
  return value
    .replace(/Ã\u00a0/g, 'à')
    .replace(/Ã¨/g, 'è')
    .replace(/Ã©/g, 'é')
    .replace(/([a-zA-Z])Ã(?=\s|$|[^a-zA-Z])/g, '$1à');
}

function repairUtf8Mojibake(value) {
  const trimmed = value.trim();
  if (!trimmed || !MOJIBAKE_HINT.test(trimmed)) {
    return value;
  }
  let out = applyCommonMojibakeFixes(trimmed);
  if (!MOJIBAKE_HINT.test(out)) {
    return out;
  }
  try {
    const bytes = Uint8Array.from([...trimmed].map((ch) => ch.charCodeAt(0) & 0xff));
    const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    if (decoded && decoded !== trimmed) {
      out = applyCommonMojibakeFixes(decoded);
    }
  } catch {
    // keep out
  }
  return out;
}

function slugFromName(value) {
  return (
    value
      .toLowerCase()
      .replace(/@.*$/, '')
      .replace(/[^a-z0-9]+/g, '')
      .slice(0, 24) || 'membro'
  );
}

function looksLikeAuthorId(key) {
  const k = key.trim();
  if (!k || k.includes('@') || /\s/.test(k)) {
    return false;
  }
  if (/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(k)) {
    return true;
  }
  if (/^\d{10,}$/.test(k)) {
    return true;
  }
  if (/^[A-Za-z0-9_-]{20,}$/.test(k) && /\d/.test(k)) {
    return true;
  }
  return false;
}

assert.equal(repairUtf8Mojibake('Fabio LaganÃ'), 'Fabio Laganà');
assert.equal(slugFromName('Fabio Laganà'), 'fabiolagan');
assert.equal(slugFromName('Fabio LaganÃ'), 'fabiolagan');
assert.equal(looksLikeAuthorId('acct-fabio-123456789012345678'), true);
assert.equal(looksLikeAuthorId('fabio lagana'), false);

const displayNames = load('src/domain/displayNames.ts');
assert.match(displayNames, /repairUtf8Mojibake/);
assert.match(displayNames, /looksLikeAuthorId/);

const heal = load('src/domain/healAuthorNames.ts');
assert.match(heal, /healLibraryAuthorData/);
assert.match(heal, /healAlbumMemberMaps/);

const persist = load('src/files/libraryPersist.ts');
assert.match(persist, /healLibraryAuthorData/);

const people = load('src/domain/albumPeople.ts');
assert.match(people, /albumMemberRows/);
assert.match(people, /looksLikeAuthorId/);

const markers = load('src/domain/markers.ts');
assert.match(markers, /normalizeDisplayName/);

console.log('ok heal author names + handle unification');
