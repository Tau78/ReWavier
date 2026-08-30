import { formatTimecode, resolveTrackRange, type Track } from '../domain/models';

export const CLIP_SPAN_MS = 12_000;

export function resolveClipWindow(
  centerMs: number,
  track: Pick<Track, 'durationMs' | 'startMs' | 'endMs'>,
): { startMs: number; durationMs: number } {
  const range = resolveTrackRange(track);
  const rangeSpan = Math.max(0, range.endMs - range.startMs);
  if (rangeSpan <= 0) {
    return { startMs: 0, durationMs: 0 };
  }
  const span = Math.min(CLIP_SPAN_MS, rangeSpan);
  const center = Math.min(range.endMs, Math.max(range.startMs, centerMs));
  let startMs = center - span / 2;
  let endMs = center + span / 2;
  if (startMs < range.startMs) {
    startMs = range.startMs;
    endMs = startMs + span;
  }
  if (endMs > range.endMs) {
    endMs = range.endMs;
    startMs = endMs - span;
  }
  startMs = Math.max(range.startMs, startMs);
  endMs = Math.min(range.endMs, endMs);
  return {
    startMs: Math.round(startMs),
    durationMs: Math.max(0, Math.round(endMs - startMs)),
  };
}

export function formatClipShareMessage(
  title: string,
  timestampMs: number,
  noteText: string,
  includeOpenHint: boolean,
): string {
  const heading = title.trim() || 'Audio';

  const time = formatTimecode(timestampMs);
  const note = noteText.replace(/\s+/g, ' ').trim();
  const lines = [heading, time];
  if (note) {
    lines.push('', note);
  }
  if (includeOpenHint) {
    lines.push('', 'Apri l’audio e vai a questo momento.');
  }
  return lines.join('\n');
}
