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

console.log('ok drive folder link parser');
