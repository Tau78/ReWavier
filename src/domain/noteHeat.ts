import { isMarkerHidden } from './markers';
import type { Marker } from './models';

export const NOTE_HEAT_BIN_COUNT = 48;

export type NoteHeatBin = {
  index: number;
  startMs: number;
  endMs: number;
  count: number;
};

export type NoteHeatResult = {
  bins: NoteHeatBin[];
  maxCount: number;
  noteCount: number;
};

type HeatMarker = Pick<Marker, 'timestampMs'> & { hidden?: boolean };

export function buildNoteHeat(
  durationMs: number,
  markers: HeatMarker[],
  binCount = NOTE_HEAT_BIN_COUNT,
): NoteHeatResult {
  const n = Math.max(1, Math.min(64, Math.floor(binCount) || NOTE_HEAT_BIN_COUNT));
  const duration = Math.max(0, durationMs);
  const visible = markers.filter((marker) => !isMarkerHidden(marker as Marker));

  const bins: NoteHeatBin[] = Array.from({ length: n }, (_, index) => {
    if (duration <= 0) {
      return { index, startMs: 0, endMs: 0, count: 0 };
    }
    const startMs = Math.floor((index * duration) / n);
    const endMs = index === n - 1 ? duration : Math.floor(((index + 1) * duration) / n);
    return { index, startMs, endMs, count: 0 };
  });

  if (duration <= 0) {
    return { bins, maxCount: 0, noteCount: 0 };
  }

  for (const marker of visible) {
    const time = marker.timestampMs;
    if (time < 0 || time > duration) {
      continue;
    }
    const index = time >= duration ? n - 1 : Math.min(n - 1, Math.floor((time * n) / duration));
    bins[index].count += 1;
  }

  let maxCount = 0;
  for (const bin of bins) {
    if (bin.count > maxCount) {
      maxCount = bin.count;
    }
  }

  return { bins, maxCount, noteCount: visible.length };
}

export function hottestBins(bins: NoteHeatBin[], limit = 8): NoteHeatBin[] {
  return bins
    .filter((bin) => bin.count > 0)
    .slice()
    .sort((left, right) => right.count - left.count || left.startMs - right.startMs)
    .slice(0, limit);
}
