import { create } from 'zustand';

import { isDemoUser } from '../auth/demoAccount';
import { appVersion, unseenWhatsNew, type WhatsNewItem } from '../features/help/whatsNew';
import { loadHelpSnapshot, saveHelpSnapshot, type HelpSnapshot } from '../files/helpPersist';
import { useSessionStore } from './sessionStore';

export type HelpState = {
  hydrated: boolean;
  tourDone: boolean;
  tourVisible: boolean;
  whatsNewVisible: boolean;
  whatsNewItems: WhatsNewItem[];
};

export type HelpActions = {
  hydrate: (userId: string | null) => Promise<void>;
  skipTour: () => void;
  completeTour: () => void;
  startTour: () => void;
  hideTour: () => void;
  dismissWhatsNew: () => void;
  considerOverlays: () => void;
};

export type HelpStore = HelpState &
  HelpActions & {
    userId: string | null;
    seenWhatsNewVersion?: string;
  };

function persist(get: () => HelpStore): void {
  const state = get();
  const snapshot: HelpSnapshot = {
    tourDone: state.tourDone,
  };
  if (state.userId != null) {
    snapshot.userId = state.userId;
  }
  if (state.seenWhatsNewVersion !== undefined) {
    snapshot.seenWhatsNewVersion = state.seenWhatsNewVersion;
  }
  void saveHelpSnapshot(snapshot).catch(() => undefined);
}

function tourDoneForUser(
  snapshot: { tourDone: boolean; userId?: string },
  userId: string | null,
): boolean {
  if (snapshot.userId == null && snapshot.tourDone) {
    return true;
  }
  return userId != null && snapshot.userId === userId && snapshot.tourDone;
}

let hydrateInFlight: Promise<void> | null = null;

export const useHelpStore = create<HelpStore>((set, get) => ({
  hydrated: false,
  tourDone: false,
  tourVisible: false,
  whatsNewVisible: false,
  whatsNewItems: [],
  userId: null,
  seenWhatsNewVersion: undefined,

  async hydrate(userId) {
    if (get().hydrated && get().userId === userId) {
      return;
    }
    if (hydrateInFlight) {
      await hydrateInFlight;
      if (get().hydrated && get().userId === userId) {
        return;
      }
    }

    const run = async () => {
      try {
        const snapshot = await loadHelpSnapshot();
        const tourDone = tourDoneForUser(snapshot, userId);
        set({
          hydrated: true,
          userId,
          tourDone,
          seenWhatsNewVersion: tourDone ? snapshot.seenWhatsNewVersion : undefined,
          tourVisible: false,
          whatsNewVisible: false,
          whatsNewItems: [],
        });
        if (tourDone && snapshot.userId == null && userId != null) {
          await saveHelpSnapshot({
            tourDone: true,
            userId,
            ...(snapshot.seenWhatsNewVersion !== undefined
              ? { seenWhatsNewVersion: snapshot.seenWhatsNewVersion }
              : {}),
          }).catch(() => undefined);
        }
        get().considerOverlays();
      } catch {
        set({
          hydrated: true,
          userId,
          tourDone: false,
          seenWhatsNewVersion: undefined,
          tourVisible: false,
          whatsNewVisible: false,
          whatsNewItems: [],
        });
        get().considerOverlays();
      }
    };

    hydrateInFlight = run().finally(() => {
      hydrateInFlight = null;
    });
    await hydrateInFlight;
  },

  considerOverlays() {
    if (!get().hydrated) {
      return;
    }
    const session = useSessionStore.getState().user;
    if (isDemoUser(session)) {
      set({ tourVisible: false, whatsNewVisible: false, whatsNewItems: [] });
      return;
    }

    const { tourDone, tourVisible, whatsNewVisible, seenWhatsNewVersion } = get();

    if (!tourDone && !whatsNewVisible) {
      set({ tourVisible: true, whatsNewVisible: false, whatsNewItems: [] });
      return;
    }

    if (tourDone && !tourVisible) {
      const items = unseenWhatsNew(seenWhatsNewVersion);
      if (items.length > 0) {
        set({ whatsNewVisible: true, tourVisible: false, whatsNewItems: items });
        return;
      }
      set({ whatsNewVisible: false, whatsNewItems: [] });
    }
  },

  skipTour() {
    set({
      tourDone: true,
      tourVisible: false,
      whatsNewVisible: false,
      whatsNewItems: [],
      seenWhatsNewVersion: appVersion(),
    });
    persist(get);
    get().considerOverlays();
  },

  completeTour() {
    set({
      tourDone: true,
      tourVisible: false,
      whatsNewVisible: false,
      whatsNewItems: [],
      seenWhatsNewVersion: appVersion(),
    });
    persist(get);
    get().considerOverlays();
  },

  startTour() {
    set({ tourVisible: true, whatsNewVisible: false });
  },

  hideTour() {
    if (!get().tourDone) {
      return;
    }
    set({ tourVisible: false });
  },

  dismissWhatsNew() {
    set({
      whatsNewVisible: false,
      whatsNewItems: [],
      seenWhatsNewVersion: appVersion(),
    });
    persist(get);
    get().considerOverlays();
  },
}));
