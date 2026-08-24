import { File } from 'expo-file-system';
import * as LegacyFS from 'expo-file-system/legacy';

import { isDownloaded } from '../domain/audioFormats';
import type { Track } from '../domain/models';
import { audioRelativePrefix } from './libraryOwner';
import { audioDirectory, downloadsDirectory, ensureAudioDirectory, inboxDirectory } from './libraryPaths';
import {
  libraryFileExists,
  persistLibraryUri,
  recoverAudioRelative,
  resolveLibraryUri,
  resolvedPlayableUri,
} from './libraryUris';

export { audioDirectory, downloadsDirectory, inboxDirectory } from './libraryPaths';

function safeFileName(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, '-').trim() || 'traccia.m4a';
}

export function uniqueAudioFileName(fileName: string): string {
  const safe = safeFileName(fileName);
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
  await LegacyFS.copyAsync({ from, to: dest.uri });
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

export function reconcileTrack(track: Track): Track {
  const recovered = recoverAudioRelative(track);
  const fileUri = recovered.fileUri;
  const inboxUri = recovered.inboxUri;
  const artworkUri = persistLibraryUri(track.artworkUri);
  const remoteUri = track.remoteUri?.startsWith('http') ? track.remoteUri : undefined;
  return {
    ...track,
    fileUri,
    inboxUri,
    remoteUri,
    downloaded: Boolean(fileUri),
    downloadedAt: fileUri ? track.downloadedAt : undefined,
    artworkUri: artworkUri && fileExists(artworkUri) ? artworkUri : undefined,
  };
}

export function trackNeedsDownload(track: Track): boolean {
  return !isDownloaded(track) && Boolean(resolvedPlayableUri(track) || track.remoteUri);
}
