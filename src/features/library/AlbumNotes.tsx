import { StyleSheet, Text, TextInput, View } from 'react-native';

import { useLibraryStore } from '../../store/libraryStore';
import { colors } from '../../theme/colors';

export function AlbumNotes({ albumId, notes }: { albumId: string; notes?: string }) {
  return (
    <View style={styles.card}>
      <Text style={styles.label}>Note dell’album</Text>
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
    paddingBottom: 10,
    marginBottom: 12,
  },
  label: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  input: {
    minHeight: 88,
    maxHeight: 180,
    color: colors.text,
    fontSize: 16,
    lineHeight: 22,
    padding: 0,
  },
});
