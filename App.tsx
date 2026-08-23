import { useEffect } from 'react';
import { AppState, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';

import { WaveformDecoderHost } from './src/audio/WaveformDecoderHost';
import { runCloudSync } from './src/cloud/syncEngine';
import { RootNavigator } from './src/navigation/RootNavigator';
import {
  flushLibraryPersist,
  useLibraryStore,
  waitForLibraryHydrated,
} from './src/store/libraryStore';
import { useSessionStore } from './src/store/sessionStore';
import { colors } from './src/theme/colors';

void SplashScreen.hideAsync().catch(() => undefined);

const STARTUP_CAP_MS = 3000;

export default function App() {
  const ready = useSessionStore((s) => s.hydrated);

  useEffect(() => {
    const cap = setTimeout(() => {
      if (!useSessionStore.getState().hydrated) {
        useSessionStore.setState({ hydrated: true });
      }
    }, STARTUP_CAP_MS);

    void useSessionStore
      .getState()
      .hydrate()
      .catch(() => {
        useSessionStore.setState({ hydrated: true, user: null, reservedColors: [] });
      });
    void useLibraryStore.getState().hydrate().catch(() => undefined);

    return () => clearTimeout(cap);
  }, []);

  useEffect(() => {
    if (!ready) {
      return;
    }
    let cancelled = false;
    void (async () => {
      await waitForLibraryHydrated();
      if (cancelled) {
        return;
      }
      void runCloudSync();
    })();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void (async () => {
          await waitForLibraryHydrated();
          void runCloudSync();
        })();
      }
      if (state === 'background' || state === 'inactive') {
        void flushLibraryPersist().catch(() => undefined);
      }
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [ready]);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider style={styles.root}>
        {ready ? (
          <>
            <RootNavigator />
            <WaveformDecoderHost />
          </>
        ) : null}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
