import type { Album } from './library';
import { BAND_COLORS, isBandColor } from './bandColors';
import { normalizeDisplayName } from './displayNames';

export const MEMBERS_FILE_NAME = '.rewavier.members.json';

export type AlbumMemberRecord = {
  key: string;
  name: string;
  email?: string;
  color?: string;
  pushToken?: string;
};

export type AlbumMembersFile = {
  updatedAt: number;
  members: AlbumMemberRecord[];
};

export function isAlbumMembersFileName(fileName: string): boolean {
  return fileName.trim().toLowerCase() === MEMBERS_FILE_NAME.toLowerCase();
}

export function parseAlbumMembersFile(raw: string): AlbumMembersFile | null {
  try {
    const parsed = JSON.parse(raw) as Partial<AlbumMembersFile>;
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    const updatedAt = Number(parsed.updatedAt);
    if (!Number.isFinite(updatedAt)) {
      return null;
    }
    const members: AlbumMemberRecord[] = [];
    if (Array.isArray(parsed.members)) {
      for (const row of parsed.members) {
        if (!row || typeof row !== 'object') {
          continue;
        }
        const key = typeof row.key === 'string' ? row.key.trim() : '';
        const name = normalizeDisplayName(typeof row.name === 'string' ? row.name : '');
        if (!key || !name) {
          continue;
        }
        const email = typeof row.email === 'string' ? row.email.trim() : undefined;
        const color =
          typeof row.color === 'string' && isBandColor(row.color) ? row.color : undefined;
        const pushToken =
          typeof row.pushToken === 'string' && row.pushToken.trim().startsWith('ExponentPushToken[')
            ? row.pushToken.trim()
            : undefined;
        members.push({ key, name, email: email || undefined, color, pushToken });
      }
    }
    return { updatedAt: Math.round(updatedAt), members };
  } catch {
    return null;
  }
}

export function buildAlbumMembersFile(
  album: Pick<
    Album,
    'memberColors' | 'memberEmails' | 'memberNames' | 'memberPushTokens' | 'membersUpdatedAt'
  >,
  fallback: AlbumMemberRecord[],
): AlbumMembersFile {
  const keys = new Set<string>([
    ...Object.keys(album.memberColors ?? {}),
    ...Object.keys(album.memberEmails ?? {}),
    ...Object.keys(album.memberNames ?? {}),
    ...Object.keys(album.memberPushTokens ?? {}),
    ...fallback.map((row) => row.key),
  ]);
  const members: AlbumMemberRecord[] = [];
  for (const key of keys) {
    const fromFallback = fallback.find((row) => row.key === key);
    const name = album.memberNames?.[key]?.trim() || fromFallback?.name?.trim();
    if (!name) {
      continue;
    }
    const email = album.memberEmails?.[key]?.trim() || fromFallback?.email?.trim();
    const color = album.memberColors?.[key];
    const pushToken =
      album.memberPushTokens?.[key]?.trim() || fromFallback?.pushToken?.trim() || undefined;
    members.push({
      key,
      name,
      email: email || undefined,
      color: color && isBandColor(color) ? color : undefined,
      pushToken: pushToken?.startsWith('ExponentPushToken[') ? pushToken : undefined,
    });
  }
  members.sort((a, b) => a.name.localeCompare(b.name, 'it', { sensitivity: 'base' }));
  return {
    updatedAt: album.membersUpdatedAt ?? Date.now(),
    members,
  };
}

export function memberColorMapFromFile(file: AlbumMembersFile): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of file.members) {
    if (row.color && isBandColor(row.color)) {
      out[row.key] = row.color;
    }
  }
  return out;
}

export function memberEmailMapFromFile(file: AlbumMembersFile): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of file.members) {
    if (row.email?.trim()) {
      out[row.key] = row.email.trim().toLowerCase();
    }
  }
  return out;
}

export function memberNameMapFromFile(file: AlbumMembersFile): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of file.members) {
    if (row.name.trim()) {
      out[row.key] = row.name.trim();
    }
  }
  return out;
}

export function memberPushTokenMapFromFile(file: AlbumMembersFile): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of file.members) {
    const token = row.pushToken?.trim();
    if (token?.startsWith('ExponentPushToken[')) {
      out[row.key] = token;
    }
  }
  return out;
}

export function shouldApplyRemoteMembers(
  localUpdatedAt: number | undefined,
  remoteUpdatedAt: number,
): boolean {
  return remoteUpdatedAt > (localUpdatedAt ?? 0);
}

export function nextMemberPaletteColor(taken: string[]): string {
  const used = new Set(taken.map((c) => c.toLowerCase()));
  const free = BAND_COLORS.find((c) => !used.has(c.toLowerCase()));
  return free ?? BAND_COLORS[0]!;
}
