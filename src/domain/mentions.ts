import { slugFromName } from './session';

const HANDLE_RE = /@([a-zA-Z0-9_]{1,24})/g;

/** Handles in note text, lowercase, unique, order of appearance. */
export function extractMentionHandles(text: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  HANDLE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = HANDLE_RE.exec(text)) != null) {
    const handle = (match[1] ?? '').toLowerCase();
    if (!handle || seen.has(handle)) {
      continue;
    }
    seen.add(handle);
    found.push(handle);
  }
  return found;
}

/** True if `handle` refers to this person (exact slug or unique prefix). */
export function handleMatchesPerson(
  handle: string,
  person: { handle: string; name: string },
): boolean {
  const needle = handle.trim().toLowerCase();
  if (!needle) {
    return false;
  }
  const slug = person.handle.trim().toLowerCase() || slugFromName(person.name);
  if (!slug) {
    return false;
  }
  return slug === needle || slug.startsWith(needle);
}

/**
 * Incomplete @query at the end of text (or before cursor).
 * Returns start index of `@` and the typed query without `@`.
 */
export function activeMentionQuery(
  text: string,
  cursor = text.length,
): { start: number; query: string } | null {
  const before = text.slice(0, Math.max(0, Math.min(cursor, text.length)));
  const at = before.lastIndexOf('@');
  if (at < 0) {
    return null;
  }
  if (at > 0) {
    const prev = before[at - 1];
    if (prev && /[a-zA-Z0-9_]/.test(prev)) {
      return null;
    }
  }
  const query = before.slice(at + 1);
  if (/\s/.test(query)) {
    return null;
  }
  if (query.length > 24) {
    return null;
  }
  return { start: at, query };
}

/** Replace `@query` with `@handle ` keeping the rest of the draft. */
export function insertMentionAt(
  text: string,
  start: number,
  query: string,
  handle: string,
): string {
  const clean = handle.replace(/^@/, '').trim();
  if (!clean) {
    return text;
  }
  const end = start + 1 + query.length;
  const before = text.slice(0, start);
  const after = text.slice(end);
  const needsSpace = after.length === 0 || !/^\s/.test(after);
  return `${before}@${clean}${needsSpace ? ' ' : ''}${after}`;
}

export function filtersMentionCandidates<T extends { handle: string; name: string }>(
  people: T[],
  query: string,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return people.slice(0, 8);
  }
  return people
    .filter((person) => handleMatchesPerson(q, person) || person.name.toLowerCase().includes(q))
    .slice(0, 8);
}
