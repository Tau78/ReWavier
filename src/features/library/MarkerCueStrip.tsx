import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { isPlaceholderMarker, markerColor, markerPreviewText } from '../../domain/markers';
import { formatTimecode, type Marker } from '../../domain/models';
import { colors } from '../../theme/colors';

export type MarkerCueItem = {
  key: string;
  marker: Marker;
  /** Extra words for VoiceOver (e.g. track title in an album list). */
  accessibilityExtra?: string;
};

/**
 * Horizontal note chips under Panoramica — shared so the album view matches the player.
 * Do not restyle lightly: Player uses this strip.
 */
export function MarkerCueStrip({
  items,
  memberColors,
  activeMarkerId,
  onPress,
  onLongPress,
  accessibilityLabel = 'Punti dell’audio',
}: {
  items: MarkerCueItem[];
  memberColors?: Record<string, string> | null;
  activeMarkerId?: string | null;
  onPress: (marker: Marker) => void;
  onLongPress?: (marker: Marker) => void;
  accessibilityLabel?: string;
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.cueRow}
      accessibilityLabel={accessibilityLabel}
    >
      {items.map((item) => {
        const preview = markerPreviewText(item.marker.text);
        const active = activeMarkerId != null && activeMarkerId === item.marker.id;
        const pinColor = markerColor(item.marker, memberColors);
        return (
          <Pressable
            key={item.key}
            onPress={() => onPress(item.marker)}
            onLongPress={onLongPress ? () => onLongPress(item.marker) : undefined}
            delayLongPress={480}
            accessibilityRole="button"
            accessibilityLabel={`Parti da ${formatTimecode(item.marker.timestampMs)}${
              item.accessibilityExtra ? ` in ${item.accessibilityExtra}` : ''
            }${preview ? `. ${preview}` : ''}`}
            accessibilityHint="Parte da questo punto. Tieni premuto per leggere tutto."
            style={({ pressed }) => [
              styles.cueChip,
              { borderColor: pinColor },
              active && styles.cueChipActive,
              pressed && styles.cueChipPressed,
            ]}
          >
            <View style={[styles.cueDot, { backgroundColor: pinColor }]} />
            <View style={styles.cueCopy}>
              <Text style={styles.cueTime}>{formatTimecode(item.marker.timestampMs)}</Text>
              {preview ? (
                <Text
                  style={[
                    styles.cuePreview,
                    isPlaceholderMarker(item.marker) && { color: colors.textMuted },
                  ]}
                  numberOfLines={1}
                >
                  {preview}
                </Text>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  cueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 10,
    paddingHorizontal: 2,
  },
  cueChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: 168,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cueChipActive: {
    backgroundColor: colors.surface,
  },
  cueChipPressed: {
    opacity: 0.75,
  },
  cueDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  cueCopy: {
    flexShrink: 1,
    minWidth: 0,
  },
  cueTime: {
    color: colors.text,
    fontSize: 11,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
  cuePreview: {
    marginTop: 1,
    color: colors.textMuted,
    fontSize: 11,
  },
});
