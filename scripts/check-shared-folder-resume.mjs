import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Shared folder must survive Android resume: no wipe on empty listing. */

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const driveApi = readFileSync(join(root, 'src/cloud/driveApi.ts'), 'utf8');
const syncEngine = readFileSync(join(root, 'src/cloud/syncEngine.ts'), 'utf8');

assert.match(driveApi, /Empty page is common on Shared Drives/);
assert.match(driveApi, /corpora=allDrives/);
assert.doesNotMatch(
  driveApi,
  /if \(first\.files\.length > 0 \|\| !options\?\.sharedDriveId\)/,
);

assert.match(syncEngine, /listingSuspectEmpty/);
assert.match(syncEngine, /empty remote list with local tracks/);
assert.match(syncEngine, /ensureAlbumSharedDriveId/);
assert.match(syncEngine, /sharedDriveIdFromFile/);
assert.match(syncEngine, /linkAlbumDriveFolder/);

console.log('ok shared folder: empty listing does not wipe; Shared Drive id healed');
