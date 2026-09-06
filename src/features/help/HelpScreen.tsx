import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as WebBrowser from 'expo-web-browser';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FAQ_URL } from '../../legal/urls';
import type { RootStackParamList } from '../../navigation/types';
import { useHelpStore } from '../../store/helpStore';
import { colors, DeepBackdrop, layout } from '../../theme';
import { KindRow } from '../../theme/graphics';
import { GUIDE_SECTIONS } from './tourCopy';

export function HelpScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'Help'>>();
  const startTour = useHelpStore((s) => s.startTour);

  const replay = () => {
    startTour();
    navigation.navigate('Home');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <DeepBackdrop />
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={layout.hitSlop}
          accessibilityRole="button"
          accessibilityLabel="Indietro"
        >
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <View>
          <KindRow label="Aiuto" />
          <Text style={styles.title}>Guida</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {GUIDE_SECTIONS.map((section) => (
          <View key={section.id} style={styles.card}>
            <Text style={styles.rowLabel}>{section.title}</Text>
            <Text style={styles.rowValue}>{section.body}</Text>
            {section.image ? (
              <Image
                source={section.image}
                style={styles.shot}
                resizeMode="contain"
                accessibilityLabel={`Foto: ${section.title}`}
              />
            ) : null}
          </View>
        ))}

        <Pressable
          onPress={replay}
          style={({ pressed }) => [styles.replay, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Rivedi i passi"
        >
          <Text style={styles.replayLabel}>Rivedi i passi</Text>
        </Pressable>

        <Pressable
          onPress={() => {
            void WebBrowser.openBrowserAsync(FAQ_URL);
          }}
          style={styles.card}
          accessibilityRole="link"
          accessibilityLabel="Domande frequenti"
        >
          <Text style={styles.rowLabel}>Domande frequenti</Text>
          <Text style={styles.rowValue}>Risposte semplici, con le foto dell’app.</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 8,
    gap: 4,
  },
  back: {
    color: colors.textMuted,
    fontSize: 34,
    lineHeight: 36,
    width: 28,
    marginTop: -4,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  scroll: {
    paddingBottom: 36,
  },
  card: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  rowValue: {
    marginTop: 4,
    color: colors.text,
    fontSize: 16,
    lineHeight: 22,
  },
  shot: {
    width: '100%',
    aspectRatio: 9 / 19.5,
    borderRadius: 12,
    backgroundColor: colors.background,
    marginTop: 12,
  },
  replay: {
    marginHorizontal: 16,
    marginBottom: 12,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  replayLabel: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.85,
  },
});
