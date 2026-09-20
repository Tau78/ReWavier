import { colorForAuthorSeed, resolveAuthorColor } from './bandColors';
import { normalizeDisplayName } from './displayNames';
import { canWriteWithRole, type FolderRole } from './folderRole';
import type { Marker } from './models';
import { userHasUsage, type SessionUser } from './session';

export function normalizeMarker(raw: Partial<Marker> & Pick<Marker, 'id' | 'timestampMs'>): Marker {
  const authorNameRaw = raw.authorName?.trim();
  const authorName = authorNameRaw ? normalizeDisplayName(authorNameRaw) : undefined;
  return {
    id: raw.id,
    timestampMs: raw.timestampMs,
    text: raw.text ?? '',
    createdAt: raw.createdAt ?? Date.now(),
    updatedAt: raw.updatedAt ?? raw.createdAt ?? Date.now(),
    hidden: raw.hidden === true,
    authorId: raw.authorId,
    authorName: authorName || undefined,
    color: raw.color,
    editableByOthers: raw.editableByOthers,
    placeholder: raw.placeholder === true ? true : undefined,
  };
}

export function markerAuthorSeed(marker: Pick<Marker, 'authorId' | 'authorName'>): string {
  return marker.authorId?.trim() || marker.authorName?.trim() || 'self';
}

export function markerColor(
  marker: Marker,
  colorOverrides?: Record<string, string> | null,
): string {
  const seed = markerAuthorSeed(marker);
  const fromAlbum =
    colorOverrides?.[seed]?.trim() ||
    (marker.authorId ? colorOverrides?.[marker.authorId]?.trim() : undefined);
  if (fromAlbum) {
    return fromAlbum;
  }
  return resolveAuthorColor(marker.color, seed);
}

/** One swatch per unique note author (most recently active first). */
export type NoteAuthorDot = {
  key: string;
  color: string;
  name: string;
  initial: string;
};

/** First letter of the display name (M for Mauro, T for Tu). */
export function noteAuthorInitial(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return '?';
  }
  const letter = [...trimmed][0] ?? '?';
  return letter.toLocaleUpperCase('it-IT');
}

export function noteAuthorDots(
  markers: Marker[],
  colorOverrides?: Record<string, string> | null,
): NoteAuthorDot[] {
  const sorted = [...visibleMarkers(markers)].sort((a, b) => b.updatedAt - a.updatedAt);
  const byKey = new Map<string, NoteAuthorDot>();
  for (const marker of sorted) {
    const key = markerAuthorSeed(marker);
    if (byKey.has(key)) {
      continue;
    }
    const name = markerAuthorLabel(marker);
    byKey.set(key, {
      key,
      color: markerColor(marker, colorOverrides),
      name,
      initial: noteAuthorInitial(name),
    });
  }
  const list = [...byKey.values()];
  // Same stamp for everyone (old orange fallback) → one distinct color per person.
  const uniqueColors = new Set(list.map((dot) => dot.color.toLowerCase()));
  if (list.length >= 2 && uniqueColors.size === 1) {
    return list.map((dot) => ({
      ...dot,
      color: colorOverrides?.[dot.key] || colorForAuthorSeed(dot.key),
    }));
  }
  return list;
}

export function isMarkerHidden(marker: Marker): boolean {
  return marker.hidden === true;
}

export function visibleMarkers(markers: Marker[]): Marker[] {
  return markers.filter((marker) => !isMarkerHidden(marker));
}

export function markerAuthorLabel(marker: Marker): string {
  const name = normalizeDisplayName(marker.authorName);
  return name || 'Tu';
}

/** Notes without author are treated as yours (old appunti on this phone). */
export function isOwnMarker(
  marker: Pick<Marker, 'authorId' | 'authorName'>,
  user: Pick<SessionUser, 'id' | 'displayName'> | null,
): boolean {
  if (marker.authorId) {
    return Boolean(user?.id && marker.authorId === user.id);
  }
  if (!marker.authorName?.trim()) {
    return true;
  }
  const mine = user?.displayName?.trim();
  return Boolean(mine && mine === marker.authorName.trim());
}

/** Rispondi is visible from the first saved note, so the thread looks like a chat. */
export function canShowNoteReply(folderReadOnly: boolean, conversationCount: number): boolean {
  return !folderReadOnly && conversationCount > 0;
}

export function markerPreviewText(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (!flat) {
    return '';
  }
  if (flat.length <= 56) {
    return flat;
  }
  return `${flat.slice(0, 55).trim()}…`;
}

export function canEditMarker(marker: Marker, user: SessionUser | null): boolean {
  if (!user) {
    return false;
  }
  if (!marker.authorId || marker.authorId === user.id) {
    return true;
  }
  return marker.editableByOthers === true;
}

export function canEditMarkerInAlbum(
  marker: Marker,
  user: SessionUser | null,
  role: FolderRole,
): boolean {
  return canWriteWithRole(role) && canEditMarker(marker, user);
}

export function isPlaceholderMarker(marker: Pick<Marker, 'placeholder'>): boolean {
  return marker.placeholder === true;
}

export function stampNewMarker(
  base: Pick<Marker, 'id' | 'timestampMs' | 'text' | 'createdAt' | 'updatedAt'> &
    Partial<Pick<Marker, 'placeholder'>>,
  user: SessionUser | null,
): Marker {
  const seed = user?.id?.trim() || user?.displayName?.trim() || 'self';
  return {
    ...base,
    hidden: false,
    authorId: user?.id,
    authorName: user?.displayName,
    color: resolveAuthorColor(user?.bandColor, seed),
    editableByOthers: user && userHasUsage(user, 'band') ? user.markersEditableByOthers : true,
    placeholder: base.placeholder === true ? true : undefined,
  };
}
