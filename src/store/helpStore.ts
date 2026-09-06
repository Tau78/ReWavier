import { create } from 'zustand';

import { loadHelpSnapshot, saveHelpSnapshot } from '../files/helpPersist';

export type HelpState = {
  hydrated: boolean;
  tourDone: boolean;
  tourVisible: boolean;
};

export type HelpActions = {
  hydrate: () => Promise<void>;
  skipTour: () => void;
  completeTour: () => void;
  startTour: () => void;
  hideTour: () => void;
};

export type HelpStore = HelpState & HelpActions;

function persistDone(): void {
  void saveHelpSnapshot({ tourDone: true }).catch(() => undefined);
}

let hydrateInFlight: Promise<void> | null = null;

export const useHelpStore = create<HelpStore>((set, get) => ({
  hydrated: false,
  tourDone: false,
  tourVisible: false,

  async hydrate() {
    if (get().hydrated) {
      return;
    }
    if (hydrateInFlight) {
      await hydrateInFlight;
      return;
    }
    hydrateInFlight = loadHelpSnapshot()
      .then((snapshot) => {
        set({ hydrated: true, tourDone: get().tourDone || snapshot.tourDone });
      })
      .catch(() => {
        set({ hydrated: true });
      })
      .finally(() => {
        hydrateInFlight = null;
      });
    await hydrateInFlight;
  },

  skipTour() {
    set({ tourDone: true, tourVisible: false });
    persistDone();
  },

  completeTour() {
    set({ tourDone: true, tourVisible: false });
    persistDone();
  },

  startTour() {
    set({ tourVisible: true });
  },

  hideTour() {
    if (!get().tourDone) {
      return;
    }
    set({ tourVisible: false });
  },
}));
