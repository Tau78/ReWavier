import { colors } from '../theme/colors';
import { canWriteWithRole, type FolderRole } from './folderRole';
import type { Marker } from './models';
import { userHasUsage, type SessionUser } from './session';

export function normalizeMarker(raw: Partial<Marker> & Pick<Marker, 'id' | 'timestampMs'>): Marker {
  return {
    id: raw.id,
    timestampMs: raw.timestampMs,
    text: raw.text ?? '',
    createdAt: raw.createdAt ?? Date.now(),
    updatedAt: raw.updatedAt ?? raw.createdAt ?? Date.now(),
    hidden: raw.hidden === true,
    authorId: raw.authorId,
    authorName: raw.authorName,
    color: raw.color,
    editableByOthers: raw.editableByOthers,
    placeholder: raw.placeholder === true ? true : undefined,
  };
}

export function markerColor(marker: Marker): string {
  return marker.color || colors.marker;
}

export function isMarkerHidden(marker: Marker): boolean {
  return marker.hidden === true;
}

export function visibleMarkers(markers: Marker[]): Marker[] {
  return markers.filter((marker) => !isMarkerHidden(marker));
}

export function markerAuthorLabel(marker: Marker): string {
  const name = marker.authorName?.trim();
  return name || 'Tu';
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
  return {
    ...base,
    hidden: false,
    authorId: user?.id,
    authorName: user?.displayName,
    color: user?.bandColor ?? colors.marker,
    editableByOthers: user && userHasUsage(user, 'band') ? user.markersEditableByOthers : true,
    placeholder: base.placeholder === true ? true : undefined,
  };
}
