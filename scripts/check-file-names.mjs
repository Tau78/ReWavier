import assert from 'node:assert/strict';

/** Mirrors `src/files/fileNames.ts`. Keep both in sync. */

function decodeOverEncodedName(name) {
  let current = name.trim();
  for (let i = 0; i < 5; i += 1) {
    try {
      const next = decodeURIComponent(current.replace(/\+/g, ' '));
      if (next === current) {
        break;
      }
      current = next;
    } catch {
      break;
    }
  }
  return current;
}

function fileExtension(name) {
  const match = decodeOverEncodedName(name).match(/(\.[a-zA-Z0-9]{2,8})$/);
  return match?.[1] ?? '';
}

function safeTempFileName(prefix, id, originalName) {
  const ext = originalName ? fileExtension(originalName) : '';
  const safePrefix = prefix.replace(/[^a-zA-Z0-9._-]/g, '') || 'tmp';
  const safeId = id.replace(/[^a-zA-Z0-9._-]/g, '') || 'file';
  return `${safePrefix}-${safeId}${ext}`;
}

function safeDisplayFileName(name) {
  return decodeOverEncodedName(name).replace(/[/\\?%*:|"<>]/g, '-').trim() || 'traccia.m4a';
}

function storedBasename(stored) {
  if (!stored) {
    return '';
  }
  const clean = stored.split('?')[0] ?? stored;
  const parts = clean.replace(/\/$/, '').split('/');
  return decodeOverEncodedName(parts[parts.length - 1] ?? '');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function audioNamesEqual(left, right) {
  const safeLeft = safeDisplayFileName(left);
  const safeRight = safeDisplayFileName(right);
  if (safeLeft === safeRight) {
    return true;
  }
  if (decodeOverEncodedName(left) === decodeOverEncodedName(right)) {
    return true;
  }
  return safeLeft.toLowerCase() === safeRight.toLowerCase();
}

function isUniqueAudioFileNameVariant(diskName, wantedName) {
  const disk = safeDisplayFileName(diskName);
  const wanted = safeDisplayFileName(wantedName);
  if (!wanted || disk === wanted) {
    return false;
  }
  const ext = fileExtension(wanted);
  const base = ext ? wanted.slice(0, -ext.length) : wanted;
  if (!base) {
    return false;
  }
  const diskExt = fileExtension(disk);
  if (diskExt.toLowerCase() !== ext.toLowerCase()) {
    return false;
  }
  const diskBase = diskExt ? disk.slice(0, -diskExt.length) : disk;
  return new RegExp(`^${escapeRegExp(base)} [0-9]+$`).test(diskBase);
}

function audioFileMatchesTrackId(diskName, trackId) {
  if (!trackId) {
    return false;
  }
  const decoded = decodeOverEncodedName(diskName);
  const safe = safeDisplayFileName(decoded);
  const id = trackId.replace(/[^a-zA-Z0-9._-]/g, '') || trackId;
  const prefixes = [`${trackId}-`, `${id}-`, `sync-${id}`, `dl-${id}`];
  return prefixes.some((prefix) => decoded.startsWith(prefix) || safe.startsWith(prefix));
}

function pickRecoveredAudioName(names, track) {
  const idHits = names.filter((name) => audioFileMatchesTrackId(name, track.id));
  if (idHits.length === 1) {
    return idHits[0];
  }
  if (idHits.length > 1) {
    const wanted = track.sourceFileName;
    if (!wanted) {
      return undefined;
    }
    const named = idHits.filter(
      (name) => audioNamesEqual(name, wanted) || isUniqueAudioFileNameVariant(name, wanted),
    );
    return named.length === 1 ? named[0] : undefined;
  }

  const storedHints = [storedBasename(track.fileUri), storedBasename(track.inboxUri)].filter(Boolean);
  const storedHits = names.filter((name) => storedHints.some((hint) => audioNamesEqual(name, hint)));
  if (storedHits.length === 1) {
    return storedHits[0];
  }
  if (storedHits.length > 1) {
    return undefined;
  }

  const wanted = track.sourceFileName;
  if (!wanted) {
    return undefined;
  }

  const exact = names.filter((name) => audioNamesEqual(name, wanted));
  if (exact.length === 1) {
    return exact[0];
  }
  if (exact.length > 1) {
    return undefined;
  }

  const variants = names.filter((name) => isUniqueAudioFileNameVariant(name, wanted));
  return variants.length === 1 ? variants[0] : undefined;
}

const original = '11. [5125] ReNew (The Ark is Built).mp3';
const once = encodeURIComponent(original);
const twice = encodeURIComponent(once);
const triple = encodeURIComponent(twice);

assert.equal(decodeOverEncodedName(original), original);
assert.equal(decodeOverEncodedName(once), original);
assert.equal(decodeOverEncodedName(twice), original);
assert.equal(decodeOverEncodedName(triple), original);
assert.equal(
  decodeOverEncodedName('11.%252520%5B5125%5D%252520ReNew%252520(The%252520Ark%252520is%252520Built).mp3'),
  original,
);

assert.equal(fileExtension(original), '.mp3');
assert.equal(fileExtension(triple), '.mp3');
assert.equal(safeTempFileName('sync', 'track-mtklr5z5', original), 'sync-track-mtklr5z5.mp3');
assert.doesNotMatch(safeTempFileName('sync', 'id', original), / |%|\[/);
assert.equal(safeDisplayFileName(triple), original);

assert.equal(true, audioNamesEqual(triple, original));
assert.equal(true, audioNamesEqual(once, original));
assert.equal(true, audioNamesEqual(`${original.toUpperCase()}`, original));
assert.equal(false, audioNamesEqual('other song.mp3', original));

assert.equal(true, isUniqueAudioFileNameVariant('11. [5125] ReNew (The Ark is Built) 2.mp3', original));
assert.equal(true, isUniqueAudioFileNameVariant('11. [5125] ReNew (The Ark is Built) 13.mp3', once));
assert.equal(false, isUniqueAudioFileNameVariant(original, original));
assert.equal(false, isUniqueAudioFileNameVariant('11. [5125] ReNew extra.mp3', original));
assert.equal(false, isUniqueAudioFileNameVariant('cover 11. [5125] ReNew (The Ark is Built).mp3', original));

assert.equal(true, audioFileMatchesTrackId('track-mtklr5z5-11. [5125] ReNew (The Ark is Built).mp3', 'track-mtklr5z5'));
assert.equal(true, audioFileMatchesTrackId('sync-track-mtklr5z5.mp3', 'track-mtklr5z5'));
assert.equal(true, audioFileMatchesTrackId('dl-track-mtklr5z5.mp3', 'track-mtklr5z5'));
assert.equal(false, audioFileMatchesTrackId(original, 'track-mtklr5z5'));
assert.equal(false, audioFileMatchesTrackId('track-other-11. [5125] ReNew (The Ark is Built).mp3', 'track-mtklr5z5'));

const disk = [
  original,
  '11. [5125] ReNew (The Ark is Built) 2.mp3',
  'altro brano.m4a',
  'track-aaaa-solo.mp3',
];

assert.equal(
  pickRecoveredAudioName(disk, { id: 'track-mtklr5z5', sourceFileName: triple }),
  original,
);
assert.equal(
  pickRecoveredAudioName(
    ['11. [5125] ReNew (The Ark is Built) 2.mp3', 'altro brano.m4a'],
    { id: 'track-mtklr5z5', sourceFileName: original },
  ),
  '11. [5125] ReNew (The Ark is Built) 2.mp3',
);
assert.equal(
  pickRecoveredAudioName(disk, { id: 'track-aaaa', sourceFileName: original }),
  'track-aaaa-solo.mp3',
);
assert.equal(
  pickRecoveredAudioName(disk, {
    id: 'track-bbbb',
    sourceFileName: 'mancante.mp3',
    fileUri: `Audio/${encodeURIComponent(original)}`,
  }),
  original,
);
assert.equal(
  pickRecoveredAudioName(disk, { id: 'track-cccc', sourceFileName: 'altro brano.m4a' }),
  'altro brano.m4a',
);
assert.equal(
  pickRecoveredAudioName(
    [original, '11. [5125] ReNew (The Ark is Built) 2.mp3'],
    { id: 'track-dddd', sourceFileName: original },
  ),
  original,
);
assert.equal(
  pickRecoveredAudioName(
    ['11. [5125] ReNew (The Ark is Built) 2.mp3', '11. [5125] ReNew (The Ark is Built) 3.mp3'],
    { id: 'track-eeee', sourceFileName: original },
  ),
  undefined,
);
assert.equal(
  pickRecoveredAudioName(['cover song.m4a', 'my song.m4a'], {
    id: 'track-ffff',
    sourceFileName: 'song.m4a',
  }),
  undefined,
);

console.log('ok file names decode Drive copies with spaces and brackets');
console.log('ok recover matches safe/decode/unique/id-prefix without stealing another track');
