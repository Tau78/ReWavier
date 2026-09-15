import assert from 'node:assert/strict';

/** Keep in sync with `src/cloud/driveFolderLink.ts`. */
const DRIVE_HOSTS = new Set(['drive.google.com', 'docs.google.com']);
const ID_RE = /^[a-zA-Z0-9_-]{15,}$/;

function hostIsDrive(hostname) {
  const host = hostname.replace(/^www\./i, '').toLowerCase();
  return DRIVE_HOSTS.has(host);
}

function firstPathId(pathname, folder) {
  const parts = pathname.split('/').filter(Boolean);
  const index = parts.indexOf(folder);
  if (index < 0 || !parts[index + 1]) {
    return null;
  }
  const id = parts[index + 1];
  return ID_RE.test(id) ? id : null;
}

function parseDriveFolderLink(input) {
  const raw = input.trim();
  if (!raw) {
    return null;
  }

  const maybeUrl = /^https?:\/\//i.test(raw)
    ? raw
    : /(^|\s)(drive|docs)\.google\.com\//i.test(raw)
      ? `https://${raw.replace(/^\s*\/\//, '')}`
      : null;

  if (maybeUrl) {
    try {
      const url = new URL(maybeUrl.split(/\s+/)[0]);
      if (hostIsDrive(url.hostname)) {
        const fromFolders = firstPathId(url.pathname, 'folders');
        if (fromFolders) {
          return fromFolders;
        }
        const fromShared = firstPathId(url.pathname, 'shared-drives');
        if (fromShared) {
          return fromShared;
        }
        const fileParts = url.pathname.split('/');
        const fileAt = fileParts.indexOf('d');
        if (fileParts.includes('file') && fileAt >= 0 && fileParts[fileAt + 1] && ID_RE.test(fileParts[fileAt + 1])) {
          return fileParts[fileAt + 1];
        }
        const id = url.searchParams.get('id');
        if (id && ID_RE.test(id)) {
          return id;
        }
      }
    } catch {
      // Not a URL.
    }
  }

  if (ID_RE.test(raw) && /\d/.test(raw)) {
    return raw;
  }
  return null;
}

const folderId = '1aBcDeFgHiJkLmNoPqRsTuvwx';
assert.equal(parseDriveFolderLink(`https://drive.google.com/drive/folders/${folderId}`), folderId);
assert.equal(
  parseDriveFolderLink(`https://drive.google.com/drive/u/0/folders/${folderId}?usp=sharing`),
  folderId,
);
assert.equal(parseDriveFolderLink(`https://drive.google.com/open?id=${folderId}`), folderId);
assert.equal(
  parseDriveFolderLink(`https://drive.google.com/drive/shared-drives/0ANsharedDriveRoot12`),
  '0ANsharedDriveRoot12',
);
assert.equal(parseDriveFolderLink(`drive.google.com/drive/folders/${folderId}`), folderId);
assert.equal(parseDriveFolderLink(folderId), folderId);
assert.equal(parseDriveFolderLink('DPB'), null);
assert.equal(parseDriveFolderLink('cartella band'), null);
assert.equal(parseDriveFolderLink(''), null);

function folderBelongsOnSharedTab(file) {
  if (file.driveId) {
    return true;
  }
  return file.ownedByMe === false;
}

assert.equal(folderBelongsOnSharedTab({ ownedByMe: true }), false);
assert.equal(folderBelongsOnSharedTab({}), false);
assert.equal(folderBelongsOnSharedTab({ ownedByMe: false }), true);
assert.equal(folderBelongsOnSharedTab({ ownedByMe: true, driveId: '0ANsharedDriveRoot12' }), true);
assert.equal(folderBelongsOnSharedTab({ driveId: '0ANsharedDriveRoot12' }), true);

