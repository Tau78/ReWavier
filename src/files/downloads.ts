import { Directory, File } from 'expo-file-system';
import * as LegacyFS from 'expo-file-system/legacy';

import { isDownloaded, playableUri } from '../domain/audioFormats';
import type { Track } from '../domain/models';
import { libraryDirectory } from './libraryPaths';

function ensureDir(name: string): Directory {
  const dir = new Directory(libraryDirectory(), name);
  if (!dir.exists) {
    dir.create();
  }
  return dir;
}

export function inboxDirectory(): Directory {
  return ensureDir('inbox');
}

export function downloadsDirectory(): Directory {
  return ensureDir('downloads');
}

function safeFileName(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, '-');
}

export function fileExists(uri?: string): boolean {
  if (!uri) {
    return false;
  }
  try {
    return new File(uri).exists === true;
  } catch {
    return false;
  }
}

export async function copyToInbox(sourceUri: string, trackId: string, fileName: string): Promise<string> {
  const dest = new File(inboxDirectory(), `${trackId}-${safeFileName(fileName)}`);
  await LegacyFS.copyAsync({ from: sourceUri, to: dest.uri });
  return dest.uri;
}

export async function copyToDownloads(
  sourceUri: string,
  trackId: string,
  fileName: string,
): Promise<string> {
  const dest = new File(downloadsDirectory(), `${trackId}-${safeFileName(fileName)}`);
  await LegacyFS.copyAsync({ from: sourceUri, to: dest.uri });
  return dest.uri;
}

export async function removeUri(uri?: string): Promise<void> {
  if (!uri || !fileExists(uri)) {
    return;
  }
  try {
    await LegacyFS.deleteAsync(uri, { idempotent: true });
  } catch {
    // already gone
  }
}

export function reconcileTrack(track: Track): Track {
  const fileOk = fileExists(track.fileUri);
  const inboxOk = fileExists(track.inboxUri);
  const remoteOk = fileExists(track.remoteUri);
  return {
    ...track,
    fileUri: fileOk ? track.fileUri : undefined,
    inboxUri: inboxOk ? track.inboxUri : undefined,
    remoteUri: track.remoteUri?.startsWith('http')
      ? track.remoteUri
      : remoteOk
        ? track.remoteUri
        : undefined,
    downloaded: fileOk,
    downloadedAt: fileOk ? track.downloadedAt : undefined,
    artworkUri: fileExists(track.artworkUri) ? track.artworkUri : undefined,
  };
}

export function trackNeedsDownload(track: Track): boolean {
  return !isDownloaded(track) && Boolean(playableUri(track) || track.remoteUri);
}
