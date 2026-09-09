import { File } from 'expo-file-system';

import { playableUri, isRemoteHttpUri } from '../domain/audioFormats';
import type { Track } from '../domain/models';
import { useLibraryStore } from '../store/libraryStore';
import { decodePcmPeaks, type DecodedPeaks } from './decodePcmFile';
import { peakCountForDuration } from './pcmPeaks';
import {
  cancelWaveformJob,
  createWaveformJobId,
  decodeViaWebView,
  MAX_WAVEFORM_DECODE_BYTES,
  MAX_WAVEFORM_DECODE_DURATION_MS,
} from './waveformBridge';
import { readPeaksCache, writePeaksCache } from './waveformCache';

/** Inflight keyed by trackId + file URI so a replace cannot reuse a stale decode. */
const inflight = new Map<string, Promise<number[]>>();

/** Bumped on timeout / invalidate so late decode must not write cache or store. */
const generationByKey = new Map<string, number>();

/** Active WebView job id per work key (for cancel on timeout / invalidate). */
const activeJobByKey = new Map<string, string>();

const ENSURE_PEAKS_TIMEOUT_MS = 60_000;

function peaksWorkKey(trackId: string, uri: string): string {
  return `${trackId}::${uri}`;
}

function generationOf(key: string): number {
  return generationByKey.get(key) ?? 0;
}

function bumpGeneration(key: string): number {
  const next = generationOf(key) + 1;
  generationByKey.set(key, next);
  return next;
}

function fileNameFromUri(uri: string): string {
  const path = uri.split('?')[0] ?? uri;
  const parts = path.split('/');
  return decodeURIComponent(parts[parts.length - 1] ?? '');
}

function fileByteSize(uri: string): number | null {
  try {
    const file = new File(uri);
    if (!file.exists) {
      return null;
    }
    return typeof file.size === 'number' ? file.size : null;
  } catch {
    return null;
  }
}

function tooLargeForWebDecode(fileUri: string, durationMs: number): boolean {
  if (durationMs > MAX_WAVEFORM_DECODE_DURATION_MS) {
    return true;
  }
  const size = fileByteSize(fileUri);
  return size != null && size > MAX_WAVEFORM_DECODE_BYTES;
}

async function extractFromFile(
  fileUri: string,
  durationMs: number,
  jobId: string,
  isCurrent: () => boolean,
): Promise<DecodedPeaks> {
  if (tooLargeForWebDecode(fileUri, durationMs)) {
    // Empty peaks: avoid OOM; UI keeps placeholder until a lighter path exists.
    return { peaks: [], durationMs };
  }
  if (!isCurrent()) {
    return { peaks: [], durationMs };
  }
  const pcm = await decodePcmPeaks(fileUri);
  if (!isCurrent()) {
    return { peaks: [], durationMs };
  }
  if (pcm && pcm.peaks.length > 0) {
    return pcm;
  }
  // PCM may refuse after size/header checks that the track hint missed.
  const knownDurationMs = Math.max(durationMs, pcm?.durationMs ?? 0);
  if (tooLargeForWebDecode(fileUri, knownDurationMs)) {
    return { peaks: [], durationMs: knownDurationMs };
  }
  if (!isCurrent()) {
    return { peaks: [], durationMs: knownDurationMs };
  }
  const samples = peakCountForDuration(durationMs);
  return decodeViaWebView({
    id: jobId,
    fileName: fileNameFromUri(fileUri),
    uri: fileUri,
    samples,
    durationMs,
  });
}

/** Drop in-flight peak jobs for a track (call when the audio file is replaced). */
export function invalidatePeaksWork(trackId: string): void {
  const keys = new Set([...generationByKey.keys(), ...inflight.keys(), ...activeJobByKey.keys()]);
  for (const key of keys) {
    if (key === trackId || key.startsWith(`${trackId}::`)) {
      bumpGeneration(key);
      const jobId = activeJobByKey.get(key);
      if (jobId) {
        cancelWaveformJob(jobId);
        activeJobByKey.delete(key);
      }
      inflight.delete(key);
    }
  }
}

export async function ensurePeaks(track: Track): Promise<number[]> {
  const uri = playableUri(track);
  if (!uri) {
    return [];
  }
  if (isRemoteHttpUri(uri)) {
    return [];
  }

  const cached = useLibraryStore.getState().peaksByTrackId[track.id];
  if (cached && cached.length > 0) {
    return cached;
  }

  const key = peaksWorkKey(track.id, uri);
  const existing = inflight.get(key);
  if (existing) {
    return existing;
  }

  const gen = generationOf(key);
  const jobId = createWaveformJobId();
  const isCurrent = () => generationOf(key) === gen;
  activeJobByKey.set(key, jobId);

  const work = (async () => {
    try {
      const disk = await readPeaksCache(uri);
      if (!isCurrent()) {
        return [];
      }
      if (disk && disk.peaks.length > 0) {
        const still = useLibraryStore.getState().getTrack(track.id);
        if (!still || playableUri(still) !== uri) {
          return [];
        }
        useLibraryStore.getState().setTrackPeaks(track.id, disk.peaks);
        if (disk.durationMs > 0 && disk.durationMs !== track.durationMs) {
          useLibraryStore.getState().updateTrackDuration(track.id, disk.durationMs);
        }
        return disk.peaks;
      }

      let result: DecodedPeaks;
      try {
        result = await extractFromFile(uri, track.durationMs, jobId, isCurrent);
      } catch {
        // Cancel / host timeout — empty fallback (same as oversized refuse).
        return [];
      }
      if (!isCurrent()) {
        return [];
      }
      const still = useLibraryStore.getState().getTrack(track.id);
      if (!still || playableUri(still) !== uri) {
        return [];
      }
      if (result.peaks.length === 0) {
        return [];
      }
      useLibraryStore.getState().setTrackPeaks(track.id, result.peaks);
      if (result.durationMs > 0 && result.durationMs !== track.durationMs) {
        useLibraryStore.getState().updateTrackDuration(track.id, result.durationMs);
      }
      // Yield before large JSON.stringify so the UI can process taps.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      if (!isCurrent()) {
        return [];
      }
      await writePeaksCache(uri, result);
      return result.peaks;
    } finally {
      if (activeJobByKey.get(key) === jobId) {
        activeJobByKey.delete(key);
      }
    }
  })();

  inflight.set(key, work);

  let timedOut = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const raced = Promise.race([
    work,
    new Promise<number[]>((_, reject) => {
      timeoutId = setTimeout(() => {
        timedOut = true;
        // Invalidate generation so orphan decode cannot write cache / store.
        bumpGeneration(key);
        cancelWaveformJob(jobId);
        if (activeJobByKey.get(key) === jobId) {
          activeJobByKey.delete(key);
        }
        // Unblock callers; allow a later retry if the hung job never settles.
        if (inflight.get(key) === work) {
          inflight.delete(key);
        }
        reject(new Error('Timeout estrazione peaks'));
      }, ENSURE_PEAKS_TIMEOUT_MS);
    }),
  ]);

  try {
    return await raced;
  } catch {
    if (inflight.get(key) === work) {
      inflight.delete(key);
    }
    return [];
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    if (!timedOut && inflight.get(key) === work) {
      inflight.delete(key);
    }
  }
}
