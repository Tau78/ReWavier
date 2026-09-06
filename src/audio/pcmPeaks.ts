export function peakCountForDuration(durationMs: number): number {
  if (durationMs <= 0) {
    return 2000;
  }
  // Cap keeps WebView JSON + normalizePeaks off the critical path after a file replace.
  return Math.min(4_000, Math.max(800, Math.round(durationMs / 40)));
}

export function normalizePeaks(peaks: number[]): number[] {
  if (peaks.length === 0) {
    return peaks;
  }
  // Max-based norm (no full sort) — avoids freezing the JS thread on large arrays.
  let max = 0;
  for (let i = 0; i < peaks.length; i += 1) {
    const value = peaks[i] ?? 0;
    if (value > max) {
      max = value;
    }
  }
  const norm = max > 0 ? max : 1;
  const out = new Array<number>(peaks.length);
  for (let i = 0; i < peaks.length; i += 1) {
    out[i] = Math.min(1, Math.round(((peaks[i] ?? 0) / norm) * 10_000) / 10_000);
  }
  return out;
}

/** Cap samples read per peak bucket — avoids O(frameCount) freezes on long PCM. */
const MAX_SAMPLES_PER_PEAK = 64;

export function peaksFromFrames(
  frameCount: number,
  peakCount: number,
  sampleAt: (frame: number) => number,
): number[] {
  const count = Math.max(1, peakCount);
  const peaks = new Array<number>(count);
  const block = frameCount / count;
  for (let i = 0; i < count; i++) {
    const start = Math.floor(i * block);
    const end = Math.min(frameCount, Math.floor((i + 1) * block));
    const len = Math.max(1, end - start);
    const stride = Math.max(1, Math.ceil(len / MAX_SAMPLES_PER_PEAK));
    let peak = 0;
    let sum = 0;
    let n = 0;
    for (let frame = start; frame < end; frame += stride) {
      const value = Math.abs(sampleAt(frame));
      if (value > peak) {
        peak = value;
      }
      sum += value * value;
      n += 1;
    }
    peaks[i] = 0.65 * Math.sqrt(sum / Math.max(1, n)) + 0.35 * peak;
  }
  return normalizePeaks(peaks);
}

export function peaksFromChannels(channels: Float32Array[], peakCount: number): number[] {
  const frameCount = channels[0]?.length ?? 0;
  if (frameCount === 0) {
    return [];
  }
  const channelCount = channels.length;
  return peaksFromFrames(frameCount, peakCount, (frame) => {
    let sum = 0;
    for (let c = 0; c < channelCount; c++) {
      sum += channels[c][frame] ?? 0;
    }
    return sum / channelCount;
  });
}
