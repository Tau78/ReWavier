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

/** People who already wrote in this album, plus you — for @ autocomplete. */
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
      const name = markerAuthorLabel(marker);
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

  return [...byKey.values()].sort((a, b) =>
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
