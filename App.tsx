import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';

import { WaveformDecoderHost } from './src/audio/WaveformDecoderHost';
import { runCloudSync } from './src/cloud/syncEngine';
import { RootNavigator } from './src/navigation/RootNavigator';
import { useLibraryStore } from './src/store/libraryStore';
import { useSessionStore } from './src/store/sessionStore';
import { colors } from './src/theme/colors';

void SplashScreen.preventAutoHideAsync();

export default function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      useLibraryStore.getState().hydrate(),
      useSessionStore.getState().hydrate(),
    ])
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) {
          setReady(true);
          void SplashScreen.hideAsync();
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

  if (!ready) {
    return null;
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider style={styles.root}>
        <RootNavigator />
        <WaveformDecoderHost />
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
