import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useLibraryStore } from '../../store/libraryStore';
import { colors } from '../../theme/colors';

function notesPreview(notes?: string): string {
  const trimmed = notes?.trim() ?? '';
  if (!trimmed) {
    return 'Nessun appunto';
  }
  const firstLine = trimmed.split('\n').find((line) => line.trim()) ?? trimmed;
  return firstLine.length > 42 ? `${firstLine.slice(0, 41)}…` : firstLine;
}

export function AlbumNotes({ albumId, notes }: { albumId: string; notes?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.card}>
      <Pressable
        onPress={() => setOpen((value) => !value)}
        style={styles.header}
        accessibilityRole="button"
        accessibilityLabel={open ? 'Nascondi appunti album' : 'Mostra appunti album'}
        accessibilityState={{ expanded: open }}
      >
        <Text style={styles.title}>Appunti album</Text>
        <Text style={styles.count} numberOfLines={1}>
          {notesPreview(notes)}
        </Text>
        <Text style={styles.chevron}>{open ? '˄' : '˅'}</Text>
      </Pressable>
      {open ? (
        <TextInput
          style={styles.input}
          value={notes ?? ''}
          onChangeText={(text) => useLibraryStore.getState().setAlbumNotes(albumId, text)}
          placeholder="Scrivi un appunto sull’album: idee, accordi, cose da ricordare."
          placeholderTextColor={colors.textMuted}
          multiline
          textAlignVertical="top"
          selectionColor={colors.accent}
        />
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
    marginTop: 12,
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
    flexShrink: 0,
  },
  count: {
    color: colors.textMuted,
    fontSize: 13,
    flex: 1,
    textAlign: 'right',
  },
  chevron: {
    color: colors.textMuted,
    fontSize: 16,
    fontWeight: '700',
    width: 18,
    textAlign: 'center',
  },
  input: {
    minHeight: 88,
    maxHeight: 180,
    color: colors.text,
    fontSize: 16,
    lineHeight: 22,
    paddingHorizontal: 14,
    paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: 12,
  },
});
