import type { DecodedPeaks } from './decodePcmFile';

export type WaveformJob = {
  id: string;
  fileName: string;
  uri: string;
  samples: number;
};

type DecoderFn = (job: WaveformJob) => Promise<DecodedPeaks>;

let decoder: DecoderFn | null = null;
const waiting: Array<{
  job: WaveformJob;
  resolve: (value: DecodedPeaks) => void;
  reject: (error: Error) => void;
}> = [];

export function registerWaveformDecoder(next: DecoderFn | null): void {
  decoder = next;
  if (!next) {
    return;
  }
  const queued = waiting.splice(0, waiting.length);
  for (const item of queued) {
    next(item.job).then(item.resolve, item.reject);
  }
}

export function decodeViaWebView(job: WaveformJob): Promise<DecodedPeaks> {
  if (decoder) {
    return decoder(job);
  }
  return new Promise((resolve, reject) => {
    waiting.push({ job, resolve, reject });
  });
}

export function createWaveformJobId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}
