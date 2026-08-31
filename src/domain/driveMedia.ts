import { audioBasename } from './sidecar';

const IMAGE_NAME = /\.(jpe?g|png|heic|heif|webp|gif)$/i;
const ALBUM_COVER = /^(cover|folder|front)\.(jpe?g|png|gif|webp)$/i;

export function isImageName(fileName: string): boolean {
  return IMAGE_NAME.test(fileName);
}

export function isAlbumCoverName(fileName: string): boolean {
  return ALBUM_COVER.test(fileName.trim());
}

export function isPdfName(fileName: string): boolean {
  return fileName.trim().toLowerCase().endsWith('.pdf');
}

export function findAlbumCoverFile<T extends { name: string }>(files: T[]): T | undefined {
  return files.find((file) => isAlbumCoverName(file.name));
}

/** Image whose name matches the audio (song.mp3 + song.gif). Not cover.jpg. */
export function findTrackCoverFile<T extends { name: string }>(
  audioName: string,
  files: T[],
): T | undefined {
  const base = audioBasename(audioName).toLowerCase();
  if (!base) {
    return undefined;
  }
  return files.find((file) => {
    if (isAlbumCoverName(file.name) || !isImageName(file.name)) {
      return false;
    }
    return audioBasename(file.name).toLowerCase() === base;
  });
}
