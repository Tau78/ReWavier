import { playableUri } from '../domain/audioFormats';
import type { Track } from '../domain/models';
import { useLibraryStore } from '../store/libraryStore';
import { decodePcmPeaks, type DecodedPeaks } from './decodePcmFile';
import { peakCountForDuration } from './pcmPeaks';
import { createWaveformJobId, decodeViaWebView } from './waveformBridge';
import { readPeaksCache, writePeaksCache } from './waveformCache';

const inflight = new Map<string, Promise<number[]>>();

function fileNameFromUri(uri: string): string {
  const path = uri.split('?')[0] ?? uri;
  const parts = path.split('/');
  return decodeURIComponent(parts[parts.length - 1] ?? '');
}

async function extractFromFile(fileUri: string, durationMs: number): Promise<DecodedPeaks> {
  const pcm = await decodePcmPeaks(fileUri);
  if (pcm && pcm.peaks.length > 0) {
    return pcm;
  }
  const samples = peakCountForDuration(durationMs);
  return decodeViaWebView({
    id: createWaveformJobId(),
    fileName: fileNameFromUri(fileUri),
    uri: fileUri,
    samples,
  });
}

export async function ensurePeaks(track: Track): Promise<number[]> {
  const uri = playableUri(track);
  if (!uri) {
    return [];
  }

  const cached = useLibraryStore.getState().peaksByTrackId[track.id];
  if (cached && cached.length > 0) {
    return cached;
  }

  const existing = inflight.get(track.id);
  if (existing) {
    return existing;
  }

  const work = (async () => {
    const disk = await readPeaksCache(uri);
    if (disk && disk.peaks.length > 0) {
      useLibraryStore.getState().setTrackPeaks(track.id, disk.peaks);
      if (disk.durationMs > 0 && disk.durationMs !== track.durationMs) {
        useLibraryStore.getState().updateTrackDuration(track.id, disk.durationMs);
      }
      return disk.peaks;
    }

    const result = await extractFromFile(uri, track.durationMs);
    useLibraryStore.getState().setTrackPeaks(track.id, result.peaks);
    if (result.durationMs > 0 && result.durationMs !== track.durationMs) {
      useLibraryStore.getState().updateTrackDuration(track.id, result.durationMs);
    }
    await writePeaksCache(uri, result);
    return result.peaks;
  })();

  inflight.set(track.id, work);
  try {
    return await work;
  } finally {
    inflight.delete(track.id);
  }
}
