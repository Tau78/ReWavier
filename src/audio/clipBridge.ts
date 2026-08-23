export type ClipJob = {
  id: string;
  fileName: string;
  uri: string;
  startMs: number;
  durationMs: number;
};

export type ExtractedClip = {
  wavBase64: string;
  durationMs: number;
  sampleRate: number;
  channels: number;
};

type ExtractorFn = (job: ClipJob) => Promise<ExtractedClip>;

let extractor: ExtractorFn | null = null;
const waiting: Array<{
  job: ClipJob;
  resolve: (value: ExtractedClip) => void;
  reject: (error: Error) => void;
}> = [];

export function registerClipExtractor(next: ExtractorFn | null): void {
  extractor = next;
  if (!next) {
    return;
  }
  const queued = waiting.splice(0, waiting.length);
  for (const item of queued) {
    next(item.job).then(item.resolve, item.reject);
  }
}

export function extractClipViaWebView(job: ClipJob): Promise<ExtractedClip> {
  if (extractor) {
    return extractor(job);
  }
  return new Promise((resolve, reject) => {
    waiting.push({ job, resolve, reject });
  });
}
