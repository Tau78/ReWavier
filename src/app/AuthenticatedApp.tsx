import { useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { ClipExtractorHost } from '../audio/ClipExtractorHost';
import { WaveformDecoderHost } from '../audio/WaveformDecoderHost';
import { runCloudSync } from '../cloud/syncEngine';
import { GuidedTour } from '../features/help/GuidedTour';
import { WhatsNewModal } from '../features/help/WhatsNewModal';
import { flushPlaybackPersist, hydratePlaybackPersist } from '../files/playbackPersist';
import { AppStack } from '../navigation/AppStack';
import { useHelpStore } from '../store/helpStore';
import { flushLibraryPersist, waitForLibraryHydrated } from '../store/libraryStore';
import { useSessionStore } from '../store/sessionStore';

function mediaHostsShouldMount(state: AppStateStatus): boolean {
  return state !== 'background';
}

export function AuthenticatedApp() {
  const userId = useSessionStore((s) => s.user?.id ?? null);
  const whatsNewVisible = useHelpStore((s) => s.whatsNewVisible);
  const whatsNewItems = useHelpStore((s) => s.whatsNewItems);
  const dismissWhatsNew = useHelpStore((s) => s.dismissWhatsNew);
  const [mediaHostsActive, setMediaHostsActive] = useState(() =>
    mediaHostsShouldMount(AppState.currentState),
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await waitForLibraryHydrated();
      if (cancelled) {
        return;
      }
      await hydratePlaybackPersist();
      if (cancelled) {
        return;
      }
      await useHelpStore.getState().hydrate(userId);
      void runCloudSync();
    })();
    const sub = AppState.addEventListener('change', (state) => {
      setMediaHostsActive(mediaHostsShouldMount(state));
      if (state !== 'active') {
        void flushLibraryPersist();
        void flushPlaybackPersist();
        return;
      }
      void (async () => {
        await waitForLibraryHydrated();
        await hydratePlaybackPersist();
        void runCloudSync();
      })();
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [userId]);

  return (
    <>
      <AppStack />
      <GuidedTour />
      <WhatsNewModal
        visible={whatsNewVisible}
        items={whatsNewItems}
        onDismiss={dismissWhatsNew}
      />
      {mediaHostsActive ? (
        <>
          <WaveformDecoderHost />
          <ClipExtractorHost />
        </>
      ) : null}
    </>
  );
}
