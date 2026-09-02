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
