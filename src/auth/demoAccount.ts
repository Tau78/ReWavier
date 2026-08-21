/** Hardcoded App Store review login. Always accepted, no local registration. */
export const DEMO_ACCOUNT = {
  email: 'review@rewavier.app',
  password: 'Review2026!',
  displayName: 'App Review',
} as const;

export function isDemoAccount(email: string, password: string): boolean {
  return (
    email.trim().toLowerCase() === DEMO_ACCOUNT.email &&
    password === DEMO_ACCOUNT.password
  );
}
