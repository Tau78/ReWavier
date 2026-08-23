import { Alert, Platform, Share } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { playableUri } from '../domain/audioFormats';
import { formatTimecode, type Track } from '../domain/models';
import { extractClipViaWebView } from '../audio/clipBridge';
import { formatClipShareMessage, resolveClipWindow } from '../audio/clipWindow';
import { sliceLocalWavFile } from '../audio/sliceWavFile';
import { createWaveformJobId } from '../audio/waveformBridge';

export type ShareMarkerClipInput = {
  track: Track;
  timestampMs: number;
  noteText: string;
};

function fileNameFromUri(uri: string): string {
  const path = uri.split('?')[0] ?? uri;
  const parts = path.split('/');
  return decodeURIComponent(parts[parts.length - 1] ?? '');
}

function safeFileName(name: string): string {
  const cleaned = name.replace(/[/\\?%*:|"<>]/g, '-').replace(/\s+/g, ' ').trim();
  return cleaned || 'brano';
}

function clipBaseName(title: string, timestampMs: number): string {
  const time = formatTimecode(timestampMs).replace(/[:.]/g, '-');
  return `${safeFileName(title).slice(0, 40)} ${time}`;
}

function isRemoteUri(uri: string): boolean {
  return uri.startsWith('http://') || uri.startsWith('https://');
}

function isUserCancel(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error ?? '');
  return /cancel|dismiss|abort/i.test(text);
}

function writeCompanionTxt(wavUri: string, message: string): void {
  try {
    const txtUri = wavUri.replace(/\.wav$/i, '.txt');
    const file = new File(txtUri);
    file.write(message);
  } catch {
    // optional sidecar
  }
}

function writeWavBytes(fileName: string, bytes: Uint8Array): string {
  const dest = new File(Paths.cache, fileName);
  dest.write(bytes);
  return dest.uri;
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = globalThis.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function writeWavBase64(fileName: string, base64: string): string {
  try {
    const dest = new File(Paths.cache, fileName);
    dest.write(base64, { encoding: 'base64' });
    return dest.uri;
  } catch {
    return writeWavBytes(fileName, base64ToBytes(base64));
  }
}

async function writeClipWav(
  fileUri: string,
  startMs: number,
  durationMs: number,
  fileName: string,
): Promise<string> {
  const native = await sliceLocalWavFile(fileUri, startMs, durationMs);
  if (native && native.byteLength > 44) {
    return writeWavBytes(fileName, native);
  }
  const extracted = await extractClipViaWebView({
    id: createWaveformJobId(),
    fileName: fileNameFromUri(fileUri),
    uri: fileUri,
    startMs,
    durationMs,
  });
  if (!extracted.wavBase64) {
    throw new Error('Clip vuota');
  }
  return writeWavBase64(fileName, extracted.wavBase64);
}

async function presentAudioShare(
  fileUri: string,
  message: string,
  dialogTitle: string,
  mimeType: string,
  uti: string,
): Promise<void> {
  if (Platform.OS === 'ios') {
    try {
      await Share.share({ url: fileUri, message });
      return;
    } catch (error) {
      if (isUserCancel(error)) {
        throw error;
      }
    }
  }
  const available = await Sharing.isAvailableAsync();
  if (available) {
    await Sharing.shareAsync(fileUri, {
      mimeType,
      UTI: uti,
      dialogTitle,
    });
    return;
  }
  await Share.share({
    message,
    title: dialogTitle,
    url: fileUri,
  });
}

async function presentFallback(
  fileUri: string | undefined,
  message: string,
  dialogTitle: string,
): Promise<boolean> {
  const local = fileUri && !isRemoteUri(fileUri) ? fileUri : undefined;
  if (local) {
    try {
      await presentAudioShare(local, message, dialogTitle, 'audio/*', 'public.audio');
      return true;
    } catch (error) {
      if (isUserCancel(error)) {
        return true;
      }
    }
  }
  try {
    await Share.share({ message, title: dialogTitle });
    return true;
  } catch (error) {
    return isUserCancel(error);
  }
}

async function shareMarkerClipUnsafe(input: ShareMarkerClipInput): Promise<void> {
  const { track, timestampMs, noteText } = input;
  const title = track.title.trim() || 'Brano';
  const clip = resolveClipWindow(timestampMs, track);
  const noteMessage = formatClipShareMessage(title, timestampMs, noteText, false);
  const fallbackMessage = formatClipShareMessage(title, timestampMs, noteText, true);
  const dialogTitle = `${title} · ${formatTimecode(timestampMs)}`;
  const uri = playableUri(track);

  if (uri && clip.durationMs > 0) {
    try {
      const wavUri = await writeClipWav(uri, clip.startMs, clip.durationMs, `${clipBaseName(title, timestampMs)}.wav`);
      writeCompanionTxt(wavUri, noteMessage);
      await presentAudioShare(wavUri, noteMessage, dialogTitle, 'audio/wav', 'public.wav');
      return;
    } catch (error) {
      if (isUserCancel(error)) {
        return;
      }
    }
  }

  const shared = await presentFallback(uri, fallbackMessage, dialogTitle);
  if (!shared) {
    throw new Error('share failed');
  }
}

export async function shareMarkerClip(input: ShareMarkerClipInput): Promise<void> {
  try {
    await shareMarkerClipUnsafe(input);
  } catch (error) {
    if (isUserCancel(error)) {
      return;
    }
    Alert.alert('Non riesco a preparare i 12 secondi. Riprova.');
  }
}
