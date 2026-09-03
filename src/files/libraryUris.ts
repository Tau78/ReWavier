import { Directory, File, Paths } from 'expo-file-system';

import { decodePathSegment, pickRecoveredAudioName, storedBasename } from './fileNames';
import { audioRelativePrefix } from './libraryOwner';
import {
  audioDirectory,
  downloadsDirectory,
  inboxDirectory,
  libraryDirectory,
  sharedAudioDirectory,
} from './libraryPaths';

const LEGACY_MARKER = '/rewavier/';
const DOCUMENTS_MARKER = '/Documents/';

function basename(uri: string): string {
  return storedBasename(uri);
}

function persistRelative(relative: string): string {
  return relative.split('/').filter(Boolean).map(decodePathSegment).join('/');
}

function documentsRelative(uri: string): string | undefined {
  const docs = Paths.document.uri.replace(/\/$/, '');
  const clean = uri.split('?')[0] ?? uri;
  let raw: string | undefined;
  if (clean.startsWith(`${docs}/`)) {
    raw = clean.slice(docs.length + 1);
  } else {
    const marker = clean.lastIndexOf(DOCUMENTS_MARKER);
    if (marker >= 0) {
      raw = clean.slice(marker + DOCUMENTS_MARKER.length);
    }
  }
  if (!raw) {
    return undefined;
  }
  return persistRelative(raw);
}

function fileFromRelative(relative: string): File {
  const parts = persistRelative(relative).split('/').filter(Boolean);
  if (parts[0] === 'Audio') {
    return new File(Paths.document, ...parts);
  }
  return new File(libraryDirectory(), ...parts);
}

export function persistLibraryUri(uri?: string): string | undefined {
  if (!uri) {
    return undefined;
  }
  if (uri.startsWith('http://') || uri.startsWith('https://')) {
    return uri;
  }
  const fromDocs = documentsRelative(uri);
  if (fromDocs) {
    if (fromDocs.startsWith('Audio/')) {
      return fromDocs;
    }
    if (fromDocs.startsWith('rewavier/')) {
      return fromDocs.slice('rewavier/'.length);
    }
    return fromDocs;
  }
  const marker = uri.lastIndexOf(LEGACY_MARKER);
  if (marker >= 0) {
    return persistRelative(uri.slice(marker + LEGACY_MARKER.length));
  }
  if (!uri.includes('://') && !uri.startsWith('/')) {
    return persistRelative(uri);
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
  const persisted = persistLibraryUri(stored);
  if (persisted && persisted !== stored) {
    return resolveLibraryUri(persisted);
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

  const query = {
    id: track.id,
    sourceFileName: track.sourceFileName,
    fileUri: track.fileUri || fileUri,
    inboxUri: track.inboxUri || inboxUri,
  };

  const ownerAudio = listNames(audioDirectory());
  const ownerHit = pickRecoveredAudioName(ownerAudio, query);
  if (ownerHit) {
    return { fileUri: `${audioRelativePrefix()}/${ownerHit}` };
  }

  const ownerUri = audioDirectory().uri;
  const sharedDir = sharedAudioDirectory();
  if (sharedDir.uri !== ownerUri) {
    const sharedHit = pickRecoveredAudioName(listNames(sharedDir), query);
    if (sharedHit) {
      return { fileUri: `Audio/${sharedHit}` };
    }
  }

  const downloadHit = pickRecoveredAudioName(listNames(downloadsDirectory()), query);
  if (downloadHit) {
    return { fileUri: `downloads/${downloadHit}` };
  }
  const inboxHit = pickRecoveredAudioName(listNames(inboxDirectory()), query);
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
