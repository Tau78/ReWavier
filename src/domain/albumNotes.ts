export const ALBUM_NOTES_FILE_NAME = 'Appunti album.txt';
export const ALBUM_NOTES_FILE_ALIAS = 'rewavier.notes.txt';

export function isAlbumNotesFileName(fileName: string): boolean {
  const name = fileName.trim().toLowerCase();
  return name === ALBUM_NOTES_FILE_NAME.toLowerCase() || name === ALBUM_NOTES_FILE_ALIAS;
}

export function albumNotesFromRemote(
  localNotes: string | undefined,
  localUpdatedAt: number,
  remoteNotes: string,
  remoteUpdatedAt: number,
): { notes: string; updatedAt: number } | null {
  const remote = remoteNotes.replace(/^\uFEFF/, '');
  const local = localNotes ?? '';
  if (remote === local) {
    return null;
  }
  if (remote.trim() && remoteUpdatedAt > localUpdatedAt) {
    return { notes: remote, updatedAt: remoteUpdatedAt };
  }
  if (local.trim() && localUpdatedAt >= remoteUpdatedAt) {
    return null;
  }
  if (remote.trim() && !local.trim()) {
    return { notes: remote, updatedAt: remoteUpdatedAt };
  }
  return null;
}
