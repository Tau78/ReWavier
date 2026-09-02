import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import { resolveLibraryUri } from '../../files/libraryUris';
import type { RootStackParamList } from '../../navigation/types';
import { colors, layout } from '../../theme/colors';
import { KindRow } from '../../theme/graphics';

type Nav = NativeStackNavigationProp<RootStackParamList, 'PdfPreview'>;
type Route = RouteProp<RootStackParamList, 'PdfPreview'>;

function parentDirectoryUri(fileUri: string): string {
  return fileUri.replace(/\/[^/]*$/, '/');
}

function displayName(name: string): string {
  return name.replace(/\.pdf$/i, '').trim() || name;
}

export function PdfPreviewScreen() {
  const navigation = useNavigation<Nav>();
  const { fileUri, name } = useRoute<Route>().params;
  const resolved = useMemo(() => resolveLibraryUri(fileUri), [fileUri]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={layout.hitSlop}
          accessibilityRole="button"
          accessibilityLabel="Indietro"
        >
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <View style={styles.headerText}>
          <KindRow label="Documento" />
          <Text style={styles.title} numberOfLines={1}>
            {displayName(name)}
          </Text>
        </View>
      </View>
      {resolved ? (
        <WebView
          source={{ uri: resolved }}
          style={styles.preview}
          originWhitelist={['*']}
          allowingReadAccessToURL={parentDirectoryUri(resolved)}
          allowFileAccess
          allowFileAccessFromFileURLs
          startInLoadingState
          scalesPageToFit
        />
      ) : (
        <View style={styles.missing}>
          <Text style={styles.missingText}>Questo documento non è più sul telefono.</Text>
        </View>
      )}
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
    paddingBottom: 10,
    gap: 4,
  },
  back: {
    color: colors.textMuted,
    fontSize: 34,
    lineHeight: 36,
    width: 28,
    marginTop: -4,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  preview: {
    flex: 1,
    backgroundColor: colors.background,
  },
  missing: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  missingText: {
    color: colors.textMuted,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
});
