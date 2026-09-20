import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = (rel) => readFileSync(join(root, rel), 'utf8');

const members = load('src/domain/albumMembers.ts');
assert.match(members, /MEMBERS_FILE_NAME/);
assert.match(members, /\.rewavier\.members\.json/);

const library = load('src/domain/library.ts');
assert.match(library, /memberColors\?:/);
assert.match(library, /memberEmails\?:/);

const markers = load('src/domain/markers.ts');
assert.match(markers, /colorOverrides\?:/);

const drive = load('src/cloud/driveApi.ts');
assert.match(drive, /listFolderPermissionPeople/);

const sync = load('src/cloud/syncEngine.ts');
assert.match(sync, /pushAlbumMembers/);
assert.match(sync, /pullAlbumMembers/);

const ui = load('src/features/library/AlbumMembersSection.tsx');
assert.match(ui, /Membri di questo album/);
assert.match(ui, /ColorSwatches/);

const collection = load('src/features/library/CollectionScreen.tsx');
assert.match(collection, /AlbumMembersSection/);

console.log('ok album members section + color overrides');
