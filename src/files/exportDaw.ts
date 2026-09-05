import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import {
  buildLogicMarkerList,
  buildMidiMarkers,
  buildReaperMarkerCsv,
  encodeUtf8,
  packStoreZip,
  safeExportTitle,
} from '../domain/export';
import type { Marker, Track } from '../domain/models';

export type DawTarget = 'logic' | 'ableton' | 'reaper';

const SHARE_ERROR = 'Non riesco ad aprire il foglio per salvare.';

function isUserCancel(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error ?? '');
  return /cancel|dismiss|abort/i.test(text);
}

function writeCacheFile(fileName: string, data: string | Uint8Array): string {
  const dest = new File(Paths.cache, fileName);
  dest.write(data);
  return dest.uri;
}

async function shareFile(
  uri: string,
  dialogTitle: string,
  mimeType: string,
  uti: string,
): Promise<void> {
  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new Error(SHARE_ERROR);
  }
  await Sharing.shareAsync(uri, {
    mimeType,
    UTI: uti,
    dialogTitle,
  });
}

export async function shareDawExport(
  track: Track,
  markers: Marker[],
  target: DawTarget,
): Promise<void> {
  const title = safeExportTitle(track.title);
  try {
    if (target === 'ableton') {
      const uri = writeCacheFile(`${title}.mid`, buildMidiMarkers(track, markers));
      await shareFile(uri, 'Salva per Ableton', 'audio/midi', 'public.midi-audio');
      return;
    }
    if (target === 'reaper') {
      const uri = writeCacheFile(`${title}.reaper.csv`, buildReaperMarkerCsv(track, markers));
      await shareFile(uri, 'Salva per Reaper', 'text/csv', 'public.comma-separated-values-text');
      return;
    }

    const midi = buildMidiMarkers(track, markers);
    const list = buildLogicMarkerList(track, markers);
    const zip = packStoreZip([
      { name: `${title}.mid`, data: midi },
      { name: `${title}.logic.txt`, data: encodeUtf8(list) },
    ]);
    const uri = writeCacheFile(`${title}-logic.zip`, zip);
    await shareFile(uri, 'Salva per Logic', 'application/zip', 'public.zip-archive');
  } catch (error) {
    if (isUserCancel(error)) {
      return;
    }
    throw new Error(SHARE_ERROR);
  }
}
