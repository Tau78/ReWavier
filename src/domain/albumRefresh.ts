/** Drive listing HTTP: abort so the spinner can stop. */
export const DRIVE_LIST_TIMEOUT_MS = 20_000;

/** Whole Aggiorna listing (elenco + brani nuovi in lista). */
export const ALBUM_REFRESH_TIMEOUT_MS = 40_000;

export const DRIVE_SLOW_MESSAGE = 'Drive non risponde. Riprova tra poco.';

export type AwaitJobResult = 'done' | 'timeout' | 'cancelled';

export class DriveSlowError extends Error {
  constructor(message = DRIVE_SLOW_MESSAGE) {
    super(message);
    this.name = 'DriveSlowError';
  }
}

export function isDriveSlowError(error: unknown): boolean {
  return error instanceof DriveSlowError || (error instanceof Error && error.name === 'DriveSlowError');
}

export function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const name = 'name' in error ? String(error.name) : '';
  return name === 'AbortError';
}

/** Resolves when `job` settles, or `'timeout'` after `ms`. Does not cancel `job`. */
export async function awaitJobOrTimeout(
  job: Promise<unknown> | null | undefined,
  ms: number,
  isCancelled?: () => boolean,
): Promise<AwaitJobResult> {
  if (!job) {
    return 'done';
  }
  if (isCancelled?.()) {
    return 'cancelled';
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  let poll: ReturnType<typeof setInterval> | undefined;
  const racers: Promise<AwaitJobResult>[] = [
    job.then(() => 'done' as const).catch(() => 'done' as const),
    new Promise<AwaitJobResult>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), ms);
    }),
  ];
  if (isCancelled) {
    racers.push(
      new Promise<AwaitJobResult>((resolve) => {
        const tick = () => {
          if (isCancelled()) {
            resolve('cancelled');
          }
        };
        tick();
        poll = setInterval(tick, 80);
      }),
    );
  }
  try {
    return await Promise.race(racers);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
    if (poll) {
      clearInterval(poll);
    }
  }
}

export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message = DRIVE_SLOW_MESSAGE,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new DriveSlowError(message)), ms);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
