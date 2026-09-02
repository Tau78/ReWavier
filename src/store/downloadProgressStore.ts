import { create } from 'zustand';

import { folderDownloadPercent } from '../domain/downloadProgress';

export type DownloadProgressState = {
  active: boolean;
  done: number;
  total: number;
  fileFraction: number;
  percent: number;
};

type DownloadProgressActions = {
  begin: (total: number) => void;
  setFileFraction: (fraction: number) => void;
  advance: () => void;
  end: () => void;
};

function snapshot(done: number, total: number, fileFraction: number): Omit<DownloadProgressState, 'active'> {
  return {
    done,
    total,
    fileFraction,
    percent: folderDownloadPercent(done, total, fileFraction),
  };
}

export const useDownloadProgressStore = create<DownloadProgressState & DownloadProgressActions>((set, get) => ({
  active: false,
  done: 0,
  total: 0,
  fileFraction: 0,
  percent: 0,

  begin(total) {
    set({ active: true, ...snapshot(0, Math.max(0, total), 0) });
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

  end() {
    set({ active: false, done: 0, total: 0, fileFraction: 0, percent: 0 });
  },
}));
