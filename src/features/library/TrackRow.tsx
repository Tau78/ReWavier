import { Pressable, StyleSheet, Text, View } from 'react-native';

import { isDownloaded } from '../../domain/audioFormats';
import { formatTimecode, type Track } from '../../domain/models';
import { colors } from '../../theme/colors';

export function TrackRow({
  track,
  noteCount,
  downloading,
  onPress,
  onLongPress,
  onDownload,
  onMenu,
}: {
  track: Track;
  noteCount: number;
  downloading?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  onDownload?: () => void;
  onMenu?: () => void;
}) {
  const downloaded = isDownloaded(track);

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={280}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${track.title}, ${track.artist}`}
    >
      <View style={styles.meta}>
        <Text style={styles.title} numberOfLines={1}>
          {track.title}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {track.artist}
        </Text>
      </View>
      <View style={styles.aside}>
        <Text style={styles.time}>{formatTimecode(track.durationMs)}</Text>
        <Text style={styles.notes}>
          {noteCount === 0 ? 'Nessun appunto' : `${noteCount} appunti`}
        </Text>
      </View>
      {onDownload ? (
        <Pressable
          onPress={onDownload}
          hitSlop={8}
          style={styles.download}
          accessibilityRole="button"
          accessibilityLabel={
            downloading ? 'Download in corso' : downloaded ? 'Scaricata' : 'Scarica offline'
          }
        >
          <Text style={[styles.downloadGlyph, downloaded && styles.downloadDone]}>
            {downloading ? '…' : downloaded ? '✓' : '↓'}
          </Text>
        </Pressable>
      ) : null}
      {onMenu ? (
        <Pressable
          onPress={onMenu}
          hitSlop={8}
          style={styles.download}
          accessibilityRole="button"
          accessibilityLabel="Comandi traccia"
        >
          <Text style={styles.downloadGlyph}>⋯</Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 10,
  },
  pressed: {
    opacity: 0.7,
    backgroundColor: colors.surfaceRaised,
  },
  meta: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  sub: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: 13,
  },
  aside: {
    alignItems: 'flex-end',
  },
  time: {
    color: colors.textMuted,
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  notes: {
    marginTop: 2,
    color: colors.accent,
    fontSize: 11,
    fontWeight: '600',
  },
  download: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
  },
  downloadGlyph: {
    color: colors.textMuted,
    fontSize: 16,
    fontWeight: '700',
  },
  downloadDone: {
    color: '#34C759',
  },
});
