import { requireOptionalNativeModule } from 'expo-modules-core';

let availabilityCache: boolean | null = null;

/**
 * Native notification modules linked in this binary.
 * OTA JS alone is not enough — and must not import the notifications package
 * (that package requires native modules at load time).
 */
export function isOsNotificationsAvailable(): boolean {
  if (availabilityCache != null) {
    return availabilityCache;
  }
  try {
    const permissions = requireOptionalNativeModule('ExpoNotificationPermissionsModule');
    const scheduler = requireOptionalNativeModule('ExpoNotificationScheduler');
    availabilityCache =
      permissions != null &&
      typeof permissions.getPermissionsAsync === 'function' &&
      scheduler != null &&
      typeof scheduler.scheduleNotificationAsync === 'function';
  } catch {
    availabilityCache = false;
  }
  return availabilityCache;
}

/** After a failed dynamic import, treat OS notifications as unavailable. */
export function markOsNotificationsUnavailable(): void {
  availabilityCache = false;
}
