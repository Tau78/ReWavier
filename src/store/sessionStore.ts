import * as Crypto from 'expo-crypto';
import { create } from 'zustand';

import { availableBandColors } from '../domain/bandColors';
import { createId } from '../domain/library';
import { DEMO_ACCOUNT, isDemoAccount } from '../auth/demoAccount';
import { saveGoogleAuth } from '../auth/googleToken';
import {
  normalizeSessionUser,
  primaryUsage,
  slugFromName,
  type AuthProvider,
  type DriveLink,
  type SessionUser,
  type UsageType,
  type UserBand,
} from '../domain/session';
import {
  accountsWithoutUser,
  clearGoogleToken,
  loadLocalAccounts,
  loadSessionSnapshot,
  saveLocalAccounts,
  saveSessionSnapshot,
  type LocalAccount,
} from '../files/sessionPersist';

export type SessionState = {
  hydrated: boolean;
  user: SessionUser | null;
  reservedColors: string[];
};

export type SessionActions = {
  hydrate: () => Promise<void>;
  signInEmail: (email: string, password: string) => Promise<void>;
  registerEmail: (email: string, password: string, displayName: string) => Promise<void>;
  signInSocial: (input: {
    provider: AuthProvider;
    id: string;
    email: string;
    displayName: string;
    accessToken?: string;
    refreshToken?: string;
    clientId?: string;
    expiresIn?: number;
  }) => Promise<void>;
  completeOnboarding: (input: {
    usageType?: UsageType;
    usageTypes: UsageType[];
    bands?: UserBand[];
    driveLink?: DriveLink;
    bandColor?: string | null;
    markersEditableByOthers?: boolean;
  }) => void;
  setUsageTypes: (usageTypes: UsageType[]) => void;
  upsertBand: (band: UserBand) => void;
  removeBand: (bandId: string) => void;
  setActiveBand: (bandId: string) => void;
  connectDrive: (link: DriveLink) => void;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
};

export type SessionStore = SessionState & SessionActions;

function persist(state: SessionState) {
  void saveSessionSnapshot({
    user: state.user,
    reservedColors: state.reservedColors,
  }).catch(() => undefined);
}

function makeUser(input: {
  id: string;
  email: string;
  displayName: string;
  provider: AuthProvider;
  driveConnected?: boolean;
  driveLink?: DriveLink;
}): SessionUser {
  return {
    id: input.id,
    email: input.email.trim().toLowerCase(),
    displayName: input.displayName.trim() || input.email.split('@')[0] || 'Utente',
    authorSlug: slugFromName(input.displayName || input.email),
    provider: input.provider,
    onboarded: false,
    usageType: null,
    usageTypes: [],
    driveConnected: input.driveConnected === true,
    driveLink: input.driveLink ?? null,
    bands: [],
    activeBandId: null,
    bandColor: null,
    markersEditableByOthers: false,
  };
}

