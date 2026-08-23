import { markerAuthorLabel, markerColor, markerPreviewText } from './markers';
import {
  clampTime,
  formatTimecode,
  MIN_RANGE_MS,
  resolveTrackRange,
  type Marker,
  type Track,
} from './models';

export const LISTEN_AROUND_PAD_MS = 2000;
export const HOLE_BEFORE_MS = 800;
export const HOLE_AFTER_MS = 2500;
export const THREAD_WINDOW_MS = 350;

export type PracticeIds = {
  exerciseOpenId?: string;
  exerciseCloseId?: string;
  practiceHoleId?: string;
};

export type TimeSpan = {
  startMs: number;
  endMs: number;
};

export function practiceFromTrack(
  track: Pick<Track, 'exerciseOpenId' | 'exerciseCloseId' | 'practiceHoleId'>,
): PracticeIds {
  return {
    exerciseOpenId: track.exerciseOpenId,
    exerciseCloseId: track.exerciseCloseId,
    practiceHoleId: track.practiceHoleId,
  };
}

export function withPractice(track: Track, practice: PracticeIds): Track {
  return {
    ...track,
    exerciseOpenId: practice.exerciseOpenId,
    exerciseCloseId: practice.exerciseCloseId,
    practiceHoleId: practice.practiceHoleId,
  };
}

export function markerById(markers: Marker[], id?: string): Marker | undefined {
  if (!id) {
    return undefined;
  }
  return markers.find((marker) => marker.id === id);
}

export function resolveExerciseRange(
  track: Pick<Track, 'exerciseOpenId' | 'exerciseCloseId' | 'durationMs'>,
  markers: Marker[],
): TimeSpan | null {
  const open = markerById(markers, track.exerciseOpenId);
  const close = markerById(markers, track.exerciseCloseId);
  if (!open || !close) {
    return null;
  }
  const duration = Math.max(track.durationMs, 0);
  const startMs = clampTime(Math.min(open.timestampMs, close.timestampMs), duration);
  const endMs = clampTime(Math.max(open.timestampMs, close.timestampMs), duration);
  if (endMs - startMs < Math.min(MIN_RANGE_MS, duration || MIN_RANGE_MS)) {
    return null;
  }
  return { startMs, endMs };
}

export function activePlayRange(
  track: Pick<Track, 'durationMs' | 'startMs' | 'endMs' | 'exerciseOpenId' | 'exerciseCloseId'>,
  markers: Marker[],
): TimeSpan {
  const file = resolveTrackRange(track);
  const exercise = resolveExerciseRange(track, markers);
  if (!exercise) {
    return file;
  }
  const startMs = Math.max(file.startMs, exercise.startMs);
  const endMs = Math.min(file.endMs, exercise.endMs);
  if (endMs - startMs < Math.min(MIN_RANGE_MS, Math.max(track.durationMs, 0) || MIN_RANGE_MS)) {
    return file;
  }
  return { startMs, endMs };
}

export function listenAroundWindow(ms: number, durationMs: number): TimeSpan {
  return {
    startMs: clampTime(ms - LISTEN_AROUND_PAD_MS, durationMs),
    endMs: clampTime(ms + LISTEN_AROUND_PAD_MS, durationMs),
  };
}

export function holeRangeForMarker(marker: Marker, durationMs: number): TimeSpan {
  const startMs = clampTime(marker.timestampMs - HOLE_BEFORE_MS, durationMs);
  let endMs = clampTime(marker.timestampMs + HOLE_AFTER_MS, durationMs);
  if (endMs - startMs < 200) {
    endMs = clampTime(startMs + 200, durationMs);
  }
  return { startMs, endMs };
}

export function markersNearTime(
  markers: Marker[],
  ms: number,
  windowMs = THREAD_WINDOW_MS,
): Marker[] {
  return markers
    .filter((marker) => Math.abs(marker.timestampMs - ms) <= windowMs)
    .sort((a, b) => a.createdAt - b.createdAt || a.timestampMs - b.timestampMs);
}

export type LessonRecapRow = {
  key: string;
  trackTitle: string;
  timestampMs: number;
  author: string;
  preview: string;
  color: string;
};

export function lessonRecapRows(
  tracks: Track[],
  markersByTrackId: Record<string, Marker[]>,
): LessonRecapRow[] {
  const rows: LessonRecapRow[] = [];
  for (const track of tracks) {
    const markers = [...(markersByTrackId[track.id] ?? [])]
      .filter((marker) => marker.hidden !== true)
      .sort((a, b) => a.timestampMs - b.timestampMs);
    for (const marker of markers) {
      rows.push({
        key: `${track.id}:${marker.id}`,
        trackTitle: track.title,
        timestampMs: marker.timestampMs,
        author: markerAuthorLabel(marker),
        preview: markerPreviewText(marker.text),
        color: markerColor(marker),
      });
    }
  }
  return rows;
}

export function buildLessonRecapText(collectionName: string, rows: LessonRecapRow[]): string {
  const header =
    rows.length === 0
      ? 'Nessun appunto in questa lezione.'
      : rows.length === 1
        ? '1 appunto'
        : `${rows.length} appunti`;
  const lines = [collectionName, header, ''];
  for (const row of rows) {
    lines.push(`${row.trackTitle} — ${formatTimecode(row.timestampMs)}`);
    if (row.preview) {
      lines.push(`${row.author}: ${row.preview}`);
    } else {
      lines.push(row.author);
    }
    lines.push('');
  }
  return lines.join('\n').trim();
}
