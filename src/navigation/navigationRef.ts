import { createNavigationContainerRef } from '@react-navigation/native';

import type { RootStackParamList } from './types';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

export function navigateWhenReady<RouteName extends keyof RootStackParamList>(
  name: RouteName,
  params?: RootStackParamList[RouteName],
): void {
  const run = () => {
    if (navigationRef.isReady()) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (navigationRef.navigate as (screen: RouteName, p?: RootStackParamList[RouteName]) => void)(
        name,
        params,
      );
    }
  };
  if (navigationRef.isReady()) {
    run();
    return;
  }
  const timer = setInterval(() => {
    if (navigationRef.isReady()) {
      clearInterval(timer);
      run();
    }
  }, 50);
  setTimeout(() => clearInterval(timer), 8000);
}