function parseReturnParams(url) {
  const raw = url.trim();
  const params = new URLSearchParams();
  if (!raw) {
    return params;
  }
  if (!raw.includes('://') && !raw.startsWith('?') && !raw.startsWith('#') && raw.includes('=')) {
    new URLSearchParams(raw).forEach((value, key) => params.set(key, value));
    return params;
  }
  const hashAt = raw.indexOf('#');
  const queryAt = raw.indexOf('?');
  const query =
    queryAt >= 0 ? raw.slice(queryAt + 1, hashAt > queryAt ? hashAt : undefined) : '';
  const hash = hashAt >= 0 ? raw.slice(hashAt + 1) : '';
  new URLSearchParams(query).forEach((value, key) => params.set(key, value));
  new URLSearchParams(hash).forEach((value, key) => {
    if (!params.has(key)) {
      params.set(key, value);
    }
  });
  return params;
}

function parsePickedFileIds(url) {
  const params = parseReturnParams(url);
  const joined = params.get('picked_file_ids') || params.get('pickedFileIds') || '';
  return joined
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

assert.deepEqual(parsePickedFileIds('rewavier://oauth?picked_file_ids=abc,def'), ['abc', 'def']);
assert.deepEqual(
  parsePickedFileIds('https://eventi.musicproeventi.it/ReWavier/oauth.html#picked_file_ids=0ANdrive&access_token=tok'),
  ['0ANdrive'],
);
assert.deepEqual(parsePickedFileIds('rewavier://oauth'), []);
assert.deepEqual(parsePickedFileIds('picked_file_ids=abc,def'), ['abc', 'def']);

function parsePickedDrivePins(url) {
  const params = parseReturnParams(url);
  const json = params.get('picked_drives_json') || '';
  if (!json) {
    return [];
  }
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((item) => ({
        id: typeof item?.id === 'string' ? item.id.trim() : '',
        name: typeof item?.name === 'string' ? item.name.trim() : '',
      }))
      .filter((item) => item.id && item.name);
  } catch {
    return [];
  }
}

assert.deepEqual(
  parsePickedDrivePins(
    `rewavier://oauth?picked_drives_json=${encodeURIComponent(JSON.stringify([{ id: '0ANsharedDriveDpb12', name: 'DPB' }]))}`,
  ),
  [{ id: '0ANsharedDriveDpb12', name: 'DPB' }],
);

assert.deepEqual(
  parsePickedFileIds(
    `rewavier://oauth?picked_file_ids=1nestedAlbumFolder99&picked_drives_json=${encodeURIComponent(
      JSON.stringify([{ id: '0ANsharedDriveDpb12', name: 'DPB' }]),
    )}`,
  ),
  ['1nestedAlbumFolder99'],
);

function resolveDriveShortcut(file) {
  const targetId = file.shortcutDetails?.targetId?.trim();
  if (file.mimeType !== 'application/vnd.google-apps.shortcut' || !targetId) {
    return file;
  }
  return {
    ...file,
    id: targetId,
    mimeType: file.shortcutDetails?.targetMimeType || file.mimeType,
  };
}

function isDriveAudio(file) {
  if (/\.(wav|aiff|aif|mp4|mp3|aac|m4a|caf|flac|ogg)$/i.test(file.name)) {
    return true;
  }
  return (file.mimeType || '').toLowerCase().startsWith('audio/');
}

assert.equal(resolveDriveShortcut({ id: 'short', name: 'Take.mp3', mimeType: 'application/vnd.google-apps.shortcut', shortcutDetails: { targetId: 'realAudio1', targetMimeType: 'audio/mpeg' } }).id, 'realAudio1');
assert.equal(isDriveAudio({ name: 'Take.mp3', mimeType: 'application/vnd.google-apps.folder' }), true);
assert.equal(isDriveAudio({ name: 'Take 3', mimeType: 'audio/mpeg' }), true);
assert.equal(isDriveAudio({ name: 'cover.jpg', mimeType: 'image/jpeg' }), false);

console.log('ok drive folder link parser');
