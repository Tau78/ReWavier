import { lazy, Suspense, useCallback, useEffect } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';

import { LoginScreen } from '../features/auth/LoginScreen';
import { OnboardingScreen } from '../features/auth/OnboardingScreen';
import { StartupScreen } from '../features/splash/StartupScreen';
import { flushLibraryPersist, useLibraryStore } from '../store/libraryStore';
import { useSessionStore } from '../store/sessionStore';
import { colors } from '../theme/colors';

const AuthenticatedApp = lazy(() =>
  import('./AuthenticatedApp').then((mod) => ({ default: mod.AuthenticatedApp })),
);

export default function AppMain() {
  const user = useSessionStore((s) => s.user);

  const hideSplash = useCallback(() => {
    void SplashScreen.hideAsync().catch(() => undefined);
  }, []);

  useEffect(() => {
    hideSplash();
    void useSessionStore.getState().hydrate().catch(() => undefined);
    void useLibraryStore.getState().hydrate().catch(() => undefined);
  }, [hideSplash]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        void flushLibraryPersist().catch(() => undefined);
      }
    });
    return () => sub.remove();
  }, []);

  return (
    <GestureHandlerRootView style={styles.root} onLayout={hideSplash}>
      <SafeAreaProvider style={styles.root}>
        {!user ? (
          <LoginScreen />
        ) : !user.onboarded ? (
          <OnboardingScreen />
        ) : (
          <Suspense
            fallback={
              <View style={styles.root}>
                <StartupScreen />
              </View>
            }
          >
            <AuthenticatedApp />
          </Suspense>
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
