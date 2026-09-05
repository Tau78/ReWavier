export const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

export type PlaybackRate = (typeof PLAYBACK_RATES)[number];

export const DEFAULT_PLAYBACK_RATE: PlaybackRate = 1;

export function snapPlaybackRate(value: number): PlaybackRate {
  let best: PlaybackRate = DEFAULT_PLAYBACK_RATE;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const step of PLAYBACK_RATES) {
    const dist = Math.abs(step - value);
    if (dist < bestDist) {
      best = step;
      bestDist = dist;
    }
  }
  return best;
}

export function nextPlaybackRate(current: number): PlaybackRate {
  const snapped = snapPlaybackRate(current);
  const index = PLAYBACK_RATES.indexOf(snapped);
  return PLAYBACK_RATES[(index + 1) % PLAYBACK_RATES.length] ?? DEFAULT_PLAYBACK_RATE;
}

/** User-facing label, Italian decimal comma: 0,5× */
export function formatPlaybackRateLabel(rate: number): string {
  return `${String(snapPlaybackRate(rate)).replace('.', ',')}×`;
}
