import { lazy, Suspense, useCallback, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { hideNativeSplash } from './src/app/hideSplash';
import { StartupErrorBoundary } from './src/app/StartupErrorBoundary';
import { colors } from './src/theme/colors';

const AppRoot = lazy(() => import('./src/app/AppRoot'));

export default function App() {
  useEffect(() => {
    hideNativeSplash();
    const retry = setTimeout(hideNativeSplash, 100);
    const retry2 = setTimeout(hideNativeSplash, 500);
    return () => {
      clearTimeout(retry);
      clearTimeout(retry2);
    };
  }, []);

  const onRootLayout = useCallback(() => {
    hideNativeSplash();
  }, []);

  return (
    <GestureHandlerRootView style={styles.root} onLayout={onRootLayout}>
      <SafeAreaProvider style={styles.root}>
        <StartupErrorBoundary>
          <Suspense fallback={<View style={styles.root} />}>
            <AppRoot />
          </Suspense>
        </StartupErrorBoundary>
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
