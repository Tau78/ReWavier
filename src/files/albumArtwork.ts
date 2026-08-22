import * as DocumentPicker from 'expo-document-picker';
import { Directory, File } from 'expo-file-system';
import * as LegacyFS from 'expo-file-system/legacy';

import { createId } from '../domain/library';
import { fileExists, removeUri } from './downloads';
import { libraryDirectory } from './libraryPaths';

const IMAGE_PICKER_TYPES = [
  'image/*',
  'public.image',
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/webp',
];

const IMAGE_NAME = /\.(jpe?g|png|heic|heif|webp|gif)$/i;

function artworkDirectory(): Directory {
  const dir = new Directory(libraryDirectory(), 'artwork');
  if (!dir.exists) {
    dir.create();
  }
  return dir;
}

function extensionFor(name: string, mimeType?: string): string {
  const fromName = name.match(IMAGE_NAME)?.[1]?.toLowerCase();
  if (fromName === 'jpeg') {
    return 'jpg';
  }
  if (fromName) {
    return fromName;
  }
  if (mimeType === 'image/png') {
    return 'png';
  }
  if (mimeType === 'image/webp') {
    return 'webp';
  }
  if (mimeType === 'image/heic' || mimeType === 'image/heif') {
    return 'heic';
  }
  return 'jpg';
}

export function isImageName(fileName: string): boolean {
  return IMAGE_NAME.test(fileName);
}

export async function pickAndSaveAlbumArtwork(albumId: string): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({
    multiple: false,
    copyToCacheDirectory: true,
    type: IMAGE_PICKER_TYPES,
  });
  if (result.canceled || !result.assets?.[0]) {
    return null;
  }
  const asset = result.assets[0];
  if (!isImageName(asset.name) && !asset.mimeType?.startsWith('image/')) {
    throw new Error('Scegli una foto o un’immagine.');
  }
  const ext = extensionFor(asset.name, asset.mimeType);
  const dest = new File(artworkDirectory(), `${albumId}-${createId('art')}.${ext}`);
  await LegacyFS.copyAsync({ from: asset.uri, to: dest.uri });
  return dest.uri;
}

export async function removeAlbumArtwork(uri?: string): Promise<void> {
  await removeUri(uri);
}

export function artworkExists(uri?: string): boolean {
  return fileExists(uri);
}
