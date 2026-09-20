import { colorForAuthorSeed, resolveAuthorColor } from './bandColors';
import { playableAlbumTrackIds } from './albumVersions';
import {
  looksLikeAuthorId,
  memberHandleFromName,
  normalizeDisplayName,
  preferDisplayName,
} from './displayNames';
import {
  markerAuthorLabel,
  markerAuthorSeed,
  markerColor,
  noteAuthorInitial,
  type NoteAuthorDot,
} from './markers';
import type { Album } from './library';
import type { Marker } from './models';
import { slugFromName, type SessionUser } from './session';

export type AlbumMentionPerson = NoteAuthorDot & {
  handle: string;
};

export type AlbumMemberRow = {
  key: string;
  name: string;
  email?: string;
  color: string;
};

function displayNameForMember(
  album: Album | undefined,
  key: string,
  fallback: string,
): string {
  return normalizeDisplayName(album?.memberNames?.[key] || fallback);
}

function mentionPersonFromName(
  album: Album | undefined,
  key: string,
  rawName: string,
): AlbumMentionPerson {
  const name = displayNameForMember(album, key, rawName);
  const handle = memberHandleFromName(name);
  return {
    key,
    name,
    color: markerColor(
      {
        id: key,
        timestampMs: 0,
        text: '',
        createdAt: 0,
        updatedAt: 0,
        authorId: looksLikeAuthorId(key) ? key : undefined,
        authorName: name,
      },
      album?.memberColors,
    ),
    initial: noteAuthorInitial(name),
    handle,
  };
}

function mentionScore(person: AlbumMentionPerson, album: Album | undefined): number {
  const name = displayNameForMember(album, person.key, person.name);
  let score = 0;
  if (looksLikeAuthorId(person.key)) {
    score += 100;
  }
  if (album?.memberEmails?.[person.key]?.trim()) {
    score += 40;
  }
  if (!/(?:Ã|Â|ï¿½)/.test(name)) {
    score += 20;
  }
  score += name.length;
  return score;
}

/** Prefer account id + readable UTF-8 name when two rows share a handle. */
function preferMentionPerson(
  left: AlbumMentionPerson,
  right: AlbumMentionPerson,
  album: Album | undefined,
): AlbumMentionPerson {
  const pick = mentionScore(right, album) > mentionScore(left, album) ? right : left;
  const other = pick === right ? left : right;
  const name = preferDisplayName(
    displayNameForMember(album, pick.key, pick.name),
    displayNameForMember(album, other.key, other.name),
  );
  const key = mentionScore(right, album) > mentionScore(left, album) ? right.key : left.key;
  return {
    ...pick,
    key: looksLikeAuthorId(pick.key) ? pick.key : key,
    name,
    color: album?.memberColors?.[pick.key] || album?.memberColors?.[other.key] || pick.color,
    initial: noteAuthorInitial(name),
    handle: memberHandleFromName(name),
  };
}

/** Album members + note authors + you — for @ autocomplete. */
export function albumMentionCandidates(
  album: Album | undefined,
  markersByTrackId: Record<string, Marker[]>,
  user: Pick<SessionUser, 'id' | 'displayName' | 'authorSlug' | 'bandColor'> | null,
): AlbumMentionPerson[] {
  const trackIds = album ? playableAlbumTrackIds(album) : [];
  const byKey = new Map<string, AlbumMentionPerson>();

  for (const trackId of trackIds) {
    for (const marker of markersByTrackId[trackId] ?? []) {
      const key = markerAuthorSeed(marker);
      if (byKey.has(key)) {
        continue;
      }
      const name = displayNameForMember(album, key, markerAuthorLabel(marker));
      byKey.set(key, {
        key,
        name,
        color: markerColor(marker, album?.memberColors),
        initial: noteAuthorInitial(name),
        handle: memberHandleFromName(name),
      });
    }
  }

  if (user) {
    const key = user.id?.trim() || user.displayName?.trim() || 'self';
    const name = normalizeDisplayName(user.displayName) || 'Tu';
    const handle = (user.authorSlug?.trim() || slugFromName(name)).toLowerCase();
    const color = resolveAuthorColor(user.bandColor, key) || colorForAuthorSeed(key);
    if (!byKey.has(key)) {
      byKey.set(key, {
        key,
        name,
        color,
        initial: noteAuthorInitial(name),
        handle,
      });
    } else {
      const existing = byKey.get(key)!;
      byKey.set(key, {
        ...existing,
        handle: handle || existing.handle,
        name: preferDisplayName(existing.name, name),
      });
    }
  }

  for (const [key, rawName] of Object.entries(album?.memberNames ?? {})) {
    if (!key.trim() || !rawName.trim() || byKey.has(key)) {
      continue;
    }
    byKey.set(key, mentionPersonFromName(album, key, rawName));
  }

  const byHandle = new Map<string, AlbumMentionPerson>();
  for (const person of byKey.values()) {
    const handleKey = person.handle.trim().toLowerCase();
    if (!handleKey) {
      continue;
    }
    const existing = byHandle.get(handleKey);
    byHandle.set(
      handleKey,
      existing ? preferMentionPerson(existing, person, album) : person,
    );
  }

  return [...byHandle.values()].sort((a, b) =>
    a.name.localeCompare(b.name, 'it', { sensitivity: 'base' }),
  );
}

/** Membri album per pannello info — stessa unificazione di @. */
export function albumMemberRows(
  album: Album,
  markersByTrackId: Record<string, Marker[]>,
  user: Pick<SessionUser, 'id' | 'displayName' | 'email' | 'authorSlug' | 'bandColor'> | null,
): AlbumMemberRow[] {
  return albumMentionCandidates(album, markersByTrackId, user).map((person) => ({
    key: person.key,
    name: person.name,
    email:
      album.memberEmails?.[person.key] ||
      (user && (user.id === person.key || normalizeDisplayName(user.displayName) === person.name)
        ? user.email
        : undefined),
    color: album.memberColors?.[person.key] || person.color,
  }));
}

/** Handles that mean “me” on this phone. */
export function selfMentionHandles(
  user: Pick<SessionUser, 'displayName' | 'authorSlug'> | null,
): string[] {
  if (!user) {
    return [];
  }
  const handles = new Set<string>();
  const slug = user.authorSlug?.trim().toLowerCase();
  if (slug) {
    handles.add(slug);
  }
  const fromName = slugFromName(user.displayName ?? '');
  if (fromName) {
    handles.add(fromName);
  }
  return [...handles];
}
