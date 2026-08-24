/** Isolates library.json and new audio per signed-in account. */

let activeOwner: string | null = null;

export function ownerKeyForUser(userId: string): string {
  const key = userId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return key || 'utente';
}

export function getActiveLibraryOwner(): string | null {
  return activeOwner;
}

export function setActiveLibraryOwner(userId: string | null): void {
  activeOwner = userId ? ownerKeyForUser(userId) : null;
}

export function audioRelativePrefix(): string {
  return activeOwner ? `Audio/${activeOwner}` : 'Audio';
}

/**
 * Demo snapshots without an owner stamp are treated as leftover from another
 * login (iCloud merge used to write that person’s tracks into the review file).
 * Keep `scripts/check-library-owner.mjs` in sync with this check.
 */
export function snapshotBelongsToOwner(
  snapshotOwner: string | undefined,
  activeOwnerKey: string | null,
  requireOwnerKey: boolean,
): boolean {
  if (activeOwnerKey && snapshotOwner && snapshotOwner !== activeOwnerKey) {
    return false;
  }
  if (requireOwnerKey && snapshotOwner !== activeOwnerKey) {
    return false;
  }
  return true;
}
