import { requireOptionalNativeModule } from 'expo-modules-core';

const native = requireOptionalNativeModule<{ isCaptured: () => boolean }>('ScreenCaptured');

/** True only while iOS is recording or mirroring the screen (ReplayKit / Control Center). */
export function isScreenCaptured(): boolean {
  try {
    return native?.isCaptured() === true;
  } catch {
    return false;
  }
}

/** In-app sketch failed while the phone is already capturing the screen with the mic. */
export function shouldExplainScreenMicConflict(screenCaptured: boolean, startFailed: boolean): boolean {
  return screenCaptured && startFailed;
}
