import { Directory, File } from 'expo-file-system';
import * as LegacyFS from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import { createId } from '../domain/library';
import { libraryFileExists, persistLibraryUri, resolveLibraryUri } from './libraryUris';
import { libraryDirectory } from './libraryPaths';

function documentsDirectory(): Directory {
  const dir = new Directory(libraryDirectory(), 'documents');
  if (!dir.exists) {
    dir.create();
  }
  return dir;
}

export async function saveDocumentFromUri(
  albumId: string,
  sourceUri: string,
  fileName: string,
): Promise<string> {
  const safe = fileName.replace(/[/\\?%*:|"<>]/g, '-');
  const dest = new File(documentsDirectory(), `${albumId}-${createId('doc')}-${safe}`);
  await LegacyFS.copyAsync({ from: sourceUri, to: dest.uri });
  return persistLibraryUri(dest.uri) ?? dest.uri;
}

export async function openAlbumDocument(fileUri: string, name: string): Promise<void> {
  const resolved = resolveLibraryUri(fileUri);
  if (!resolved || !libraryFileExists(fileUri)) {
    throw new Error('Questo documento non è più sul telefono.');
  }
  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new Error('Non riesco ad aprire il documento.');
  }
  await Sharing.shareAsync(resolved, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: name,
  });
}
