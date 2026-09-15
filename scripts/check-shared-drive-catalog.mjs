import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Keep in sync with `src/cloud/sharedDriveCatalog.ts`. */

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const screen = readFileSync(join(root, 'src/features/cloud/DriveFolderScreen.tsx'), 'utf8');
assert.doesNotMatch(screen, /showEmbeddedPicker/);
assert.doesNotMatch(screen, /SharedDrivePickerWebView/);
assert.match(screen, /pickSharedDriveFolder/);

const PIN_ID_RE = /^[a-zA-Z0-9_-]{10,}$/;

function isSharedDrivePinId(id) {
  return PIN_ID_RE.test(id.trim());
}

function parseSharedDriveCatalog(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return [];
  }
  const drives = raw.drives;
  if (!Array.isArray(drives)) {
    return [];
  }
  const out = [];
  const seen = new Set();
  for (const item of drives) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    if (!isSharedDrivePinId(id) || !name || seen.has(id)) {
      continue;
    }
    seen.add(id);
    out.push({ id, name });
  }
  return out;
}

function mergeSharedDrivePins(...groups) {
  const byId = new Map();
  for (const group of groups) {
    for (const pin of group) {
      const id = pin.id.trim();
      const name = pin.name.trim();
      if (!isSharedDrivePinId(id) || !name) {
        continue;
      }
      byId.set(id, { id, name });
    }
  }
  return [...byId.values()];
}

function pinsFromAlbums(albums) {
  const byId = new Map();
  for (const album of albums) {
    const id = album.driveSharedDriveId?.trim() ?? '';
    if (!isSharedDrivePinId(id)) {
      continue;
    }
    const isRoot = album.driveFolderId === id;
    if (!isRoot) {
      if (!byId.has(id)) {
        byId.set(id, { id, name: '' });
      }
      continue;
    }
    const label = (album.driveFolderName || album.name).trim();
    if (!label) {
      continue;
    }
    byId.set(id, { id, name: label });
  }
  return [...byId.values()];
}

function compareSharedDriveEntries(a, b) {
  const rank = (kind) => (kind === 'shared-drive' ? 0 : 1);
  const delta = rank(a.sharedKind) - rank(b.sharedKind);
  if (delta !== 0) {
    return delta;
  }
  return a.name.localeCompare(b.name, 'it', { sensitivity: 'base' });
}

function sortSharedDriveEntries(items) {
  return [...items].sort(compareSharedDriveEntries);
}

const dpb = '0ANsharedDriveDpb12';
const basi = '0ANsharedDriveBasi9';

assert.deepEqual(parseSharedDriveCatalog(null), []);
assert.deepEqual(parseSharedDriveCatalog({ drives: [{ id: dpb, name: 'DPB' }] }), [{ id: dpb, name: 'DPB' }]);
assert.deepEqual(parseSharedDriveCatalog({ drives: [{ id: 'nope', name: 'X' }] }), []);

assert.deepEqual(
  mergeSharedDrivePins([{ id: dpb, name: 'Prove' }], [{ id: dpb, name: 'DPB' }, { id: basi, name: 'Basi' }]),
  [
    { id: dpb, name: 'DPB' },
    { id: basi, name: 'Basi' },
  ],
);

assert.deepEqual(
  pinsFromAlbums([
    { name: 'Prove 12', driveFolderId: '1nestedFolderId999', driveSharedDriveId: dpb, driveFolderName: 'Prove 12' },
    { name: 'DPB', driveFolderId: dpb, driveSharedDriveId: dpb, driveFolderName: 'DPB' },
    { name: 'Locale' },
  ]),
  [{ id: dpb, name: 'DPB' }],
);

assert.deepEqual(
  pinsFromAlbums([
    {
      name: '#Album',
      driveFolderId: '1nestedFolderId999',
      driveSharedDriveId: dpb,
      driveFolderName: '#Album',
    },
  ]),
  [{ id: dpb, name: '' }],
);

assert.deepEqual(
  sortSharedDriveEntries([
    { name: 'Zeta', sharedKind: 'shared-folder' },
    { name: 'DPB', sharedKind: 'shared-drive' },
    { name: 'Basi', sharedKind: 'shared-drive' },
  ]).map((item) => item.name),
  ['Basi', 'DPB', 'Zeta'],
);

console.log('ok shared drive catalog');
