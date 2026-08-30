import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { DriveFolderScreen } from '../features/cloud/DriveFolderScreen';
import { SyncReviewScreen } from '../features/cloud/SyncReviewScreen';
import { CollectionScreen } from '../features/library/CollectionScreen';
import { LessonRecapScreen } from '../features/library/LessonRecapScreen';
import { NoteHeatScreen } from '../features/library/NoteHeatScreen';
import { ConditionsScreen } from '../features/library/ConditionsScreen';
import { RecordSketchScreen } from '../features/library/RecordSketchScreen';
import { ReplaceFileScreen } from '../features/library/ReplaceFileScreen';
import { PlayerScreen } from '../features/player/PlayerScreen';
import { DiscoveryScreen } from '../features/discovery/DiscoveryScreen';
import { PrivacyScreen } from '../features/settings/PrivacyScreen';
import { SettingsScreen } from '../features/settings/SettingsScreen';
import { colors } from '../theme/colors';
import { MainTabs } from './MainTabs';
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

export function AppStack() {
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
        <Stack.Screen name="Library" component={MainTabs} />
        <Stack.Screen name="Collection" component={CollectionScreen} />
        <Stack.Screen name="Conditions" component={ConditionsScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="Privacy" component={PrivacyScreen} />
        <Stack.Screen name="Discovery" component={DiscoveryScreen} />
        <Stack.Screen name="ReplaceFile" component={ReplaceFileScreen} />
        <Stack.Screen name="DriveFolder" component={DriveFolderScreen} />
        <Stack.Screen name="SyncReview" component={SyncReviewScreen} />
        <Stack.Screen name="RecordSketch" component={RecordSketchScreen} />
        <Stack.Screen name="LessonRecap" component={LessonRecapScreen} />
        <Stack.Screen name="NoteHeat" component={NoteHeatScreen} />
        <Stack.Screen name="Player" component={PlayerScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
