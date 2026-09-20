import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Bubble tap opens note + plays; vertical pin / overview dots cue-only. */

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const waveform = readFileSync(join(root, 'src/features/player/Waveform.tsx'), 'utf8');
const overview = readFileSync(
  join(root, 'src/features/library/TrackOverviewWaveform.tsx'),
  'utf8',
);
const libraryUris = readFileSync(join(root, 'src/files/libraryUris.ts'), 'utf8');
const fileEngine = readFileSync(join(root, 'src/audio/fileEngine.ts'), 'utf8');
const driveApi = readFileSync(join(root, 'src/cloud/driveApi.ts'), 'utf8');

assert.match(waveform, /function ZoomMarkerPin/);
assert.match(waveform, /openMarker\(marker\.id\)/);
assert.match(waveform, /playFrom\(marker\.timestampMs\)/);
assert.match(waveform, /Vertical cue only: seek\/play, do not open the note/);
assert.match(waveform, /pointerEvents="box-none"/);
assert.match(waveform, /onPress=\{\(\) => playFrom\(marker\.timestampMs\)\}/);
assert.doesNotMatch(
  waveform,
  /overviewDot[\s\S]{0,400}onPress=\{\(\) => openMarker\(marker\.id\)\}/,
);

assert.match(overview, /onPress=\{\(\) => playFrom\(marker\.timestampMs\)\}/);
assert.doesNotMatch(overview, /openMarker\(marker\.id\)/);

assert.match(libraryUris, /toFileUri\(resolved\)/);
assert.match(fileEngine, /toFileUri\(uri\)/);
assert.match(fileEngine, /Platform\.OS === 'android'/);
assert.match(driveApi, /MAX_IN_MEMORY_DOWNLOAD/);
assert.match(driveApi, /Content-Length/);

console.log('ok note bubble opens+plays; pin/overview cue-only; Android URI/download guards');