async function hashPassword(email: string, password: string): Promise<string> {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${email.trim().toLowerCase()}:${password}`,
  );
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  hydrated: false,
  user: null,
  reservedColors: [],

  async hydrate() {
    const snapshot = await loadSessionSnapshot();
    set({
      hydrated: true,
      user: snapshot.user ? normalizeSessionUser(snapshot.user) : null,
      reservedColors: snapshot.reservedColors,
    });
  },

  async signInEmail(email, password) {
    const normalized = email.trim().toLowerCase();
    if (isDemoAccount(normalized, password)) {
      const existing = get().user?.email === DEMO_ACCOUNT.email ? get().user : null;
      const user = existing
        ? { ...existing, onboarded: true }
        : {
            ...makeUser({
              id: 'user-app-review',
              email: DEMO_ACCOUNT.email,
              displayName: DEMO_ACCOUNT.displayName,
              provider: 'email',
            }),
            onboarded: true,
            usageType: 'creator' as const,
            usageTypes: ['creator' as const],
          };
      set({ user });
      persist(get());
      return;
    }
    const accounts = await loadLocalAccounts();
    const account = accounts.find((item) => item.email === normalized);
    if (!account) {
      throw new Error('Nessun account con questa email');
    }
    const hash = await hashPassword(normalized, password);
    if (hash !== account.passwordHash) {
      throw new Error('Password non corretta');
    }
    const existing = get().user?.email === normalized ? get().user : null;
    const user =
      existing ??
      makeUser({
        id: account.id,
        email: account.email,
        displayName: account.displayName,
        provider: 'email',
      });
    set({ user });
    persist(get());
  },

  async registerEmail(email, password, displayName) {
    const normalized = email.trim().toLowerCase();
    if (isDemoAccount(normalized, password) || normalized === DEMO_ACCOUNT.email) {
      await get().signInEmail(DEMO_ACCOUNT.email, DEMO_ACCOUNT.password);
      return;
    }
    if (!normalized.includes('@') || password.length < 6) {
      throw new Error('Email valida e password di almeno 6 caratteri');
    }
    const accounts = await loadLocalAccounts();
    if (accounts.some((item) => item.email === normalized)) {
      throw new Error('Questa email è già registrata su questo dispositivo');
    }
    const account: LocalAccount = {
      id: createId('user'),
      email: normalized,
      passwordHash: await hashPassword(normalized, password),
      displayName: displayName.trim() || normalized.split('@')[0] || 'Utente',
    };
    await saveLocalAccounts([...accounts, account]);
    const user = makeUser({
      id: account.id,
      email: account.email,
      displayName: account.displayName,
      provider: 'email',
    });
    set({ user });
    persist(get());
  },

  async signInSocial(input) {
    if (input.provider === 'google') {
      if (!input.accessToken) {
        throw new Error('Google non ha collegato Drive. Riprova Continua con Google.');
      }
      await saveGoogleAuth({
        accessToken: input.accessToken,
        refreshToken: input.refreshToken,
        clientId: input.clientId,
        expiresAt: input.expiresIn
          ? Date.now() + Math.max(30, input.expiresIn - 60) * 1000
          : Date.now() + 50 * 60 * 1000,
      });
    }
    const existing = get().user;
    const same = existing && existing.id === input.id;
    const user = same
      ? {
          ...existing,
          email: input.email || existing.email,
          displayName: input.displayName || existing.displayName,
          provider: input.provider,
          driveConnected: input.provider === 'google' ? true : existing.driveConnected,
          driveLink: input.provider === 'google' ? 'google' : existing.driveLink,
        }
      : makeUser({
          id: input.id,
          email: input.email,
          displayName: input.displayName,
          provider: input.provider,
          driveConnected: input.provider === 'google',
          driveLink: input.provider === 'google' ? 'google' : null,
        });
    set({ user: normalizeSessionUser(user) });
    persist(get());
  },

  completeOnboarding(input) {
    const { user, reservedColors } = get();
    if (!user) {
      return;
    }
    const usageTypes = input.usageTypes.length > 0
      ? input.usageTypes
      : input.usageType
        ? [input.usageType]
        : [];
    const usageType = primaryUsage(usageTypes);
    const asBand = usageTypes.includes('band');
    const bands = asBand ? input.bands ?? user.bands ?? [] : user.bands ?? [];
    const bandColor = asBand
      ? bands[0]?.color ?? input.bandColor ?? null
      : user.bandColor;
    const nextReserved = Array.from(
      new Set([...reservedColors, ...bands.map((band) => band.color)]),
    );
    const driveLink = asBand ? input.driveLink ?? user.driveLink : user.driveLink;
    set({
      reservedColors: nextReserved,
      user: normalizeSessionUser({
        ...user,
        onboarded: true,
        usageType,
        usageTypes,
        bands,
        activeBandId: bands[0]?.id ?? null,
        driveLink,
        driveConnected: asBand ? driveLink != null || user.driveConnected : user.driveConnected,
        bandColor,
        markersEditableByOthers: asBand ? input.markersEditableByOthers === true : true,
      }),
    });
    persist(get());
  },

  setUsageTypes(usageTypes) {
    const { user } = get();
    if (!user) {
      return;
    }
    set({
      user: normalizeSessionUser({
        ...user,
        usageTypes,
        usageType: primaryUsage(usageTypes),
      }),
    });
    persist(get());
  },

  upsertBand(band) {
    const { user, reservedColors } = get();
    if (!user) {
      return;
    }
    const trimmed = { ...band, name: band.name.trim() };
    if (!trimmed.name) {
      return;
    }
    const exists = user.bands.some((item) => item.id === trimmed.id);
    const bands = exists
      ? user.bands.map((item) => (item.id === trimmed.id ? trimmed : item))
      : [...user.bands, trimmed];
    set({
      reservedColors: Array.from(new Set([...reservedColors, trimmed.color])),
      user: normalizeSessionUser({
        ...user,
        bands,
        activeBandId: user.activeBandId ?? trimmed.id,
      }),
    });
    persist(get());
  },

  removeBand(bandId) {
    const { user } = get();
    if (!user) {
      return;
    }
    const bands = user.bands.filter((band) => band.id !== bandId);
    set({
      user: normalizeSessionUser({
        ...user,
        bands,
        activeBandId: user.activeBandId === bandId ? bands[0]?.id ?? null : user.activeBandId,
      }),
    });
    persist(get());
  },

  setActiveBand(bandId) {
    const { user } = get();
    if (!user || !user.bands.some((band) => band.id === bandId)) {
      return;
    }
    set({
      user: normalizeSessionUser({
        ...user,
        activeBandId: bandId,
      }),
    });
    persist(get());
  },

  connectDrive(link) {
    const { user } = get();
    if (!user) {
      return;
    }
    set({
      user: {
        ...user,
        driveConnected: true,
        driveLink: link,
      },
    });
    persist(get());
  },

  async logout() {
    await clearGoogleToken().catch(() => undefined);
    set({ user: null });
    persist(get());
  },

  async deleteAccount() {
    const { user } = get();
    if (!user) {
      return;
    }
    const accounts = await loadLocalAccounts();
    await saveLocalAccounts(accountsWithoutUser(accounts, user));
    await clearGoogleToken().catch(() => undefined);
    set({ user: null });
    persist(get());
  },
}));

export function unusedBandColors(): string[] {
  return availableBandColors(useSessionStore.getState().reservedColors);
}
