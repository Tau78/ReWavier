import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Keep in sync with download path in `src/cloud/driveApi.ts` / `src/files/downloads.ts`. */

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const driveApi = readFileSync(join(root, 'src/cloud/driveApi.ts'), 'utf8');
const downloads = readFileSync(join(root, 'src/files/downloads.ts'), 'utf8');

assert.match(driveApi, /alt=media&supportsAllDrives=true/);
assert.match(driveApi, /acknowledgeAbuse=true/);
assert.match(driveApi, /Prefer fetch over the native resumable downloader/);
assert.match(driveApi, /writeDownloadBytes/);
assert.match(driveApi, /fetchDrive\(/);
assert.doesNotMatch(driveApi, /LegacyFS\.createDownloadResumable/);

assert.match(downloads, /LegacyFS\.copyAsync/);
assert.match(downloads, /toFileUri/);

console.log('ok drive download uses fetch + supportsAllDrives');
