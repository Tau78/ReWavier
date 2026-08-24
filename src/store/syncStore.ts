import { create } from 'zustand';

import type { Marker } from '../domain/models';
import { isSyncInFlight, libraryNeedsBanner } from './syncBanner';

export { isSyncInFlight, libraryNeedsBanner, SYNC_STALE_MS } from './syncBanner';

export type AudioUpdate = {
  trackId: string;
  title: string;
  fileName: string;
  markers: Marker[];
};

export type SyncState = {
  status: 'idle' | 'syncing' | 'error';
  startedAt: number | null;
  lastSyncedAt: number | null;
  message: string | null;
  pendingReviews: AudioUpdate[];
  notesPulled: number;
  needsFolderLink: boolean;
  needsFileRefresh: boolean;
};

export type SyncActions = {
  start: () => void;
  finish: (input: Partial<SyncState>) => void;
  fail: (message: string) => void;
  dismissReview: (trackId: string) => void;
  clearBanner: () => void;
  reset: () => void;
};

export type SyncStore = SyncState & SyncActions;

export const useSyncStore = create<SyncStore>((set) => ({
  status: 'idle',
  startedAt: null,
  lastSyncedAt: null,
  message: null,
  pendingReviews: [],
  notesPulled: 0,
  needsFolderLink: false,
  needsFileRefresh: false,

  start() {
    set({ status: 'syncing', startedAt: Date.now(), message: 'Allineo i brani…' });
  },

  finish(input) {
    set({
      status: 'idle',
      startedAt: null,
      lastSyncedAt: input.lastSyncedAt ?? Date.now(),
      message: input.message ?? null,
      pendingReviews: input.pendingReviews ?? [],
      notesPulled: input.notesPulled ?? 0,
      needsFolderLink: input.needsFolderLink ?? false,
      needsFileRefresh: input.needsFileRefresh ?? false,
    });
  },

  fail(message) {
    set((state) => {
      if (state.status !== 'syncing') {
        return state;
      }
      return { status: 'error', startedAt: null, message };
    });
  },

  dismissReview(trackId) {
    set((state) => ({
      pendingReviews: state.pendingReviews.filter((item) => item.trackId !== trackId),
    }));
  },

  clearBanner() {
    set({ message: null, needsFileRefresh: false });
  },

  reset() {
    set({
      status: 'idle',
      startedAt: null,
      lastSyncedAt: null,
      message: null,
      pendingReviews: [],
      notesPulled: 0,
      needsFolderLink: false,
      needsFileRefresh: false,
    });
  },
}));
