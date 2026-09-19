import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { isDownloaded } from '../../domain/audioFormats';
import type { NoteAuthorDot } from '../../domain/markers';
import { formatTimecode, type Track } from '../../domain/models';
import { fileCreatedAtMs, formatFileCreatedAt } from '../../files/fileCreatedAt';
import { resolveLibraryUri } from '../../files/libraryUris';
import { usePlayerStore } from '../../store/playerStore';
import { colors } from '../../theme/colors';
import { SwipeableRow } from './SwipeableRow';

type MetaMode = 'duration' | 'created';

const MAX_AUTHOR_DOTS = 4;
const DOT_SIZE = 12;
const DOT_OVERLAP = 5;

function authorDotsLabel(authors: NoteAuthorDot[]): string {
  if (authors.length === 0) {
    return 'Nessun appunto';
  }
  if (authors.length === 1) {
    return `Appunti di ${authors[0]!.name}`;
  }
  if (authors.length === 2) {
    return `Appunti di ${authors[0]!.name} e ${authors[1]!.name}`;
  }
  const shown = authors
    .slice(0, 2)
    .map((author) => author.name)
    .join(', ');
  return `Appunti di ${shown} e altri`;
}

export function TrackRow({
  track,
  noteAuthors,
  downloading,
  blocked,
  active,
  onPress,
  onLongPress,
  onDownload,
  onMenu,
  onArtwork,
  onSwipeDelete,
  swipeEnabled = true,
  hideArtist = false,
}: {
  track: Track;
  noteAuthors: NoteAuthorDot[];
  downloading?: boolean;
  blocked?: boolean;
  active?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  onDownload?: () => void;
  onMenu?: () => void;
  onArtwork?: () => void;
  /** Swipe left → Elimina; opens the same delete confirm as the ⋯ menu. */
  onSwipeDelete?: () => void;
  /** False while reorder/drag is active so swipe does not compete with Pan. */
  swipeEnabled?: boolean;
  /** Inside an album the name is already in the header. */
  hideArtist?: boolean;
}) {
  const downloaded = isDownloaded(track);
  const playerDurationMs = usePlayerStore((state) =>
    state.track.id === track.id ? state.track.durationMs : 0,
  );
  const durationMs = track.durationMs > 0 ? track.durationMs : playerDurationMs;
  const letter = (track.title.trim()[0] || '?').toUpperCase();
  const artworkUri = resolveLibraryUri(track.artworkUri);
  const [metaMode, setMetaMode] = useState<MetaMode>('duration');
  const createdLabel = useMemo(() => {
    const ms = fileCreatedAtMs(track);
    return ms != null ? formatFileCreatedAt(ms) : null;
  }, [track.id, track.fileUri, track.inboxUri, track.downloadedAt, track.sourceFileName, track.remoteUri]);
  const showCreated = metaMode === 'created' && createdLabel != null;
  const visibleAuthors = noteAuthors.slice(0, MAX_AUTHOR_DOTS);
  const extraAuthors = noteAuthors.length - visibleAuthors.length;

  useEffect(() => {
    setMetaMode('duration');
  }, [track.id, track.fileUri, track.inboxUri, track.downloadedAt]);

  const row = (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={280}
      disabled={blocked}
      style={({ pressed }) => [
        styles.row,
        active && styles.active,
        blocked && styles.blocked,
        pressed && !blocked && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={
        blocked
          ? `${track.title}, in aggiornamento. Aspetta che sia di nuovo pronto.`
          : hideArtist
            ? track.title
            : `${track.title}, ${track.artist}`
      }
      accessibilityState={{ disabled: blocked }}
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
        <Text
          style={[styles.title, active && styles.titleActive, blocked && styles.titleBlocked]}
          numberOfLines={1}
        >
          {track.title}
        </Text>
        {blocked ? (
          <Text style={[styles.sub, styles.subBelow, styles.titleBlocked]} numberOfLines={1}>
            In aggiornamento…
          </Text>
        ) : (
          <View style={styles.subRow}>
            <Pressable
              onPress={() => {
                if (!createdLabel) {
                  return;
                }
                setMetaMode((mode) => (mode === 'duration' ? 'created' : 'duration'));
              }}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={
                showCreated
                  ? `Creato il ${createdLabel}. Tocca per la durata`
                  : createdLabel
                    ? `Durata ${formatTimecode(durationMs)}. Tocca per la data del file`
                    : `Durata ${formatTimecode(durationMs)}`
              }
            >
              <Text style={styles.time} numberOfLines={1}>
                {showCreated ? createdLabel : formatTimecode(durationMs)}
              </Text>
            </Pressable>
            {hideArtist ? null : (
              <Text style={styles.sub} numberOfLines={1}>
                {track.artist}
              </Text>
            )}
            {noteAuthors.length === 0 ? (
              <Text style={styles.notes} numberOfLines={1}>
                Nessun appunto
              </Text>
            ) : (
              <View
                style={styles.authorDots}
                accessible
                accessibilityRole="text"
                accessibilityLabel={authorDotsLabel(noteAuthors)}
              >
                {visibleAuthors.map((author, index) => (
                  <View
                    key={author.key}
                    style={[
                      styles.authorDot,
                      {
                        backgroundColor: author.color,
                        marginLeft: index === 0 ? 0 : -DOT_OVERLAP,
                        zIndex: visibleAuthors.length - index,
                      },
                    ]}
                  />
                ))}
                {extraAuthors > 0 ? (
                  <Text style={styles.authorMore} importantForAccessibility="no">
                    +{extraAuthors}
                  </Text>
                ) : null}
              </View>
            )}
          </View>
        )}
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
    return (
      <SwipeableRow onDelete={onSwipeDelete} swipeEnabled={swipeEnabled}>
        {row}
      </SwipeableRow>
    );
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
  blocked: {
    opacity: 0.45,
  },
  titleBlocked: {
    color: colors.textMuted,
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
    flex: 1,
    minWidth: 0,
    color: colors.textMuted,
    fontSize: 13,
  },
  subBelow: {
    marginTop: 2,
  },
  subRow: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  time: {
    flexShrink: 0,
    color: colors.textMuted,
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  notes: {
    flexShrink: 0,
    color: colors.accent,
    fontSize: 11,
    fontWeight: '600',
  },
  authorDots: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  authorDot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    borderWidth: 1.5,
    borderColor: colors.background,
  },
  authorMore: {
    marginLeft: 3,
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
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
