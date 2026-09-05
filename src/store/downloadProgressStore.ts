import { create } from 'zustand';

import { DownloadPausedError } from '../domain/collectionDownloadVisual';
import { folderDownloadPercent } from '../domain/downloadProgress';

export type DownloadProgressMode = 'idle' | 'collection' | 'import';

export type DownloadProgressState = {
  active: boolean;
  mode: DownloadProgressMode;
  done: number;
  total: number;
  fileFraction: number;
  percent: number;
  queueIds: string[];
  pauseRequested: boolean;
  driveNewsById: Record<string, number>;
};

type DownloadProgressActions = {
  begin: (total: number) => void;
  beginCollection: (trackIds: string[]) => void;
  setFileFraction: (fraction: number) => void;
  advance: () => void;
  requestPause: () => void;
  setCurrentCancel: (cancel: (() => void) | null) => void;
  setDriveNews: (albumId: string, count: number) => void;
  end: () => void;
};

function snapshot(done: number, total: number, fileFraction: number): Pick<
  DownloadProgressState,
  'done' | 'total' | 'fileFraction' | 'percent'
> {
  return {
    done,
    total,
    fileFraction,
    percent: folderDownloadPercent(done, total, fileFraction),
  };
}

let currentCancel: (() => void) | null = null;

export function throwIfDownloadPaused(): void {
  if (useDownloadProgressStore.getState().pauseRequested) {
    throw new DownloadPausedError();
  }
}

export const useDownloadProgressStore = create<DownloadProgressState & DownloadProgressActions>(
  (set, get) => ({
    active: false,
    mode: 'idle',
    done: 0,
    total: 0,
    fileFraction: 0,
    percent: 0,
    queueIds: [],
    pauseRequested: false,
    driveNewsById: {},

    begin(total) {
      currentCancel = null;
      set({
        active: true,
        mode: 'import',
        pauseRequested: false,
        queueIds: [],
        ...snapshot(0, Math.max(0, total), 0),
      });
    },

    beginCollection(trackIds) {
      currentCancel = null;
      set({
        active: true,
        mode: 'collection',
        pauseRequested: false,
        queueIds: [...trackIds],
        ...snapshot(0, trackIds.length, 0),
      });
    },

    setFileFraction(fraction) {
      const { active, done, total } = get();
      if (!active) {
        return;
      }
      set(snapshot(done, total, fraction));
    },

    advance() {
      const { active, done, total } = get();
      if (!active) {
        return;
      }
      set(snapshot(Math.min(done + 1, total), total, 0));
    },

    requestPause() {
      if (!get().active) {
        return;
      }
      set({ pauseRequested: true });
      const cancel = currentCancel;
      currentCancel = null;
      cancel?.();
    },

    setCurrentCancel(cancel) {
      currentCancel = cancel;
    },

    setDriveNews(albumId, count) {
      set((state) => ({
        driveNewsById: { ...state.driveNewsById, [albumId]: Math.max(0, count) },
      }));
    },

    end() {
      currentCancel = null;
      set({
        active: false,
        mode: 'idle',
        done: 0,
        total: 0,
        fileFraction: 0,
        percent: 0,
        queueIds: [],
        pauseRequested: false,
      });
    },
  }),
);

export function isCollectionDownloadBusy(): boolean {
  const state = useDownloadProgressStore.getState();
  return state.active && state.mode === 'collection';
}

export function isTrackDownloadBlocked(trackId: string): boolean {
  const state = useDownloadProgressStore.getState();
  return state.active && state.mode === 'collection' && state.queueIds.includes(trackId);
}
