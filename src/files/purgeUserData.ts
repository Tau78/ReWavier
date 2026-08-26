import { Directory, Paths } from 'expo-file-system';
import * as LegacyFS from 'expo-file-system/legacy';

import { removeUri } from './downloads';
import { pathExistsAsync } from './fsSafe';
import type { LibrarySnapshot } from './libraryPersist';
import { ownerKeyForUser } from './libraryOwner';

async function deleteDirectoryIfExists(uri: string): Promise<void> {
  if (!(await pathExistsAsync(uri))) {
    return;
  }
  await LegacyFS.deleteAsync(uri, { idempotent: true });
}

function userLibraryDirUri(owner: string): string {
  return new Directory(new Directory(Paths.document, 'rewavier'), 'users', owner).uri;
}

function userAudioDirUri(owner: string): string {
  return new Directory(Paths.document, 'Audio', owner).uri;
}

/** Removes this account’s library snapshot and audio files from the device. */
export async function purgeUserLibraryData(userId: string): Promise<void> {
  const owner = ownerKeyForUser(userId);
  const userLibDir = userLibraryDirUri(owner);
  const snapshotUri = `${userLibDir}/library.json`;

  if (await pathExistsAsync(snapshotUri)) {
    try {
      const raw = await LegacyFS.readAsStringAsync(snapshotUri);
      const snapshot = JSON.parse(raw) as LibrarySnapshot;
      for (const track of snapshot.tracks ?? []) {
        await removeUri(track.fileUri);
        await removeUri(track.inboxUri);
        await removeUri(track.artworkUri);
      }
    } catch {
      // Still remove folders below.
    }
  }

  await deleteDirectoryIfExists(userLibDir);
  await deleteDirectoryIfExists(userAudioDirUri(owner));
}
