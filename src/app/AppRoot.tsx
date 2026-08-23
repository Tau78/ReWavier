import { useEffect } from 'react';
import { AppState } from 'react-native';

import { WaveformDecoderHost } from '../audio/WaveformDecoderHost';
import { runCloudSync } from '../cloud/syncEngine';
import { RootNavigator } from '../navigation/RootNavigator';
import { useLibraryStore } from '../store/libraryStore';
import { useSessionStore } from '../store/sessionStore';

export default function AppRoot() {
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

  if (!ready) {
    return null;
  }

  return (
    <>
      <RootNavigator />
      <WaveformDecoderHost />
    </>
  );
}
