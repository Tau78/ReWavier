import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import type { AlbumDocument } from '../../domain/library';
import { openAlbumDocument } from '../../files/albumDocuments';
import { colors } from '../../theme/colors';

function displayName(name: string): string {
  return name.replace(/\.pdf$/i, '').trim() || name;
}

export function AlbumDocuments({ documents }: { documents: AlbumDocument[] }) {
  if (documents.length === 0) {
    return null;
  }

  const open = (document: AlbumDocument) => {
    void openAlbumDocument(document.fileUri, document.name).catch((error: unknown) => {
      Alert.alert(
        'Documento',
        error instanceof Error ? error.message : 'Non riesco ad aprire il documento.',
      );
    });
  };

  return (
    <View style={styles.card}>
      <Text style={styles.label}>Documenti</Text>
      <Text style={styles.hint}>PDF della cartella Drive. Tocca per aprire.</Text>
      {documents.map((document, index) => (
        <Pressable
          key={document.id}
          onPress={() => open(document)}
          style={({ pressed }) => [
            styles.row,
            index < documents.length - 1 && styles.rowBorder,
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Apri ${displayName(document.name)}`}
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
