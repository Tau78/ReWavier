import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { isDownloaded } from '../../domain/audioFormats';
import { formatTimecode, type Track } from '../../domain/models';
import { resolveLibraryUri } from '../../files/libraryUris';
import { usePlayerStore } from '../../store/playerStore';
import { colors } from '../../theme/colors';
import { SwipeableRow } from './SwipeableRow';

export function TrackRow({
  track,
  noteCount,
  downloading,
  active,
  onPress,
  onLongPress,
  onDownload,
  onMenu,
  onArtwork,
  onSwipeDelete,
}: {
  track: Track;
  noteCount: number;
  downloading?: boolean;
  active?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  onDownload?: () => void;
  onMenu?: () => void;
  onArtwork?: () => void;
  /** Swipe left → Elimina; opens the same delete confirm as the ⋯ menu. */
  onSwipeDelete?: () => void;
}) {
  const downloaded = isDownloaded(track);
  const playerDurationMs = usePlayerStore((state) =>
    state.track.id === track.id ? state.track.durationMs : 0,
  );
  const durationMs = track.durationMs > 0 ? track.durationMs : playerDurationMs;
  const letter = (track.title.trim()[0] || '?').toUpperCase();
  const artworkUri = resolveLibraryUri(track.artworkUri);

  const row = (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={280}
      style={({ pressed }) => [styles.row, active && styles.active, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${track.title}, ${track.artist}`}
    >
      <Pressable
        onPress={onArtwork}
        disabled={!onArtwork}
        style={styles.artHit}
        accessibilityRole={onArtwork ? 'button' : undefined}
        accessibilityLabel={
          onArtwork
            ? track.artworkUri
              ? 'Cambia copertina della traccia'
              : 'Aggiungi copertina della traccia'
            : undefined
        }
      >
        {artworkUri ? (
          <Image source={{ uri: artworkUri }} style={styles.art} resizeMode="cover" />
        ) : (
          <View style={styles.artFallback}>
            <Text style={styles.artLetter}>{letter}</Text>
          </View>
        )}
      </Pressable>
      <View style={styles.meta}>
        <Text style={[styles.title, active && styles.titleActive]} numberOfLines={1}>
          {track.title}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {track.artist}
        </Text>
      </View>
      <View style={styles.aside}>
        <Text style={styles.time}>{formatTimecode(durationMs)}</Text>
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

  if (onSwipeDelete) {
    return <SwipeableRow onDelete={onSwipeDelete}>{row}</SwipeableRow>;
  }
  return row;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 10,
  },
  active: {
    backgroundColor: colors.surfaceRaised,
  },
  pressed: {
    opacity: 0.7,
    backgroundColor: colors.surfaceRaised,
  },
  titleActive: {
    color: colors.accent,
  },
  artHit: {
    width: 44,
    height: 44,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: colors.surfaceRaised,
  },
  art: {
    width: 44,
    height: 44,
  },
  artFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  artLetter: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
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
