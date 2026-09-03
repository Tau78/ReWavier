import { File } from 'expo-file-system';
import * as LegacyFS from 'expo-file-system/legacy';

import { isDownloaded, isRemoteHttpUri } from '../domain/audioFormats';
import type { Track } from '../domain/models';
import { safeDisplayFileName } from './fileNames';
import { audioRelativePrefix } from './libraryOwner';
import { audioDirectory, downloadsDirectory, ensureAudioDirectory, inboxDirectory } from './libraryPaths';
import {
  libraryFileExists,
  persistLibraryUri,
  recoverAudioRelative,
  resolveLibraryUri,
  resolvedPlayableUri,
} from './libraryUris';

export { audioDirectory, downloadsDirectory, ensureInboxDirectory, inboxDirectory } from './libraryPaths';

export function uniqueAudioFileName(fileName: string): string {
  const safe = safeDisplayFileName(fileName);
  const dir = audioDirectory();
  if (!new File(dir, safe).exists) {
    return safe;
  }
  const dot = safe.lastIndexOf('.');
  const base = dot > 0 ? safe.slice(0, dot) : safe;
  const ext = dot > 0 ? safe.slice(dot) : '';
  for (let n = 2; n < 1000; n++) {
    const candidate = `${base} ${n}${ext}`;
    if (!new File(dir, candidate).exists) {
      return candidate;
    }
  }
  return `${base} ${Date.now()}${ext}`;
}

export function fileExists(uri?: string): boolean {
  return libraryFileExists(uri);
}

export async function copyToInbox(sourceUri: string, _trackId: string, fileName: string): Promise<string> {
  return copyToDownloads(sourceUri, _trackId, fileName);
}

export async function copyToDownloads(
  sourceUri: string,
  _trackId: string,
  fileName: string,
): Promise<string> {
  await ensureAudioDirectory();
  const name = uniqueAudioFileName(fileName);
  const dest = new File(audioDirectory(), name);
  const from = resolveLibraryUri(sourceUri) ?? sourceUri;
  if (from === dest.uri) {
    return persistLibraryUri(dest.uri) ?? `${audioRelativePrefix()}/${name}`;
  }
  try {
    const source = new File(from);
    if (!source.exists) {
      throw new Error('missing');
    }
    if (dest.exists) {
      dest.delete();
    }
    source.copy(dest);
  } catch {
    throw new Error('Questo brano non è arrivato sul telefono. Riprova.');
  }
  return persistLibraryUri(dest.uri) ?? `${audioRelativePrefix()}/${name}`;
}

export async function removeUri(uri?: string): Promise<void> {
  const resolved = resolveLibraryUri(uri);
  if (!resolved || !fileExists(uri)) {
    return;
  }
  try {
    await LegacyFS.deleteAsync(resolved, { idempotent: true });
  } catch {
    // already gone
  }
}

function keepLocalUri(uri?: string): string | undefined {
  if (!uri || isRemoteHttpUri(uri)) {
    return undefined;
  }
  const persisted = persistLibraryUri(uri);
  return persisted && !isRemoteHttpUri(persisted) && fileExists(persisted) ? persisted : undefined;
}

export function reconcileTrack(track: Track): Track {
  const recovered = recoverAudioRelative({
    ...track,
    fileUri: isRemoteHttpUri(track.fileUri) ? undefined : track.fileUri,
    inboxUri: isRemoteHttpUri(track.inboxUri) ? undefined : track.inboxUri,
  });
  const fileUri = keepLocalUri(recovered.fileUri) ?? keepLocalUri(track.fileUri);
  const inboxUri = keepLocalUri(recovered.inboxUri) ?? keepLocalUri(track.inboxUri);
  const onDevice = Boolean(fileUri || inboxUri);
  const artworkUri = persistLibraryUri(track.artworkUri);
  const remoteUri = track.remoteUri?.startsWith('http') ? track.remoteUri : undefined;
  return {
    ...track,
    fileUri,
    inboxUri,
    remoteUri,
    downloaded: onDevice,
    downloadedAt: onDevice ? track.downloadedAt : undefined,
    artworkUri: artworkUri && fileExists(artworkUri) ? artworkUri : undefined,
  };
}

export function trackNeedsDownload(track: Track): boolean {
  return !isDownloaded(track) && Boolean(resolvedPlayableUri(track) || track.remoteUri);
}
