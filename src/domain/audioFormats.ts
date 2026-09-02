import { resolvedPlayableUri } from '../files/libraryUris';

export const AUDIO_EXTENSIONS = [
  'wav',
  'aiff',
  'aif',
  'mp4',
  'mp3',
  'aac',
  'm4a',
  'caf',
  'flac',
  'ogg',
] as const;

export const AUDIO_PICKER_TYPES = ['audio/*', 'public.audio', 'application/json'];

const AUDIO_NAME = new RegExp(`\\.(${AUDIO_EXTENSIONS.join('|')})$`, 'i');

export function isAudioName(fileName: string): boolean {
  return AUDIO_NAME.test(fileName);
}

export function playableUri(track: {
  id?: string;
  fileUri?: string;
  inboxUri?: string;
  remoteUri?: string;
  sourceFileName?: string;
}): string | undefined {
  return resolvedPlayableUri(track);
}

export function isDownloaded(track: { downloaded?: boolean; fileUri?: string }): boolean {
  return track.downloaded === true && Boolean(track.fileUri);
}

export function trackCanFetchRemote(track: { driveFileId?: string; remoteUri?: string }): boolean {
  return Boolean(track.driveFileId || track.remoteUri?.startsWith('http'));
}
