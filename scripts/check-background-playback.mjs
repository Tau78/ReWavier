import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const engine = readFileSync(join(root, 'src/audio/fileEngine.ts'), 'utf8');
assert.match(engine, /shouldPlayInBackground:\s*true/);
assert.match(engine, /keepAudioSessionActive:\s*true/);
assert.match(engine, /setActiveForLockScreen\(\s*true/);
assert.doesNotMatch(engine, /shouldPlayInBackground:\s*false/);
assert.match(engine, /player\.clearLockScreenControls\(\)/);
const publishBody = engine.match(/private publishLockScreen\(\) \{[\s\S]*?\n  \}/)?.[0] ?? '';
assert.match(publishBody, /setActiveForLockScreen/);
assert.doesNotMatch(publishBody, /clearLockScreenControls/);

const app = JSON.parse(readFileSync(join(root, 'app.json'), 'utf8'));
assert.deepEqual(app.expo.ios.infoPlist.UIBackgroundModes, ['audio']);
assert.ok(
  app.expo.android.permissions.includes('android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK'),
);

const sketch = readFileSync(join(root, 'src/features/library/RecordSketchScreen.tsx'), 'utf8');
assert.match(sketch, /applyPlaybackAudioMode/);
assert.match(sketch, /shouldPlayInBackground:\s*false/);

console.log('check-background-playback: ok');
