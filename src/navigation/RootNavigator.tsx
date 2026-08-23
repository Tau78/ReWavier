import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View } from 'react-native';

import { DriveFolderScreen } from '../features/cloud/DriveFolderScreen';
import { SyncReviewScreen } from '../features/cloud/SyncReviewScreen';
import { LoginScreen } from '../features/auth/LoginScreen';
import { OnboardingScreen } from '../features/auth/OnboardingScreen';
import { CollectionScreen } from '../features/library/CollectionScreen';
import { ConditionsScreen } from '../features/library/ConditionsScreen';
import { LibraryScreen } from '../features/library/LibraryScreen';
import { RecordSketchScreen } from '../features/library/RecordSketchScreen';
import { ReplaceFileScreen } from '../features/library/ReplaceFileScreen';
import { PlayerScreen } from '../features/player/PlayerScreen';
import { DiscoveryScreen } from '../features/discovery/DiscoveryScreen';
import { PrivacyScreen } from '../features/settings/PrivacyScreen';
import { SettingsScreen } from '../features/settings/SettingsScreen';
import { useSessionStore } from '../store/sessionStore';
import { StartupScreen } from '../features/splash/StartupScreen';
import { colors } from '../theme/colors';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

const theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.background,
    card: colors.background,
    primary: colors.accent,
    text: colors.text,
    border: colors.border,
  },
};

export function RootNavigator() {
  const hydrated = useSessionStore((s) => s.hydrated);
  const user = useSessionStore((s) => s.user);
  if (!hydrated) {
    return <StartupScreen />;
  }
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

  return (
    <NavigationContainer theme={theme}>
      <Stack.Navigator
        initialRouteName="Library"
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="Library" component={LibraryScreen} />
        <Stack.Screen name="Collection" component={CollectionScreen} />
        <Stack.Screen name="Conditions" component={ConditionsScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="Privacy" component={PrivacyScreen} />
        <Stack.Screen name="Discovery" component={DiscoveryScreen} />
        <Stack.Screen name="ReplaceFile" component={ReplaceFileScreen} />
        <Stack.Screen name="DriveFolder" component={DriveFolderScreen} />
        <Stack.Screen name="SyncReview" component={SyncReviewScreen} />
        <Stack.Screen name="RecordSketch" component={RecordSketchScreen} />
        <Stack.Screen name="Player" component={PlayerScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
