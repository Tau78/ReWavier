import { File } from 'expo-file-system';
import * as LegacyFS from 'expo-file-system/legacy';
import * as SecureStore from 'expo-secure-store';

import type { SessionUser } from '../domain/session';
import { libraryDirectory } from './libraryFiles';

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

function sessionFile(): File {
  return new File(libraryDirectory(), SESSION_NAME);
}

function accountsFile(): File {
  return new File(libraryDirectory(), ACCOUNTS_NAME);
}

export async function loadSessionSnapshot(): Promise<SessionSnapshot> {
  const file = sessionFile();
  if (!file.exists) {
    return { user: null, reservedColors: [] };
  }
  try {
    const parsed = JSON.parse(await LegacyFS.readAsStringAsync(file.uri)) as SessionSnapshot;
    return {
      user: parsed.user ?? null,
      reservedColors: Array.isArray(parsed.reservedColors) ? parsed.reservedColors : [],
    };
  } catch {
    return { user: null, reservedColors: [] };
  }
}

export async function saveSessionSnapshot(snapshot: SessionSnapshot): Promise<void> {
  await LegacyFS.writeAsStringAsync(sessionFile().uri, JSON.stringify(snapshot));
}

export async function loadLocalAccounts(): Promise<LocalAccount[]> {
  const file = accountsFile();
  if (!file.exists) {
    return [];
  }
  try {
    const parsed = JSON.parse(await LegacyFS.readAsStringAsync(file.uri)) as LocalAccount[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveLocalAccounts(accounts: LocalAccount[]): Promise<void> {
  await LegacyFS.writeAsStringAsync(accountsFile().uri, JSON.stringify(accounts));
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
