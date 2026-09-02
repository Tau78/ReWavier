import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { AlbumDocument } from '../../domain/library';
import type { RootStackParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';

function displayName(name: string): string {
  return name.replace(/\.pdf$/i, '').trim() || name;
}

export function AlbumDocuments({ documents }: { documents: AlbumDocument[] }) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  if (documents.length === 0) {
    return null;
  }

  return (
    <View style={styles.card}>
      <Text style={styles.label}>Documenti</Text>
      <Text style={styles.hint}>PDF della cartella Drive. Tocca per vederlo.</Text>
      {documents.map((document, index) => (
        <Pressable
          key={document.id}
          onPress={() =>
            navigation.navigate('PdfPreview', { fileUri: document.fileUri, name: document.name })
          }
          style={({ pressed }) => [
            styles.row,
            index < documents.length - 1 && styles.rowBorder,
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Vedi ${displayName(document.name)}`}
        >
          <Text style={styles.name} numberOfLines={2}>
            {displayName(document.name)}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {document.folderPath ? `Cartella ${document.folderPath} · PDF` : 'PDF'}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 4,
    marginBottom: 12,
  },
  label: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  hint: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 8,
  },
  row: {
    paddingVertical: 12,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  name: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  meta: {
    marginTop: 4,
    color: colors.textMuted,
    fontSize: 12,
  },
  pressed: {
    opacity: 0.7,
  },
});
