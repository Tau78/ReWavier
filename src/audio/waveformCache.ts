import { File } from 'expo-file-system';

import type { DecodedPeaks } from './decodePcmFile';

const CACHE_VERSION = 1;

type PeaksCache = DecodedPeaks & {
  v: number;
};

function cacheFileForAudio(fileUri: string): File {
  const withoutQuery = fileUri.split('?')[0] ?? fileUri;
  const peaksUri = withoutQuery.replace(/\.[^./]+$/, '') + '.peaks.json';
  return new File(peaksUri);
}

export async function readPeaksCache(fileUri: string): Promise<DecodedPeaks | null> {
  try {
    const file = cacheFileForAudio(fileUri);
    if (!file.exists) {
      return null;
    }
    const parsed = JSON.parse(await file.text()) as Partial<PeaksCache>;
    if (
      parsed.v !== CACHE_VERSION ||
      !Array.isArray(parsed.peaks) ||
      parsed.peaks.length === 0 ||
      parsed.peaks.some((value) => typeof value !== 'number')
    ) {
      return null;
    }
    return {
      peaks: parsed.peaks,
      durationMs: typeof parsed.durationMs === 'number' ? parsed.durationMs : 0,
    };
  } catch {
    return null;
  }
}

export async function writePeaksCache(fileUri: string, result: DecodedPeaks): Promise<void> {
  try {
    const file = cacheFileForAudio(fileUri);
    file.write(JSON.stringify({ v: CACHE_VERSION, ...result }));
  } catch {
    // cache is optional
  }
}
