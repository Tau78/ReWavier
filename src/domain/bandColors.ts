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
