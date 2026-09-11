import * as Updates from 'expo-updates';

/** Download a published OTA and reload. Login stays on screen until the new bundle is ready. */
export async function applyExpoUpdateIfReady(): Promise<void> {
  try {
    if (!Updates.isEnabled) {
      return;
    }
    const check = await Updates.checkForUpdateAsync();
    if (!check.isAvailable) {
      return;
    }
    const fetched = await Updates.fetchUpdateAsync();
    if (fetched.isNew) {
      await Updates.reloadAsync();
    }
  } catch {
    // Stay on the bundle already on the phone.
  }
}
