import { File } from 'expo-file-system';
import * as LegacyFS from 'expo-file-system/legacy';

import { isDownloaded } from '../domain/audioFormats';
import type { Track } from '../domain/models';
import { downloadsDirectory, inboxDirectory } from './libraryPaths';
import {
  libraryFileExists,
  persistLibraryUri,
  recoverAudioRelative,
  resolveLibraryUri,
  resolvedPlayableUri,
} from './libraryUris';

export { downloadsDirectory, inboxDirectory } from './libraryPaths';

function safeFileName(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, '-');
}

export function fileExists(uri?: string): boolean {
  return libraryFileExists(uri);
}

export async function copyToInbox(sourceUri: string, trackId: string, fileName: string): Promise<string> {
  const name = `${trackId}-${safeFileName(fileName)}`;
  const dest = new File(inboxDirectory(), name);
  const from = resolveLibraryUri(sourceUri) ?? sourceUri;
  await LegacyFS.copyAsync({ from, to: dest.uri });
  return `inbox/${name}`;
}

export async function copyToDownloads(
  sourceUri: string,
  trackId: string,
  fileName: string,
): Promise<string> {
  const name = `${trackId}-${safeFileName(fileName)}`;
  const dest = new File(downloadsDirectory(), name);
  const from = resolveLibraryUri(sourceUri) ?? sourceUri;
  await LegacyFS.copyAsync({ from, to: dest.uri });
  return `downloads/${name}`;
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
