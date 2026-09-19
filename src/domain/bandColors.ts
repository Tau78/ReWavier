export const BAND_COLORS = [
  '#FF6B35',
  '#4A9EFF',
  '#34C759',
  '#FFD60A',
  '#BF5AF2',
  '#FF375F',
  '#64D2FF',
  '#FF9F0A',
  '#5E5CE6',
  '#AC8E68',
] as const;

export type BandColor = (typeof BAND_COLORS)[number];

export function isBandColor(value: string): value is BandColor {
  return (BAND_COLORS as readonly string[]).includes(value);
}

export function availableBandColors(taken: string[]): string[] {
  const used = new Set(taken.map((color) => color.toLowerCase()));
  return BAND_COLORS.filter((color) => !used.has(color.toLowerCase()));
}

/** Stable “random” color from a name/id — same person → same color. */
export function colorForAuthorSeed(seed: string): string {
  const key = seed.trim().toLowerCase() || 'anon';
  let hash = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return BAND_COLORS[(hash >>> 0) % BAND_COLORS.length]!;
}

/** Settings color if chosen; otherwise a stable random from the palette. */
export function resolveAuthorColor(
  preferred: string | null | undefined,
  seed: string,
): string {
  const chosen = preferred?.trim();
  if (chosen) {
    return chosen;
  }
  return colorForAuthorSeed(seed);
}

