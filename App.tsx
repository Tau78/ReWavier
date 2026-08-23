import { useEffect, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';

import { WaveformDecoderHost } from './src/audio/WaveformDecoderHost';
import { runCloudSync } from './src/cloud/syncEngine';
import { AppSplash } from './src/features/splash/AppSplash';
import { RootNavigator } from './src/navigation/RootNavigator';
import { useLibraryStore } from './src/store/libraryStore';
import { useSessionStore } from './src/store/sessionStore';
import { colors } from './src/theme/colors';

void SplashScreen.preventAutoHideAsync();

const MIN_SPLASH_MS = 700;
const STARTUP_CAP_MS = 2500;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export default function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void SplashScreen.hideAsync();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const hydrates = Promise.all([
      useLibraryStore.getState().hydrate(),
      useSessionStore.getState().hydrate(),
    ]).catch(() => undefined);

    void Promise.all([
      wait(MIN_SPLASH_MS),
      Promise.race([hydrates, wait(STARTUP_CAP_MS)]),
    ]).finally(() => {
      if (!cancelled) {
        setReady(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready) {
      return;
    }
    void runCloudSync();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void runCloudSync();
      }
    });
    return () => sub.remove();
  }, [ready]);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider style={styles.root}>
        {ready ? (
          <>
            <RootNavigator />
            <WaveformDecoderHost />
          </>
        ) : (
          <View style={styles.root}>
            <AppSplash />
          </View>
        )}
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
