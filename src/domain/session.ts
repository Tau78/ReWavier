export type AuthProvider = 'email' | 'apple' | 'google';

export type UsageType = 'band' | 'creator' | 'teacher' | 'business';

export type DriveLink = 'google' | 'files' | null;

export type UserBand = {
  id: string;
  name: string;
  color: string;
};

export type SessionUser = {
  id: string;
  email: string;
  displayName: string;
  authorSlug: string;
  provider: AuthProvider;
  onboarded: boolean;
  usageType: UsageType | null;
  usageTypes: UsageType[];
  driveConnected: boolean;
  driveLink: DriveLink;
  bands: UserBand[];
  activeBandId: string | null;
  bandColor: string | null;
  markersEditableByOthers: boolean;
};

const USAGE_PRIORITY: UsageType[] = ['band', 'teacher', 'creator', 'business'];

export function userUsages(user: Pick<SessionUser, 'usageType' | 'usageTypes'> | null | undefined): UsageType[] {
  if (!user) {
    return [];
  }
  if (user.usageTypes?.length) {
    return user.usageTypes;
  }
  return user.usageType ? [user.usageType] : [];
}

export function userHasUsage(
  user: Pick<SessionUser, 'usageType' | 'usageTypes'> | null | undefined,
  type: UsageType,
): boolean {
  return userUsages(user).includes(type);
}

export function primaryUsage(types: UsageType[]): UsageType | null {
  if (types.length === 0) {
    return null;
  }
  return USAGE_PRIORITY.find((item) => types.includes(item)) ?? types[0];
}

export function normalizeSessionUser(user: SessionUser): SessionUser {
  const usageTypes = userUsages(user);
  let bands = Array.isArray(user.bands) ? user.bands.filter((band) => band.name.trim()) : [];
  if (bands.length === 0 && user.bandColor) {
    bands = [{ id: 'band-legacy', name: 'La mia band', color: user.bandColor }];
  }
  const activeBandId =
    user.activeBandId && bands.some((band) => band.id === user.activeBandId)
      ? user.activeBandId
      : bands[0]?.id ?? null;
  const active = bands.find((band) => band.id === activeBandId);
  return {
    ...user,
    usageTypes,
    usageType: primaryUsage(usageTypes),
    bands,
    activeBandId,
    bandColor: active?.color ?? user.bandColor ?? null,
  };
}

export function slugFromName(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/@.*$/, '')
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 24);
  return slug || 'membro';
}
