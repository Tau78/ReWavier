export function peakCountForDuration(durationMs: number): number {
  if (durationMs <= 0) {
    return 4000;
  }
  return Math.min(16_000, Math.max(1200, Math.round(durationMs / 20)));
}

export function normalizePeaks(peaks: number[]): number[] {
  if (peaks.length === 0) {
    return peaks;
  }
  const ranked = peaks.slice().sort((a, b) => a - b);
  const idx = Math.min(ranked.length - 1, Math.floor(ranked.length * 0.995));
  const norm = ranked[idx] || 1;
  return peaks.map((value) => Math.min(1, Math.round((value / norm) * 10_000) / 10_000));
}

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
    let peak = 0;
    let sum = 0;
    const len = Math.max(1, end - start);
    for (let frame = start; frame < end; frame++) {
      const value = Math.abs(sampleAt(frame));
      if (value > peak) {
        peak = value;
      }
      sum += value * value;
    }
    peaks[i] = 0.65 * Math.sqrt(sum / len) + 0.35 * peak;
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
