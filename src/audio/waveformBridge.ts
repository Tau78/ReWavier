import type { DecodedPeaks } from './decodePcmFile';

/** Skip full WebView decode above these caps — mobile OOM from unbounded PCM. */
export const MAX_WAVEFORM_DECODE_DURATION_MS = 15 * 60 * 1000; // 15 min
export const MAX_WAVEFORM_DECODE_BYTES = 24 * 1024 * 1024; // 24 MB compressed

export type WaveformJob = {
  id: string;
  fileName: string;
  uri: string;
  samples: number;
  /** Known duration hint; used to refuse oversized tracks before decode. */
  durationMs?: number;
};

type DecoderFn = (job: WaveformJob) => Promise<DecodedPeaks>;
type CancelFn = (jobId: string) => void;

type WaitingItem = {
  job: WaveformJob;
  resolve: (value: DecodedPeaks) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

let decoder: DecoderFn | null = null;
let cancelHandler: CancelFn | null = null;
const waiting: WaitingItem[] = [];

const WAIT_FOR_DECODER_MS = 45_000;

function clearWaitingTimer(item: WaitingItem): void {
  clearTimeout(item.timer);
}

export function registerWaveformDecoder(next: DecoderFn | null): void {
  decoder = next;
  if (!next) {
    const queued = waiting.splice(0, waiting.length);
    for (const item of queued) {
      clearWaitingTimer(item);
      item.reject(new Error('Decodifica waveform interrotta'));
    }
    return;
  }
  const queued = waiting.splice(0, waiting.length);
  for (const item of queued) {
    clearWaitingTimer(item);
    next(item.job).then(item.resolve, item.reject);
  }
}

/** Host registers this so timed-out ensurePeaks can drop queued / current jobs. */
export function registerWaveformCancel(next: CancelFn | null): void {
  cancelHandler = next;
}

/** Reject waiting work and ask the host to drop the job (late results ignored). */
export function cancelWaveformJob(jobId: string): void {
  const idx = waiting.findIndex((item) => item.job.id === jobId);
  if (idx >= 0) {
    const [item] = waiting.splice(idx, 1);
    clearWaitingTimer(item);
    item.reject(new Error('Decodifica waveform annullata'));
  }
  cancelHandler?.(jobId);
}

export function decodeViaWebView(job: WaveformJob): Promise<DecodedPeaks> {
  if (decoder) {
    return decoder(job);
  }
  return new Promise((resolve, reject) => {
    const item: WaitingItem = {
      job,
      resolve,
      reject,
      timer: setTimeout(() => {
        const idx = waiting.indexOf(item);
        if (idx >= 0) {
          waiting.splice(idx, 1);
        }
        reject(new Error('Timeout attesa decoder waveform'));
      }, WAIT_FOR_DECODER_MS),
    };
    waiting.push(item);
  });
}

export function createWaveformJobId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}
