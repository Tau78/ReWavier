import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as LegacyFS from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import { AUDIO_PICKER_TYPES } from '../domain/audioFormats';
import { createId } from '../domain/library';
import type { Marker, Track } from '../domain/models';
import {
  audioBasename,
  buildSidecar,
  isAudioName,
  isSidecarName,
  parseSidecar,
  sidecarNameForAudio,
  titleFromFileName,
  type SidecarFile,
} from '../domain/sidecar';
import { copyToDownloads, copyToInbox } from './downloads';
import { libraryDirectory } from './libraryPaths';

export { libraryDirectory } from './libraryPaths';

function libraryDir(): Directory {
  return libraryDirectory();
}

function safeFileName(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, '-');
}

async function copyIntoLibrary(sourceUri: string, fileName: string): Promise<string> {
  return copyToInbox(sourceUri, createId('file'), fileName);
}

async function readText(uri: string): Promise<string> {
  return LegacyFS.readAsStringAsync(uri);
}

export async function writeSidecarToLibrary(
  track: Track,
  markers: Marker[],
  authorSlug?: string,
): Promise<string> {
  const name = sidecarNameForAudio(track.sourceFileName ?? `${track.title}.mp3`, authorSlug);
  const dest = new File(libraryDir(), safeFileName(name));
  dest.write(JSON.stringify(buildSidecar(track, markers), null, 2));
  return dest.uri;
}

export function removeSidecarFromLibrary(fileName: string, authorSlug?: string): void {
  const names = [sidecarNameForAudio(fileName, authorSlug), sidecarNameForAudio(fileName)];
  for (const name of new Set(names)) {
    const dest = new File(libraryDir(), safeFileName(name));
    if (dest.exists) {
      dest.delete();
    }
  }
}

export async function shareSidecar(
  track: Track,
  markers: Marker[],
  authorSlug?: string,
): Promise<void> {
  const name = sidecarNameForAudio(track.sourceFileName ?? `${track.title}.mp3`, authorSlug);
  const dest = new File(Paths.cache, safeFileName(name));
  dest.write(JSON.stringify(buildSidecar(track, markers), null, 2));
  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new Error('Condivisione non disponibile');
  }
  await Sharing.shareAsync(dest.uri, {
    mimeType: 'application/json',
    UTI: 'public.json',
    dialogTitle: `Salva ${name} accanto al file audio`,
  });
}

export type ImportedBundle = {
  track: Track;
  markers: Marker[];
};

export async function pickAndImportAudio(): Promise<ImportedBundle[]> {
  const result = await DocumentPicker.getDocumentAsync({
    multiple: true,
    copyToCacheDirectory: true,
    type: AUDIO_PICKER_TYPES,
  });
  if (result.canceled || !result.assets?.length) {
    return [];
  }

  const audios = result.assets.filter((asset) => isAudioName(asset.name));
  const sidecars = result.assets.filter((asset) => isSidecarName(asset.name));

  const sidecarByBase = new Map<string, SidecarFile>();
  for (const asset of sidecars) {
    const parsed = parseSidecar(await readText(asset.uri));
    if (parsed) {
      sidecarByBase.set(audioBasename(asset.name).toLowerCase(), parsed);
    }
  }

  const bundles: ImportedBundle[] = [];
  for (const asset of audios) {
    const id = createId('track');
    const fileUri = await copyToDownloads(asset.uri, id, asset.name);
    const sidecar = sidecarByBase.get(audioBasename(asset.name).toLowerCase());
    bundles.push({
      track: {
        id,
        title: sidecar?.title || titleFromFileName(asset.name),
        artist: sidecar?.artist || 'Importata',
        durationMs: sidecar?.durationMs || 0,
        fileUri,
        sourceFileName: asset.name,
        startMs: sidecar?.startMs,
        endMs: sidecar?.endMs,
        downloaded: true,
        downloadedAt: Date.now(),
        remoteSize: asset.size,
        remoteModifiedAt: asset.lastModified
          ? new Date(asset.lastModified).toISOString()
          : undefined,
      },
      markers: sidecar?.markers ?? [],
    });
  }

  if (audios.length === 0 && sidecars.length > 0) {
    for (const asset of sidecars) {
      const sidecar = sidecarByBase.get(audioBasename(asset.name).toLowerCase());
      if (!sidecar) {
        continue;
      }
      bundles.push({
        track: {
          id: createId('track'),
          title: sidecar.title || titleFromFileName(asset.name),
          artist: sidecar.artist || 'Importata',
          durationMs: sidecar.durationMs || 0,
          sourceFileName: sidecar.audioFileName || `${audioBasename(asset.name)}.mp3`,
          startMs: sidecar.startMs,
          endMs: sidecar.endMs,
        },
        markers: sidecar.markers,
      });
    }
  }

  return bundles;
}

export async function copyReplacementAudio(
  sourceUri: string,
  originalFileName: string,
): Promise<string> {
  const id = createId('file');
  return copyToDownloads(sourceUri, id, originalFileName);
}

export async function pickReplacementAudio(): Promise<{ uri: string; name: string } | null> {
  const result = await DocumentPicker.getDocumentAsync({
    multiple: false,
    copyToCacheDirectory: true,
    type: AUDIO_PICKER_TYPES,
  });
  if (result.canceled || !result.assets?.[0]) {
    return null;
  }
  const asset = result.assets[0];
  if (!isAudioName(asset.name)) {
    throw new Error('Scegli un file audio');
  }
  return { uri: asset.uri, name: asset.name };
}
