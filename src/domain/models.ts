export type Track = {
  id: string;
  title: string;
  artist: string;
  durationMs: number;
};

export type Marker = {
  id: string;
  timestampMs: number;
  text: string;
  createdAt: number;
  updatedAt: number;
};

export type NoteBubbleState = {
  visible: boolean;
  timestampMs: number;
  markerId: string | null;
  draft: string;
};

export const DEMO_TRACK: Track = {
  id: 'demo-1',
  title: 'Studio Session',
  artist: 'Take 3',
  durationMs: 204_000,
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

export function generatePeaks(count = 180): number[] {
  const peaks: number[] = [];
  for (let i = 0; i < count; i++) {
    const t = i / count;
    const wave =
      0.35 +
      0.25 * Math.sin(t * Math.PI * 8) +
      0.2 * Math.sin(t * Math.PI * 19) +
      0.15 * Math.abs(Math.sin(t * Math.PI * 3));
    peaks.push(Math.min(1, Math.max(0.15, wave)));
  }
  return peaks;
}
