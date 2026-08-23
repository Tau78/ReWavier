import * as LegacyFS from 'expo-file-system/legacy';
import * as SecureStore from 'expo-secure-store';

import type { SessionUser } from '../domain/session';
import { ensureDirAsync, pathExistsAsync } from './fsSafe';
import { libraryDirectory } from './libraryPaths';

const SESSION_NAME = 'session.json';
const ACCOUNTS_NAME = 'accounts.json';
const GOOGLE_TOKEN_KEY = 'rewavier.google.access';

export type LocalAccount = {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
};

export type SessionSnapshot = {
  user: SessionUser | null;
  reservedColors: string[];
};

function sessionFileUri(): string {
  return `${libraryDirectory().uri}/${SESSION_NAME}`;
}

function accountsFileUri(): string {
  return `${libraryDirectory().uri}/${ACCOUNTS_NAME}`;
}

export async function loadSessionSnapshot(): Promise<SessionSnapshot> {
  const uri = sessionFileUri();
  if (!(await pathExistsAsync(uri))) {
    return { user: null, reservedColors: [] };
  }
  try {
    const parsed = JSON.parse(await LegacyFS.readAsStringAsync(uri)) as SessionSnapshot;
    return {
      user: parsed.user ?? null,
      reservedColors: Array.isArray(parsed.reservedColors) ? parsed.reservedColors : [],
    };
  } catch {
    return { user: null, reservedColors: [] };
  }
}

export async function saveSessionSnapshot(snapshot: SessionSnapshot): Promise<void> {
  await ensureDirAsync(libraryDirectory().uri);
  await LegacyFS.writeAsStringAsync(sessionFileUri(), JSON.stringify(snapshot));
}

export async function loadLocalAccounts(): Promise<LocalAccount[]> {
  const uri = accountsFileUri();
  if (!(await pathExistsAsync(uri))) {
    return [];
  }
  try {
    const parsed = JSON.parse(await LegacyFS.readAsStringAsync(uri)) as LocalAccount[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveLocalAccounts(accounts: LocalAccount[]): Promise<void> {
  await ensureDirAsync(libraryDirectory().uri);
  await LegacyFS.writeAsStringAsync(accountsFileUri(), JSON.stringify(accounts));
}

/** Drops the matching email account. Demo login is hardcoded and is never stored here.
 * Keep `scripts/check-account-delete.mjs` in sync with this filter. */
export function accountsWithoutUser(
  accounts: LocalAccount[],
  user: { id: string; email: string },
): LocalAccount[] {
  const email = user.email.trim().toLowerCase();
  return accounts.filter((item) => item.id !== user.id && item.email !== email);
}

export async function saveGoogleToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(GOOGLE_TOKEN_KEY, token);
}

export async function loadGoogleToken(): Promise<string | null> {
  return SecureStore.getItemAsync(GOOGLE_TOKEN_KEY);
}

export async function clearGoogleToken(): Promise<void> {
  await SecureStore.deleteItemAsync(GOOGLE_TOKEN_KEY);
}
