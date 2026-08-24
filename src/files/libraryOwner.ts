/** Isolates the App Review login from the shared library on this phone. */

export const DEMO_LIBRARY_OWNER = 'user-app-review';

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

export function usesPrivateLibrary(owner = activeOwner): boolean {
  return owner === DEMO_LIBRARY_OWNER;
}

/**
 * Demo snapshots without an owner stamp are leftover from another login.
 * Keep `scripts/check-library-owner.mjs` in sync.
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
