import { Text, View, StyleSheet } from 'react-native';
import { BottomTabBar, createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HomeScreen } from '../features/home/HomeScreen';
import { LibraryScreen } from '../features/library/LibraryScreen';
import { SearchScreen } from '../features/search/SearchScreen';
import { SettingsScreen } from '../features/settings/SettingsScreen';
import { MiniPlayer } from '../features/shell/MiniPlayer';
import { colors } from '../theme/colors';
import type { MainTabParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();

const ICONS = {
  Home: '⌂',
  Libreria: '▤',
  Cerca: '⌕',
  Impostazioni: '⚙',
} as const;

function TabBarWithMiniPlayer(props: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.chrome}>
      <MiniPlayer />
      <BottomTabBar {...props} insets={insets} />
    </View>
  );
}

function TabIcon({ name, color }: { name: keyof typeof ICONS; color: string }) {
  return (
    <Text style={[styles.icon, { color }]} accessibilityElementsHidden>
      {ICONS[name]}
    </Text>
  );
}

export function MainTabs() {
  return (
    <Tab.Navigator
      initialRouteName="Home"
      backBehavior="none"
      tabBar={(props) => <TabBarWithMiniPlayer {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: styles.label,
        tabBarStyle: styles.bar,
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <TabIcon name="Home" color={color} />,
        }}
      />
      <Tab.Screen
        name="Libreria"
        component={LibraryScreen}
        options={{
          title: 'Libreria',
          tabBarIcon: ({ color }) => <TabIcon name="Libreria" color={color} />,
        }}
      />
      <Tab.Screen
        name="Cerca"
        component={SearchScreen}
        options={{
          title: 'Cerca',
          tabBarIcon: ({ color }) => <TabIcon name="Cerca" color={color} />,
        }}
      />
      <Tab.Screen
        name="Impostazioni"
        component={SettingsScreen}
        options={{
          title: 'Impostazioni',
          tabBarIcon: ({ color }) => <TabIcon name="Impostazioni" color={color} />,
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  chrome: {
    backgroundColor: colors.background,
  },
  bar: {
    backgroundColor: colors.background,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
  },
  icon: {
    fontSize: 18,
    lineHeight: 22,
  },
});
