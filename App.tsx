import { useEffect } from 'react';
import { AppState, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';

import { WaveformDecoderHost } from './src/audio/WaveformDecoderHost';
import { runCloudSync } from './src/cloud/syncEngine';
import { RootNavigator } from './src/navigation/RootNavigator';
import { useLibraryStore } from './src/store/libraryStore';
import { useSessionStore } from './src/store/sessionStore';
import { colors } from './src/theme/colors';

void SplashScreen.hideAsync().catch(() => undefined);

export default function App() {
  const ready = useSessionStore((s) => s.hydrated);

  useEffect(() => {
    void useSessionStore.getState().hydrate();
    void useLibraryStore.getState().hydrate();
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
