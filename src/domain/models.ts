export type Track = {
  id: string;
  title: string;
  artist: string;
  durationMs: number;
  fileUri?: string;
  inboxUri?: string;
  remoteUri?: string;
  sourceFileName?: string;
  downloaded?: boolean;
  downloadedAt?: number;
  driveFileId?: string;
  remoteModifiedAt?: string;
  remoteSize?: number;
  remoteHash?: string;
  startMs?: number;
  endMs?: number;
  exerciseOpenId?: string;
  exerciseCloseId?: string;
  practiceHoleId?: string;
  artworkUri?: string;
};

export const MIN_RANGE_MS = 400;

export function resolveTrackRange(track: Pick<Track, 'durationMs' | 'startMs' | 'endMs'>): {
  startMs: number;
  endMs: number;
} {
  const duration = Math.max(track.durationMs, 0);
  if (duration <= 0) {
    return { startMs: 0, endMs: 0 };
  }
  const start = clampTime(track.startMs ?? 0, duration);
  const rawEnd = track.endMs == null || track.endMs <= 0 ? duration : track.endMs;
  const end = clampTime(rawEnd, duration);
  const minSpan = Math.min(MIN_RANGE_MS, duration);
  if (end - start < minSpan) {
    return { startMs: 0, endMs: duration };
  }
  return { startMs: start, endMs: end };
}

export function isCustomRange(
  range: { startMs: number; endMs: number },
  durationMs: number,
): boolean {
  return range.startMs > 1 || range.endMs < Math.max(durationMs, 0) - 1;
}

export type Marker = {
  id: string;
  timestampMs: number;
  text: string;
  createdAt: number;
  updatedAt: number;
  hidden?: boolean;
  authorId?: string;
  authorName?: string;
  color?: string;
  editableByOthers?: boolean;
};

export type NoteBubbleState = {
  visible: boolean;
  timestampMs: number;
  markerId: string | null;
  draft: string;
};

export function formatTimecode(ms: number): string {
  const clamped = Math.max(0, Math.floor(ms));
  const minutes = Math.floor(clamped / 60000);
  const seconds = Math.floor((clamped % 60000) / 1000);
  const millis = clamped % 1000;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

export function clampTime(ms: number, durationMs: number): number {
  return Math.min(durationMs, Math.max(0, ms));
}

