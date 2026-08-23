import { useCallback, useEffect, useState } from 'react';
import { AppState, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';

import { WaveformDecoderHost } from './src/audio/WaveformDecoderHost';
import { runCloudSync } from './src/cloud/syncEngine';
import { RootNavigator } from './src/navigation/RootNavigator';
import { flushLibraryPersist, waitForLibraryHydrated } from './src/store/libraryStore';
import { useLibraryStore } from './src/store/libraryStore';
import { useSessionStore } from './src/store/sessionStore';
import { colors } from './src/theme/colors';

export default function App() {
  const [decoderReady, setDecoderReady] = useState(false);

  const hideSplash = useCallback(() => {
    void SplashScreen.hideAsync().catch(() => undefined);
  }, []);

  useEffect(() => {
    hideSplash();
    void useSessionStore.getState().hydrate().catch(() => undefined);
    void useLibraryStore.getState().hydrate().catch(() => undefined);
    const decoderTimer = setTimeout(() => setDecoderReady(true), 1500);
    return () => clearTimeout(decoderTimer);
  }, [hideSplash]);

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
      if (state === 'background' || state === 'inactive') {
        void flushLibraryPersist().catch(() => undefined);
      }
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  return (
    <GestureHandlerRootView style={styles.root} onLayout={hideSplash}>
      <SafeAreaProvider style={styles.root}>
        <RootNavigator />
        {decoderReady ? <WaveformDecoderHost /> : null}
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
