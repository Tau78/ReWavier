import { libraryFileExists, recoverAudioRelative, resolvedPlayableUri } from '../files/libraryUris';

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

export function isRemoteHttpUri(uri?: string): boolean {
  return Boolean(uri?.startsWith('http://') || uri?.startsWith('https://'));
}

function localOnDeviceUri(uri?: string): string | undefined {
  if (!uri || isRemoteHttpUri(uri) || !libraryFileExists(uri)) {
    return undefined;
  }
  return uri;
}

/** True when the audio file is on this phone — not when a sync flag says so. */
export function isDownloaded(track: {
  id?: string;
  downloaded?: boolean;
  fileUri?: string;
  inboxUri?: string;
  sourceFileName?: string;
  remoteUri?: string;
}): boolean {
  if (track.id) {
    const recovered = recoverAudioRelative({
      id: track.id,
      fileUri: isRemoteHttpUri(track.fileUri) ? undefined : track.fileUri,
      inboxUri: isRemoteHttpUri(track.inboxUri) ? undefined : track.inboxUri,
      sourceFileName: track.sourceFileName,
    });
    return Boolean(localOnDeviceUri(recovered.fileUri) || localOnDeviceUri(recovered.inboxUri));
  }
  return Boolean(localOnDeviceUri(track.fileUri) || localOnDeviceUri(track.inboxUri));
}

export function trackCanFetchRemote(track: { driveFileId?: string; remoteUri?: string }): boolean {
  return Boolean(track.driveFileId || track.remoteUri?.startsWith('http'));
}
