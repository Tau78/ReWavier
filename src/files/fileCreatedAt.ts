import { File } from 'expo-file-system';

import { resolvedPlayableUri } from './libraryUris';

/** Epoch ms for when the audio file was created on disk, if readable. */
export function fileCreatedAtMs(track: {
  id?: string;
  fileUri?: string;
  inboxUri?: string;
  remoteUri?: string;
  sourceFileName?: string;
  downloadedAt?: number;
}): number | undefined {
  const uri = resolvedPlayableUri(track);
  if (uri && !uri.startsWith('http://') && !uri.startsWith('https://')) {
    try {
      const file = new File(uri);
      if (file.exists) {
        const created = file.creationTime;
        if (typeof created === 'number' && created > 0) {
          return created;
        }
        try {
          const info = file.info();
          if (typeof info.creationTime === 'number' && info.creationTime > 0) {
            return info.creationTime;
          }
          if (typeof info.modificationTime === 'number' && info.modificationTime > 0) {
            return info.modificationTime;
          }
        } catch {
          // info() can throw without read access
        }
        if (typeof file.modificationTime === 'number' && file.modificationTime > 0) {
          return file.modificationTime;
        }
      }
    } catch {
      // Missing or unreadable file
    }
  }
  if (typeof track.downloadedAt === 'number' && track.downloadedAt > 0) {
    return track.downloadedAt;
  }
  return undefined;
}

/** Short Italian date for the file creation day (e.g. "6 set 2025"). */
export function formatFileCreatedAt(ms: number): string {
  return new Date(ms).toLocaleDateString('it-IT', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
