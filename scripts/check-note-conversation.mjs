import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function visibleMarkers(markers) {
  return markers.filter((marker) => marker.hidden !== true);
}

function markersNearTime(markers, ms, windowMs = 350) {
  return markers
    .filter((marker) => Math.abs(marker.timestampMs - ms) <= windowMs)
    .sort((a, b) => a.createdAt - b.createdAt || a.timestampMs - b.timestampMs);
}

function conversationAtTime(markers, ms) {
  return visibleMarkers(markersNearTime(markers, ms));
}

function isOwnMarker(marker, user) {
  if (marker.authorId) {
    return Boolean(user?.id && marker.authorId === user.id);
  }
  if (!marker.authorName?.trim()) {
    return true;
  }
  const mine = user?.displayName?.trim();
  return Boolean(mine && mine === marker.authorName.trim());
}

function canShowNoteReply(folderReadOnly, conversationCount) {
  return !folderReadOnly && conversationCount > 0;
}

const me = { id: 'u1', displayName: 'Mauro' };
const first = {
  id: 'a',
  timestampMs: 20913,
  text: 'Va fatta suonare da un batterista vero',
  createdAt: 1,
  authorId: 'u1',
  authorName: 'Mauro',
};
const second = {
  id: 'b',
  timestampMs: 20913,
  text: 'Bellissima questa batteria',
  createdAt: 2,
  authorId: 'u2',
  authorName: 'Fabio Lagana',
};
const hidden = { ...second, id: 'c', hidden: true, createdAt: 3 };

const chat = conversationAtTime([first, second, hidden], 20913);
assert.equal(chat.length, 2);
assert.equal(chat[0].id, 'a');
assert.equal(chat[1].id, 'b');

assert.equal(isOwnMarker(first, me), true);
assert.equal(isOwnMarker(second, me), false);
assert.equal(isOwnMarker({ authorName: '' }, me), true);
assert.equal(isOwnMarker({ authorId: 'u1' }, me), true);

assert.equal(canShowNoteReply(false, 1), true);
assert.equal(canShowNoteReply(false, 2), true);
assert.equal(canShowNoteReply(false, 0), false);
assert.equal(canShowNoteReply(true, 2), false);

const bubble = readFileSync(join(root, 'src/features/notes/NoteBubble.tsx'), 'utf8');
assert.match(bubble, /chatRowMine/);
assert.match(bubble, /chatRowOther/);
assert.match(bubble, /canShowNoteReply/);
assert.match(bubble, /chatView/);
assert.match(bubble, /startReply/);
assert.match(bubble, /Scrivi la tua risposta/);
assert.match(bubble, /Elimina appunto/);
assert.doesNotMatch(bubble, /!readOnly && !chatView/);
assert.doesNotMatch(bubble, /Stesso momento/);

const waveform = readFileSync(join(root, 'src/features/player/Waveform.tsx'), 'utf8');
assert.match(waveform, /Elimina appunto/);

const store = readFileSync(join(root, 'src/store/playerStore.ts'), 'utf8');
assert.match(store, /captureResumeAfterBubble/);
assert.match(store, /resumeAfterBubble = true/);

console.log('ok note conversation');
