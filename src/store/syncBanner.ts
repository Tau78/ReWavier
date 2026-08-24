/** Library banner rules. Keep `scripts/check-sync-banner.mjs` in sync. */

export const SYNC_STALE_MS = 20_000;

export type SyncBannerState = {
  status: 'idle' | 'syncing' | 'error';
  startedAt?: number | null;
  message?: string | null;
  pendingReviews: { length: number };
  needsFolderLink: boolean;
  needsFileRefresh: boolean;
};

/** Quiet success / “Allineo i brani…” must not sit on the library forever. */
export function libraryNeedsBanner(state: SyncBannerState): boolean {
  if (state.pendingReviews.length > 0) {
    return true;
  }
  if (state.needsFolderLink || state.needsFileRefresh) {
    return true;
  }
  return state.status === 'error' && Boolean(state.message);
}

export function isSyncInFlight(state: Pick<SyncBannerState, 'status' | 'startedAt'>, now = Date.now()): boolean {
  if (state.status !== 'syncing') {
    return false;
  }
  const startedAt = state.startedAt ?? 0;
  if (startedAt <= 0) {
    return false;
  }
  return now - startedAt < SYNC_STALE_MS;
}
