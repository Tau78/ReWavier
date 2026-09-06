export type ClipJob = {
  id: string;
  fileName: string;
  uri: string;
  startMs: number;
  /** Clip window length (not source track duration). */
  durationMs: number;
  /** Known source-track duration; used to refuse oversized files before decode. */
  sourceDurationMs?: number;
};

export type ExtractedClip = {
  wavBase64: string;
  durationMs: number;
  sampleRate: number;
  channels: number;
};

type ExtractorFn = (job: ClipJob) => Promise<ExtractedClip>;

type WaitingItem = {
  job: ClipJob;
  resolve: (value: ExtractedClip) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

let extractor: ExtractorFn | null = null;
const waiting: WaitingItem[] = [];

const WAIT_FOR_EXTRACTOR_MS = 45_000;

function clearWaitingTimer(item: WaitingItem): void {
  clearTimeout(item.timer);
}

export function registerClipExtractor(next: ExtractorFn | null): void {
  extractor = next;
  if (!next) {
    const queued = waiting.splice(0, waiting.length);
    for (const item of queued) {
      clearWaitingTimer(item);
      item.reject(new Error('Preparazione clip interrotta'));
    }
    return;
  }
  const queued = waiting.splice(0, waiting.length);
  for (const item of queued) {
    clearWaitingTimer(item);
    next(item.job).then(item.resolve, item.reject);
  }
}

export function extractClipViaWebView(job: ClipJob): Promise<ExtractedClip> {
  if (extractor) {
    return extractor(job);
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
        reject(new Error('Timeout attesa estrattore clip'));
      }, WAIT_FOR_EXTRACTOR_MS),
    };
    waiting.push(item);
  });
}
