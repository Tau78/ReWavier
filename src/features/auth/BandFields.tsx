import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { BAND_COLORS } from '../../domain/bandColors';
import type { UserBand } from '../../domain/session';
import { colors } from '../../theme/colors';

export function ColorSwatches({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (color: string) => void;
}) {
  return (
    <View style={styles.swatches}>
      {BAND_COLORS.map((swatch) => {
        const selected = value === swatch;
        return (
          <Pressable
            key={swatch}
            onPress={() => onChange(swatch)}
            style={[styles.swatch, { backgroundColor: swatch }, selected && styles.swatchOn]}
            accessibilityRole="button"
            accessibilityLabel={`Colore ${swatch}`}
            accessibilityState={{ selected }}
          />
        );
      })}
    </View>
  );
}

export function BandDraftFields({
  name,
  color,
  onName,
  onColor,
}: {
  name: string;
  color: string | null;
  onName: (name: string) => void;
  onColor: (color: string) => void;
}) {
  return (
    <>
      <Text style={styles.blockTitle}>Nome della band</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={onName}
        placeholder="Es. The Waves"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="words"
        selectionColor={colors.accent}
      />
      <Text style={styles.blockTitle}>Il tuo colore</Text>
      <Text style={styles.blockBody}>
        I tuoi marker in questa band. Se aggiungi un’altra band, parte da questo colore: puoi
        cambiarlo.
      </Text>
      <ColorSwatches value={color} onChange={onColor} />
    </>
  );
}

export function SavedBandRow({
  band,
  active,
  onPress,
  onDelete,
}: {
  band: UserBand;
  active?: boolean;
  onPress?: () => void;
  onDelete?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.saved, active && styles.savedOn]}
      accessibilityRole={onPress ? 'button' : undefined}
    >
      <View style={[styles.dot, { backgroundColor: band.color }]} />
      <View style={styles.savedText}>
        <Text style={styles.savedName}>{band.name}</Text>
        {active ? <Text style={styles.savedMeta}>In uso per i marker</Text> : null}
      </View>
      {onDelete ? (
        <Pressable onPress={onDelete} hitSlop={8}>
          <Text style={styles.delete}>Elimina</Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  blockTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
    marginTop: 16,
  },
  blockBody: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  input: {
    borderRadius: 14,
    backgroundColor: colors.surfaceRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    color: colors.text,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
    marginBottom: 4,
  },
  swatches: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  swatch: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  swatchOn: {
    borderWidth: 3,
    borderColor: colors.text,
  },
  saved: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 8,
  },
  savedOn: {
    borderColor: colors.accent,
  },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  savedText: {
    flex: 1,
    minWidth: 0,
  },
  savedName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  savedMeta: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: 12,
  },
  delete: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '600',
  },
});
