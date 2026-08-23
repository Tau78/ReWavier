import * as SplashScreen from 'expo-splash-screen';

let hidden = false;

/** Chiude lo splash nativo iOS. Sicuro da chiamare più volte. */
export function hideNativeSplash(): void {
  if (hidden) {
    return;
  }
  hidden = true;
  void SplashScreen.hideAsync().catch(() => {
    hidden = false;
  });
}
