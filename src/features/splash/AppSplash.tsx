import Constants from 'expo-constants';
import { Image, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '../../theme/colors';

function appBuild(): string {
  const ios = Constants.platform?.ios?.buildNumber;
  if (ios) {
    return String(ios);
  }
  const native = Constants.nativeBuildVersion;
  if (native) {
    return String(native);
  }
  const extra = (Constants.expoConfig?.extra ?? {}) as { iosBuildNumber?: string };
  if (extra.iosBuildNumber) {
    return String(extra.iosBuildNumber);
  }
  if (Platform.OS === 'android') {
    const code = Constants.expoConfig?.android?.versionCode;
    if (code != null) {
      return String(code);
    }
  }
  return Constants.expoConfig?.ios?.buildNumber ?? '';
}

export function AppSplash() {
  const insets = useSafeAreaInsets();
  const build = appBuild();

  return (
    <View style={styles.root}>
      <Image
        source={require('../../../assets/splash-icon.png')}
        style={styles.icon}
        resizeMode="contain"
      />
      <Text style={[styles.build, { bottom: Math.max(insets.bottom, 16) + 8 }]}>
        {build || '—'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    width: 260,
    height: 260,
  },
  build: {
    position: 'absolute',
    alignSelf: 'center',
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
});
