import { StyleSheet, TextInput } from 'react-native';

import { colors } from '../../theme/colors';

export const LIBRARY_SEARCH_PLACEHOLDER = 'Cerca playlist, album o brani…';

export function matchesLibrarySearch(
  query: string,
  ...fields: Array<string | undefined>
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }
  return fields.some((field) => (field ?? '').toLowerCase().includes(q));
}

export function LibrarySearch({
  value,
  onChangeText,
  placeholder = LIBRARY_SEARCH_PLACEHOLDER,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
}) {
  return (
    <TextInput
      style={styles.search}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.textMuted}
      selectionColor={colors.accent}
      autoCorrect={false}
      accessibilityLabel={placeholder}
    />
  );
}

const styles = StyleSheet.create({
  search: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    color: colors.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
});
