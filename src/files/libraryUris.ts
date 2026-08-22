import { Directory, File } from 'expo-file-system';

import { downloadsDirectory, inboxDirectory, libraryDirectory } from './libraryPaths';

const LIBRARY_MARKER = '/rewavier/';

function basename(uri: string): string {
  const clean = uri.split('?')[0] ?? uri;
  const parts = clean.replace(/\/$/, '').split('/');
  return decodeURIComponent(parts[parts.length - 1] ?? '');
}

function fileFromRelative(relative: string): File {
  const parts = relative.split('/').filter(Boolean);
  return new File(libraryDirectory(), ...parts);
}

export function persistLibraryUri(uri?: string): string | undefined {
  if (!uri) {
    return undefined;
  }
  if (uri.startsWith('http://') || uri.startsWith('https://')) {
    return uri;
  }
  const marker = uri.lastIndexOf(LIBRARY_MARKER);
  if (marker >= 0) {
    return uri.slice(marker + LIBRARY_MARKER.length);
  }
  if (!uri.includes('://') && !uri.startsWith('/')) {
    return uri;
  }
  return uri;
}

export function resolveLibraryUri(stored?: string): string | undefined {
  if (!stored) {
    return undefined;
  }
  if (stored.startsWith('http://') || stored.startsWith('https://')) {
    return stored;
  }
  if (!stored.includes('://') && !stored.startsWith('/')) {
    try {
      return fileFromRelative(stored).uri;
    } catch {
      return undefined;
    }
  }
  const marker = stored.lastIndexOf(LIBRARY_MARKER);
  if (marker >= 0) {
    try {
      return fileFromRelative(stored.slice(marker + LIBRARY_MARKER.length)).uri;
    } catch {
      return stored;
    }
  }
  return stored;
}

export function libraryFileExists(stored?: string): boolean {
  const resolved = resolveLibraryUri(stored);
  if (!resolved) {
    return false;
  }
  try {
    return new File(resolved).exists === true;
  } catch {
    return false;
  }
}

function listNames(dir: Directory): string[] {
  if (!dir.exists) {
    return [];
  }
  try {
    return dir
      .list()
      .map((entry) => basename(entry.uri))
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function recoverAudioRelative(track: {
  id: string;
  fileUri?: string;
  inboxUri?: string;
  sourceFileName?: string;
}): { fileUri?: string; inboxUri?: string } {
  const fileUri = persistLibraryUri(track.fileUri);
  const inboxUri = persistLibraryUri(track.inboxUri);
  if (fileUri && libraryFileExists(fileUri)) {
    return {
      fileUri,
      inboxUri: inboxUri && libraryFileExists(inboxUri) ? inboxUri : undefined,
    };
  }
  if (inboxUri && libraryFileExists(inboxUri)) {
    return { inboxUri };
  }

  const wanted = track.sourceFileName?.replace(/[/\\?%*:|"<>]/g, '-');
  const prefix = `${track.id}-`;
  const downloads = listNames(downloadsDirectory());
  const inbox = listNames(inboxDirectory());
  const downloadHit = downloads.find(
    (name) => name.startsWith(prefix) || (wanted ? name.endsWith(wanted) : false),
  );
  if (downloadHit) {
    return { fileUri: `downloads/${downloadHit}` };
  }
  const inboxHit = inbox.find(
    (name) => name.startsWith(prefix) || (wanted ? name.endsWith(wanted) : false),
  );
  if (inboxHit) {
    return { inboxUri: `inbox/${inboxHit}` };
  }
  return {};
}

export function resolvedPlayableUri(track: {
  id?: string;
  fileUri?: string;
  inboxUri?: string;
  remoteUri?: string;
  sourceFileName?: string;
}): string | undefined {
  for (const stored of [track.fileUri, track.inboxUri, track.remoteUri]) {
    if (!stored) {
      continue;
    }
    if (stored.startsWith('http://') || stored.startsWith('https://')) {
      return stored;
    }
    const resolved = resolveLibraryUri(stored);
    if (resolved && libraryFileExists(stored)) {
      return resolved;
    }
  }
  if (track.id) {
    const recovered = recoverAudioRelative({
      id: track.id,
      fileUri: track.fileUri,
      inboxUri: track.inboxUri,
      sourceFileName: track.sourceFileName,
    });
    const stored = recovered.fileUri || recovered.inboxUri;
    return stored ? resolveLibraryUri(stored) : undefined;
  }
  return undefined;
}
