import assert from 'node:assert/strict';

function createId(prefix) {
  return `${prefix}-test`;
}

function uniqueTrackIds(ids) {
  const seen = new Set();
  const next = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    next.push(id);
  }
  return next;
}

function versionFolderName(titles) {
  const cleaned = titles
    .map((title) =>
      title
        .replace(/^\s*\d+\.\s*/, '')
        .replace(/\s*[\(\[]\d{2,4}[\)\]]\s*/g, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(Boolean);
  if (cleaned.length === 0) return 'Versioni';
  let prefix = cleaned[0];
  for (const title of cleaned.slice(1)) {
    let i = 0;
    const max = Math.min(prefix.length, title.length);
    while (i < max && prefix[i]?.toLowerCase() === title[i]?.toLowerCase()) i += 1;
    prefix = prefix.slice(0, i).replace(/[\s\-–_:]+$/u, '').trim();
    if (prefix.length < 3) return cleaned[0];
  }
  return prefix || cleaned[0];
}

function applyDrop(album, sourceId, targetId) {
  if (sourceId === targetId) return null;
  const folders = [...(album.versionFolders ?? [])];
  const top = [...album.trackIds];
  const sourceFolder = folders.find((folder) => folder.id === sourceId);
  const targetFolder = folders.find((folder) => folder.id === targetId);
  const remove = (id) => {
    const index = top.indexOf(id);
    if (index >= 0) top.splice(index, 1);
  };
  if (!sourceFolder && !targetFolder) {
    const folder = {
      id: createId('ver'),
      name: versionFolderName(['01. [1997] Into take 1', '01. [1997] Into take 2']),
      trackIds: uniqueTrackIds([targetId, sourceId]),
      chosenId: targetId,
    };
    remove(sourceId);
    remove(targetId);
    top.splice(0, 0, folder.id);
    return { ...album, trackIds: top, versionFolders: [...folders, folder] };
  }
  if (!sourceFolder && targetFolder) {
    targetFolder.trackIds = uniqueTrackIds([...targetFolder.trackIds, sourceId]);
    remove(sourceId);
    return { ...album, trackIds: top, versionFolders: folders };
  }
  return null;
}

const album = { trackIds: ['a', 'b', 'c'], versionFolders: [] };
const packed = applyDrop(album, 'b', 'a');
assert.equal(packed.trackIds[0], 'ver-test');
assert.deepEqual(packed.versionFolders[0].trackIds, ['a', 'b']);
assert.equal(packed.versionFolders[0].chosenId, 'a');
assert.equal(packed.versionFolders[0].name, 'Into take');

const added = applyDrop(packed, 'c', 'ver-test');
assert.deepEqual(added.versionFolders[0].trackIds, ['a', 'b', 'c']);
assert.ok(!added.trackIds.includes('c'));

assert.equal(versionFolderName(['Roo mix', 'Jad']), 'Roo mix');

console.log('check-album-versions: ok');
