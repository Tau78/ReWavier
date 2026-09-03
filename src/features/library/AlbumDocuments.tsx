import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { AlbumDocument } from '../../domain/library';
import type { RootStackParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';

function displayName(name: string): string {
  return name.replace(/\.pdf$/i, '').trim() || name;
}

function documentsCount(count: number): string {
  return count === 1 ? '1 documento' : `${count} documenti`;
}

export function AlbumDocuments({ documents }: { documents: AlbumDocument[] }) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [open, setOpen] = useState(false);

  if (documents.length === 0) {
    return null;
  }

  return (
    <View style={styles.card}>
      <Pressable
        onPress={() => setOpen((value) => !value)}
        style={styles.header}
        accessibilityRole="button"
        accessibilityLabel={open ? 'Nascondi documenti' : 'Mostra documenti'}
        accessibilityState={{ expanded: open }}
      >
        <Text style={styles.title}>Documenti</Text>
        <Text style={styles.count}>{documentsCount(documents.length)}</Text>
        <Text style={styles.chevron}>{open ? '˄' : '˅'}</Text>
      </Pressable>
      {open ? (
        <>
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
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  count: {
    color: colors.textMuted,
    fontSize: 13,
  },
  chevron: {
    color: colors.textMuted,
    fontSize: 16,
    fontWeight: '700',
    width: 18,
    textAlign: 'center',
  },
  hint: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: 14,
    paddingBottom: 8,
  },
  row: {
    paddingHorizontal: 14,
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
