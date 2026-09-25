import { useEffect } from 'react';
import { AppState } from 'react-native';

import { ClipExtractorHost } from '../audio/ClipExtractorHost';
import { WaveformDecoderHost } from '../audio/WaveformDecoderHost';
import { runCloudSync } from '../cloud/syncEngine';
import { GuidedTour } from '../features/help/GuidedTour';
import { WhatsNewModal } from '../features/help/WhatsNewModal';
import { flushPlaybackPersist, hydratePlaybackPersist } from '../files/playbackPersist';
import { AppStack } from '../navigation/AppStack';
import { useHelpStore } from '../store/helpStore';
import {
  recoverLibraryFromDiskIfWeaker,
  scheduleLibraryPersistFlush,
  waitForLibraryHydrated,
} from '../store/libraryStore';
import {
  installNotificationListeners,
  isOsNotificationsAvailable,
  readInitialNotificationResponse,
  requestPushPermission,
} from '../notifications/pushNotifications';
import { flushNotifications, useNotificationStore } from '../store/notificationStore';
import { useSessionStore } from '../store/sessionStore';

export function AuthenticatedApp() {
  const userId = useSessionStore((s) => s.user?.id ?? null);
  const whatsNewVisible = useHelpStore((s) => s.whatsNewVisible);
  const whatsNewItems = useHelpStore((s) => s.whatsNewItems);
  const dismissWhatsNew = useHelpStore((s) => s.dismissWhatsNew);

  useEffect(() => {
    let cancelled = false;
    let removeNotificationListeners: (() => void) | undefined;
    void (async () => {
      await waitForLibraryHydrated();
      if (cancelled) {
        return;
      }
      await hydratePlaybackPersist();
      if (cancelled) {
        return;
      }
      await useNotificationStore.getState().hydrate();
      if (cancelled) {
        return;
      }
      if (isOsNotificationsAvailable()) {
        removeNotificationListeners = await installNotificationListeners();
        if (cancelled) {
          removeNotificationListeners();
          return;
        }
        if (useNotificationStore.getState().prefs.osEnabled) {
          await requestPushPermission();
          await useNotificationStore.getState().refreshPushToken();
        }
        await readInitialNotificationResponse();
      }
      await useHelpStore.getState().hydrate(userId);
      void runCloudSync();
    })();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        scheduleLibraryPersistFlush();
        void flushPlaybackPersist();
        void flushNotifications();
        return;
      }
      if (state !== 'active') {
        return;
      }
      void (async () => {
        await waitForLibraryHydrated();
        await recoverLibraryFromDiskIfWeaker();
        await hydratePlaybackPersist();
        await useNotificationStore.getState().hydrate();
        if (
          isOsNotificationsAvailable() &&
          useNotificationStore.getState().prefs.osEnabled
        ) {
          await useNotificationStore.getState().refreshPushToken();
        }
        void runCloudSync();
      })();
    });
    const blurSub = AppState.addEventListener('blur', () => {
      scheduleLibraryPersistFlush();
      void flushPlaybackPersist();
      void flushNotifications();
    });
    return () => {
      cancelled = true;
      sub.remove();
      blurSub.remove();
      removeNotificationListeners?.();
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
      <WaveformDecoderHost />
      <ClipExtractorHost />
    </>
  );
}
