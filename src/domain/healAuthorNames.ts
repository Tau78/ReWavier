import type { Album } from './library';
import type { Marker } from './models';
import {
  looksLikeAuthorId,
  memberHandleFromName,
  normalizeDisplayName,
  preferDisplayName,
} from './displayNames';
import { slugFromName } from './session';

type AuthorProfile = {
  authorId?: string;
  name: string;
};

function pickCanonicalMemberKey(
  keys: string[],
  names: Record<string, string>,
  emails: Record<string, string>,
): string {
  const scored = keys.map((key) => {
    const name = names[key] ?? key;
    let score = 0;
    if (looksLikeAuthorId(key)) {
      score += 100;
    }
    if (emails[key]?.trim()) {
      score += 50;
    }
    if (!hasBadName(name)) {
      score += 20;
    }
    score += normalizeDisplayName(name).length;
    return { key, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.key ?? keys[0]!;
}

function hasBadName(name: string): boolean {
  return /(?:Ã|Â|ï¿½)/.test(name);
}

function healAlbumMemberMaps(album: Album): { album: Album; changed: boolean } {
  let changed = false;
  const names: Record<string, string> = { ...(album.memberNames ?? {}) };
  const emails: Record<string, string> = { ...(album.memberEmails ?? {}) };
  const colors: Record<string, string> = { ...(album.memberColors ?? {}) };

  for (const [key, raw] of Object.entries(names)) {
    const fixed = normalizeDisplayName(raw);
    if (fixed && fixed !== raw) {
      names[key] = fixed;
      changed = true;
    }
  }

  const allKeys = new Set([...Object.keys(names), ...Object.keys(emails), ...Object.keys(colors)]);
  const byHandle = new Map<string, string[]>();
  for (const key of allKeys) {
    const handle = memberHandleFromName(names[key] ?? key);
    if (!handle) {
      continue;
    }
    const bucket = byHandle.get(handle) ?? [];
    bucket.push(key);
    byHandle.set(handle, bucket);
  }

  for (const keys of byHandle.values()) {
    if (keys.length <= 1) {
      continue;
    }
    const canonical = pickCanonicalMemberKey(keys, names, emails);
    for (const key of keys) {
      if (key === canonical) {
        continue;
      }
      const mergedName = preferDisplayName(names[canonical] ?? '', names[key] ?? key);
      if (mergedName && mergedName !== names[canonical]) {
        names[canonical] = mergedName;
      }
      if (emails[key] && !emails[canonical]) {
        emails[canonical] = emails[key];
      }
      if (colors[key] && !colors[canonical]) {
        colors[canonical] = colors[key];
      }
      delete names[key];
      delete emails[key];
      delete colors[key];
      changed = true;
    }
  }

  if (!changed) {
    return { album, changed: false };
  }
  return {
    album: {
      ...album,
      memberNames: Object.keys(names).length > 0 ? names : undefined,
      memberEmails: Object.keys(emails).length > 0 ? emails : undefined,
      memberColors: Object.keys(colors).length > 0 ? colors : undefined,
    },
    changed: true,
  };
}

function registerProfile(
  map: Map<string, AuthorProfile>,
  handle: string,
  profile: AuthorProfile,
): void {
  if (!handle) {
    return;
  }
  const existing = map.get(handle);
  if (!existing) {
    map.set(handle, profile);
    return;
  }
  const name = preferDisplayName(existing.name, profile.name);
  const authorId =
    (profile.authorId && looksLikeAuthorId(profile.authorId) ? profile.authorId : undefined) ||
    (existing.authorId && looksLikeAuthorId(existing.authorId) ? existing.authorId : undefined);
  map.set(handle, { name, authorId });
}

function buildGlobalProfiles(
  markersByTrackId: Record<string, Marker[]>,
  albums: Album[],
): Map<string, AuthorProfile> {
  const profiles = new Map<string, AuthorProfile>();
  for (const markers of Object.values(markersByTrackId)) {
    for (const marker of markers) {
      const name = normalizeDisplayName(marker.authorName ?? '');
      if (!name) {
        continue;
      }
      const handle = memberHandleFromName(name);
      registerProfile(profiles, handle, {
        authorId: marker.authorId?.trim(),
        name,
      });
    }
  }
  for (const album of albums) {
    for (const [key, raw] of Object.entries(album.memberNames ?? {})) {
      const name = normalizeDisplayName(raw);
      if (!name) {
        continue;
      }
      registerProfile(profiles, memberHandleFromName(name), {
        authorId: looksLikeAuthorId(key) ? key : undefined,
        name,
      });
    }
  }
  return profiles;
}

function healMarker(marker: Marker, profiles: Map<string, AuthorProfile>): { marker: Marker; changed: boolean } {
  let changed = false;
  let authorName = marker.authorName;
  let authorId = marker.authorId?.trim();

  if (authorName) {
    const fixed = normalizeDisplayName(authorName);
    if (fixed !== authorName) {
      authorName = fixed;
      changed = true;
    }
  }

  const handle = authorName ? memberHandleFromName(authorName) : '';
  const profile = handle ? profiles.get(handle) : undefined;
  if (profile) {
    const canonicalName = preferDisplayName(profile.name, authorName ?? '');
    if (canonicalName && canonicalName !== authorName) {
      authorName = canonicalName;
      changed = true;
    }
    if (!authorId && profile.authorId) {
      authorId = profile.authorId;
      changed = true;
    }
  }

  if (!changed) {
    return { marker, changed: false };
  }
  return {
    marker: {
      ...marker,
      authorName: authorName || undefined,
      authorId: authorId || undefined,
    },
    changed: true,
  };
}

export function healLibraryAuthorData(snapshot: {
  albums: Album[];
  markersByTrackId: Record<string, Marker[]>;
}): {
  albums: Album[];
  markersByTrackId: Record<string, Marker[]>;
  changed: boolean;
} {
  let changed = false;

  const markersPass1: Record<string, Marker[]> = {};
  for (const [trackId, markers] of Object.entries(snapshot.markersByTrackId)) {
    markersPass1[trackId] = markers.map((marker) => {
      if (!marker.authorName) {
        return marker;
      }
      const fixed = normalizeDisplayName(marker.authorName);
      if (fixed === marker.authorName) {
        return marker;
      }
      changed = true;
      return { ...marker, authorName: fixed };
    });
  }

  const albumsPass1 = snapshot.albums.map((album) => {
    const healed = healAlbumMemberMaps(album);
    if (healed.changed) {
      changed = true;
    }
    return healed.album;
  });

  const profiles = buildGlobalProfiles(markersPass1, albumsPass1);
  const markersByTrackId: Record<string, Marker[]> = {};
  for (const [trackId, markers] of Object.entries(markersPass1)) {
    const next = markers.map((marker) => {
      const healed = healMarker(marker, profiles);
      if (healed.changed) {
        changed = true;
      }
      return healed.marker;
    });
    markersByTrackId[trackId] = next;
  }

  const albums = albumsPass1.map((album) => {
    const remappedColors = { ...(album.memberColors ?? {}) };
    const remappedNames = { ...(album.memberNames ?? {}) };
    const remappedEmails = { ...(album.memberEmails ?? {}) };
    let albumChanged = false;

    for (const [key, rawName] of Object.entries(remappedNames)) {
      const handle = memberHandleFromName(rawName);
      const profile = profiles.get(handle);
      if (!profile) {
        continue;
      }
      const canonicalName = preferDisplayName(profile.name, rawName);
      if (canonicalName !== rawName) {
        remappedNames[key] = canonicalName;
        albumChanged = true;
      }
      if (!looksLikeAuthorId(key) && profile.authorId && profile.authorId !== key) {
        const target = profile.authorId;
        remappedNames[target] = preferDisplayName(remappedNames[target] ?? '', canonicalName);
        if (remappedEmails[key] && !remappedEmails[target]) {
          remappedEmails[target] = remappedEmails[key];
        }
        if (remappedColors[key] && !remappedColors[target]) {
          remappedColors[target] = remappedColors[key];
        }
        delete remappedNames[key];
        delete remappedEmails[key];
        delete remappedColors[key];
        albumChanged = true;
      }
    }

    if (!albumChanged) {
      return album;
    }
    changed = true;
    return {
      ...album,
      memberNames: Object.keys(remappedNames).length > 0 ? remappedNames : undefined,
      memberEmails: Object.keys(remappedEmails).length > 0 ? remappedEmails : undefined,
      memberColors: Object.keys(remappedColors).length > 0 ? remappedColors : undefined,
    };
  });

  return { albums, markersByTrackId, changed };
}

/** Resolve mention handle → stable author id when known in this album. */
export function authorIdForHandle(
  handle: string,
  album: Album | undefined,
  markersByTrackId: Record<string, Marker[]>,
): string | undefined {
  const needle = handle.trim().toLowerCase();
  if (!needle) {
    return undefined;
  }
  for (const key of Object.keys(album?.memberNames ?? {})) {
    if (looksLikeAuthorId(key)) {
      const name = album?.memberNames?.[key] ?? '';
      if (memberHandleFromName(name) === needle || slugFromName(name) === needle) {
        return key;
      }
    }
  }
  for (const markers of Object.values(markersByTrackId)) {
    for (const marker of markers) {
      const id = marker.authorId?.trim();
      const name = normalizeDisplayName(marker.authorName ?? '');
      if (!id || !name) {
        continue;
      }
      if (memberHandleFromName(name) === needle || slugFromName(name) === needle) {
        return id;
      }
    }
  }
  return undefined;
}
