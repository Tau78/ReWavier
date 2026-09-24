export const colors = {
  background: '#0D0D0F',
  surface: '#1A1A1E',
  surfaceRaised: '#252529',
  text: '#F5F5F7',
  textMuted: '#8E8E93',
  waveform: '#4A9EFF',
  waveformPlayed: '#FFFFFF',
  accent: '#FF6B35',
  marker: '#FF6B35',
  overlay: 'rgba(0,0,0,0.55)',
  border: '#2C2C31',
  danger: '#FF453A',
  /** Deep purple at the top of shell backdrops (not the locked player). */
  gradientDeepTop: '#2A1040',
  /** Warm mid stop; fades the purple toward `background`. */
  gradientDeepMid: '#180E22',
  /** Same as `background` so the gradient lands on the app black. */
  gradientDeepBottom: '#0D0D0F',
  /** Translucent `surface` (#1A1A1E) for glass cards. */
  glassFill: 'rgba(26, 26, 30, 0.62)',
  glassBorder: 'rgba(255, 255, 255, 0.10)',
  glassHighlight: 'rgba(255, 255, 255, 0.14)',
} as const;

/** Readable app text over an author color, including light palette swatches. */
export function textColorOn(backgroundColor: string): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(backgroundColor.trim())?.[1];
  if (!hex) {
    return colors.text;
  }
  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  const brightness = (red * 299 + green * 587 + blue * 114) / 1000;
  return brightness >= 160 ? colors.background : colors.text;
}

export const layout = {
  controlSize: 56,
  addButtonSize: 72,
  hitSlop: { top: 12, bottom: 12, left: 12, right: 12 },
} as const;
