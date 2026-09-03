/** Drive / iOS can hand us a name that was percent-encoded more than once.
 * Keep `scripts/check-file-names.mjs` in sync. */

export function decodeOverEncodedName(name: string): string {
  let current = name.trim();
  for (let i = 0; i < 5; i += 1) {
    try {
      const next = decodeURIComponent(current.replace(/\+/g, ' '));
      if (next === current) {
        break;
      }
      current = next;
    } catch {
      break;
    }
  }
  return current;
}

export function fileExtension(name: string): string {
  const match = decodeOverEncodedName(name).match(/(\.[a-zA-Z0-9]{2,8})$/);
  return match?.[1] ?? '';
}

/** Inbox / temp names: letters, numbers, dash. No spaces or brackets. */
export function safeTempFileName(prefix: string, id: string, originalName?: string): string {
  const ext = originalName ? fileExtension(originalName) : '';
  const safePrefix = prefix.replace(/[^a-zA-Z0-9._-]/g, '') || 'tmp';
  const safeId = id.replace(/[^a-zA-Z0-9._-]/g, '') || 'file';
  return `${safePrefix}-${safeId}${ext}`;
}

export function safeDisplayFileName(name: string): string {
  return decodeOverEncodedName(name).replace(/[/\\?%*:|"<>]/g, '-').trim() || 'traccia.m4a';
}

export function storedBasename(stored?: string): string {
  if (!stored) {
    return '';
  }
  const clean = stored.split('?')[0] ?? stored;
  const parts = clean.replace(/\/$/, '').split('/');
  return decodeOverEncodedName(parts[parts.length - 1] ?? '');
}

export function decodePathSegment(segment: string): string {
  return decodeOverEncodedName(segment);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function audioNamesEqual(left: string, right: string): boolean {
  const safeLeft = safeDisplayFileName(left);
  const safeRight = safeDisplayFileName(right);
  if (safeLeft === safeRight) {
    return true;
  }
  if (decodeOverEncodedName(left) === decodeOverEncodedName(right)) {
    return true;
  }
  return safeLeft.toLowerCase() === safeRight.toLowerCase();
}

/** Disk copy from uniqueAudioFileName: "name 2.m4a", "name 3.m4a", or "name {timestamp}.m4a". */
export function isUniqueAudioFileNameVariant(diskName: string, wantedName: string): boolean {
  const disk = safeDisplayFileName(diskName);
  const wanted = safeDisplayFileName(wantedName);
  if (!wanted || disk === wanted) {
    return false;
  }
  const ext = fileExtension(wanted);
  const base = ext ? wanted.slice(0, -ext.length) : wanted;
  if (!base) {
    return false;
  }
  const diskExt = fileExtension(disk);
  if (diskExt.toLowerCase() !== ext.toLowerCase()) {
    return false;
  }
  const diskBase = diskExt ? disk.slice(0, -diskExt.length) : disk;
  return new RegExp(`^${escapeRegExp(base)} [0-9]+$`).test(diskBase);
}

export function audioFileMatchesTrackId(diskName: string, trackId: string): boolean {
  if (!trackId) {
    return false;
  }
  const decoded = decodeOverEncodedName(diskName);
  const safe = safeDisplayFileName(decoded);
  const id = trackId.replace(/[^a-zA-Z0-9._-]/g, '') || trackId;
  const prefixes = [`${trackId}-`, `${id}-`, `sync-${id}`, `dl-${id}`];
  return prefixes.some((prefix) => decoded.startsWith(prefix) || safe.startsWith(prefix));
}

export function pickRecoveredAudioName(
  names: string[],
  track: { id: string; sourceFileName?: string; fileUri?: string; inboxUri?: string },
): string | undefined {
  const idHits = names.filter((name) => audioFileMatchesTrackId(name, track.id));
  if (idHits.length === 1) {
    return idHits[0];
  }
  if (idHits.length > 1) {
    const wanted = track.sourceFileName;
    if (!wanted) {
      return undefined;
    }
    const named = idHits.filter(
      (name) => audioNamesEqual(name, wanted) || isUniqueAudioFileNameVariant(name, wanted),
    );
    return named.length === 1 ? named[0] : undefined;
  }

  const storedHints = [storedBasename(track.fileUri), storedBasename(track.inboxUri)].filter(Boolean);
  const storedHits = names.filter((name) => storedHints.some((hint) => audioNamesEqual(name, hint)));
  if (storedHits.length === 1) {
    return storedHits[0];
  }
  if (storedHits.length > 1) {
    return undefined;
  }

  const wanted = track.sourceFileName;
  if (!wanted) {
    return undefined;
  }

  const exact = names.filter((name) => audioNamesEqual(name, wanted));
  if (exact.length === 1) {
    return exact[0];
  }
  if (exact.length > 1) {
    return undefined;
  }

  const variants = names.filter((name) => isUniqueAudioFileNameVariant(name, wanted));
  return variants.length === 1 ? variants[0] : undefined;
}
