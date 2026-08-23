import { useEffect } from 'react';
import { AppState } from 'react-native';

import { ClipExtractorHost } from '../audio/ClipExtractorHost';
import { WaveformDecoderHost } from '../audio/WaveformDecoderHost';
import { runCloudSync } from '../cloud/syncEngine';
import { AppStack } from '../navigation/AppStack';
import { waitForLibraryHydrated } from '../store/libraryStore';

export function AuthenticatedApp() {
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await waitForLibraryHydrated();
      if (!cancelled) {
        void runCloudSync();
      }
    })();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void (async () => {
          await waitForLibraryHydrated();
          void runCloudSync();
        })();
      }
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  return (
    <>
      <AppStack />
      <WaveformDecoderHost />
      <ClipExtractorHost />
    </>
  );
}
