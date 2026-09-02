/** Overall folder/album download, 0–100. `fileFraction` is the current file (0–1). */
export function folderDownloadPercent(done: number, total: number, fileFraction = 0): number {
  if (total <= 0) {
    return 0;
  }
  const raw = ((done + Math.max(0, Math.min(1, fileFraction))) / total) * 100;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

export function formatDownloadPercent(percent: number): string {
  return `${Math.max(0, Math.min(100, Math.round(percent)))}%`;
}
