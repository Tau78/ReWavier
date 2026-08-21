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
  fileUri?: string;
  inboxUri?: string;
  remoteUri?: string;
}): string | undefined {
  return track.fileUri || track.inboxUri || track.remoteUri;
}

export function isDownloaded(track: { downloaded?: boolean; fileUri?: string }): boolean {
  return track.downloaded === true && Boolean(track.fileUri);
}
