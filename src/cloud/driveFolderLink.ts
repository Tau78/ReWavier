/** Keep `scripts/check-drive-folder-link.mjs` in sync. */

const DRIVE_HOSTS = new Set(['drive.google.com', 'docs.google.com']);
const ID_RE = /^[a-zA-Z0-9_-]{15,}$/;

function hostIsDrive(hostname: string): boolean {
  const host = hostname.replace(/^www\./i, '').toLowerCase();
  return DRIVE_HOSTS.has(host);
}

function firstPathId(pathname: string, folder: string): string | null {
  const parts = pathname.split('/').filter(Boolean);
  const index = parts.indexOf(folder);
  if (index < 0 || !parts[index + 1]) {
    return null;
  }
  const id = parts[index + 1];
  return ID_RE.test(id) ? id : null;
}

/**
 * Folder / Drive id from a Drive link, or a pasted id.
 * Names like «DPB» are not ids.
 */
export function parseDriveFolderLink(input: string): string | null {
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
      // Not a URL — try a bare id below.
    }
  }

  if (ID_RE.test(raw) && /\d/.test(raw)) {
    return raw;
  }
  return null;
}
