import { lazy, Suspense, useEffect } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LoginScreen } from './src/features/auth/LoginScreen';
import { OnboardingScreen } from './src/features/auth/OnboardingScreen';
import { StartupScreen } from './src/features/splash/StartupScreen';
import { flushLibraryPersist, useLibraryStore } from './src/store/libraryStore';
import { useSessionStore } from './src/store/sessionStore';
import { colors } from './src/theme/colors';

const AuthenticatedApp = lazy(() =>
  import('./src/app/AuthenticatedApp').then((mod) => ({ default: mod.AuthenticatedApp })),
);

export default function App() {
  const user = useSessionStore((s) => s.user);

  useEffect(() => {
    void useSessionStore.getState().hydrate().catch(() => undefined);
    void useLibraryStore.getState().hydrate().catch(() => undefined);
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        void flushLibraryPersist().catch(() => undefined);
      }
    });
    return () => sub.remove();
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
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
