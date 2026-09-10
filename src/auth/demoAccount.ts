/** App Store review login. Password from env — never commit the real value. */
export const DEMO_ACCOUNT = {
  email: 'review@rewavier.app',
  password: (process.env.EXPO_PUBLIC_REVIEW_DEMO_PASSWORD ?? '').trim(),
  displayName: 'App Review',
} as const;

export function isDemoAccount(email: string, password: string): boolean {
  if (!DEMO_ACCOUNT.password) {
    return false;
  }
  return (
    email.trim().toLowerCase() === DEMO_ACCOUNT.email &&
    password === DEMO_ACCOUNT.password
  );
}

export function isDemoUser(user: { id?: string; email?: string } | null | undefined): boolean {
  if (!user) {
    return false;
  }
  return (
    user.id === 'user-app-review' ||
    user.email?.trim().toLowerCase() === DEMO_ACCOUNT.email
  );
}

/** Review account stays on this phone only. Never mix iCloud or Drive. */
export function shouldSkipCloudSync(
  user: { id?: string; email?: string } | null | undefined,
): boolean {
  return !user || isDemoUser(user);
}
