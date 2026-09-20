import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function load(rel) {
  return readFileSync(join(root, rel), 'utf8');
}

// Domain helpers
const mentions = load('src/domain/mentions.ts');
assert.match(mentions, /export function extractMentionHandles/);
assert.match(mentions, /export function activeMentionQuery/);
assert.match(mentions, /export function insertMentionAt/);
assert.match(mentions, /export function filtersMentionCandidates/);

const people = load('src/domain/albumPeople.ts');
assert.match(people, /albumMentionCandidates/);
assert.match(people, /memberNames/);
assert.match(people, /preferMentionPerson/);
assert.match(people, /selfMentionHandles/);

// Store + persist
const store = load('src/store/notificationStore.ts');
assert.match(store, /ingestMarkerMention/);
assert.match(store, /ingestMentionsForSavedTrack/);
assert.match(store, /markRead/);

const persist = load('src/files/notificationPersist.ts');
assert.match(persist, /notifications\.json/);

// UI
const bubble = load('src/features/notes/NoteBubble.tsx');
assert.match(bubble, /mentionSuggestions/);
assert.match(bubble, /insertMentionAt/);
assert.match(bubble, /Usa @ per taggare/);

const collection = load('src/features/library/CollectionScreen.tsx');
assert.match(collection, /AlbumNotificationBell/);
assert.doesNotMatch(collection, /PlayerScreen/);

const bell = load('src/features/library/AlbumNotificationBell.tsx');
assert.match(bell, /ensurePlayableAndOpen/);
assert.match(bell, /markRead/);
assert.match(bell, /autoPlay: true/);

console.log('ok @ mention autocomplete + album notification bell');
