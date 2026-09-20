import { colorForAuthorSeed, resolveAuthorColor } from './bandColors';
import { playableAlbumTrackIds } from './albumVersions';
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

function displayNameForMember(
  album: Album | undefined,
  key: string,
  fallback: string,
): string {
  return album?.memberNames?.[key]?.trim() || fallback.trim();
}

function mentionPersonFromName(
  album: Album | undefined,
  key: string,
  rawName: string,
): AlbumMentionPerson {
  const name = displayNameForMember(album, key, rawName);
  const handle = slugFromName(name);
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
        authorId: key,
        authorName: name,
      },
      album?.memberColors,
    ),
    initial: noteAuthorInitial(name),
    handle,
  };
}

/** Prefer readable UTF-8 name and album member label when two rows share a handle. */
function preferMentionPerson(
  left: AlbumMentionPerson,
  right: AlbumMentionPerson,
  album: Album | undefined,
): AlbumMentionPerson {
  const leftName = displayNameForMember(album, left.key, left.name);
  const rightName = displayNameForMember(album, right.key, right.name);
  const mojibake = /Ã|Â|�/;
  const leftBad = mojibake.test(leftName);
  const rightBad = mojibake.test(rightName);
  if (leftBad !== rightBad) {
    return rightBad ? { ...left, name: leftName } : { ...right, name: rightName };
  }
  const pick = rightName.length > leftName.length ? right : left;
  const name = rightName.length > leftName.length ? rightName : leftName;
  return {
    ...pick,
    name,
    color: album?.memberColors?.[pick.key] || pick.color,
    initial: noteAuthorInitial(name),
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
      const handle = slugFromName(name);
      byKey.set(key, {
        key,
        name,
        color: markerColor(marker, album?.memberColors),
        initial: noteAuthorInitial(name),
        handle,
      });
    }
  }

  if (user) {
    const key = user.id?.trim() || user.displayName?.trim() || 'self';
    const name = user.displayName?.trim() || 'Tu';
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
        name: name || existing.name,
      });
    }
  }

  // Drive / album roster: shared on the folder but not yet written a note.
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
