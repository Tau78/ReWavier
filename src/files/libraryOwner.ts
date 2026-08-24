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
