import { AppStack } from './AppStack';
import { LoginScreen } from '../features/auth/LoginScreen';
import { OnboardingScreen } from '../features/auth/OnboardingScreen';
import { useSessionStore } from '../store/sessionStore';
import { colors } from '../theme/colors';
import { View } from 'react-native';

/** @deprecated Auth routing lives in AppMain; this wrapper remains for older imports. */
export function RootNavigator() {
  const user = useSessionStore((s) => s.user);
  if (!user) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <LoginScreen />
      </View>
    );
  }
  if (!user.onboarded) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <OnboardingScreen />
      </View>
    );
  }
  return <AppStack />;
}
