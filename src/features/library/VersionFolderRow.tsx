import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { AlbumVersionFolder } from '../../domain/library';
import type { Track } from '../../domain/models';
import { colors } from '../../theme/colors';
import { TrackRow } from './TrackRow';

export function VersionFolderRow({
  folder,
  tracks,
  open,
  playerTrackId,
  noteCountOf,
  downloadingOf,
  onToggle,
  onPlayChosen,
  onPlayVersion,
  onMenu,
  onVersionMenu,
}: {
  folder: AlbumVersionFolder;
  tracks: Track[];
  open: boolean;
  playerTrackId?: string;
  noteCountOf: (trackId: string) => number;
  downloadingOf: (trackId: string) => boolean;
  onToggle: () => void;
  onPlayChosen: () => void;
  onPlayVersion: (track: Track) => void;
  onMenu: () => void;
  onVersionMenu: (track: Track) => void;
}) {
  const count = folder.trackIds.length;
  const chosen = tracks.find((track) => track.id === folder.chosenId) ?? tracks[0];

  return (
    <View>
      <Pressable
        onPress={onToggle}
        onLongPress={onPlayChosen}
        delayLongPress={280}
        style={({ pressed }) => [styles.header, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={open ? `Nascondi versioni di ${folder.name}` : `Mostra versioni di ${folder.name}`}
        accessibilityState={{ expanded: open }}
      >
        <Text style={styles.stack} importantForAccessibility="no">
          ▤
        </Text>
        <View style={styles.copy}>
          <Text style={styles.title} numberOfLines={1}>
            {folder.name}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {count === 1 ? '1 versione' : `${count} versioni`}
            {chosen ? ` · ${chosen.title}` : ''}
          </Text>
        </View>
        <Pressable
          onPress={onPlayChosen}
          hitSlop={8}
          style={styles.play}
          accessibilityRole="button"
          accessibilityLabel={`Ascolta ${folder.name}`}
        >
          <Text style={styles.playGlyph}>▶</Text>
        </Pressable>
        <Pressable
          onPress={onMenu}
          hitSlop={8}
          style={styles.play}
          accessibilityRole="button"
          accessibilityLabel="Comandi cartella versioni"
        >
          <Text style={styles.menuGlyph}>⋯</Text>
        </Pressable>
        <Text style={styles.chevron}>{open ? '˄' : '˅'}</Text>
      </Pressable>
      {open
        ? tracks.map((track) => (
            <View key={track.id} style={styles.child}>
              <TrackRow
                track={track}
                active={track.id === playerTrackId || track.id === folder.chosenId}
                noteCount={noteCountOf(track.id)}
                downloading={downloadingOf(track.id)}
                onPress={() => onPlayVersion(track)}
                onMenu={() => onVersionMenu(track)}
              />
            </View>
          ))
        : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  pressed: {
    opacity: 0.7,
    backgroundColor: colors.surfaceRaised,
  },
  stack: {
    color: colors.accent,
    fontSize: 18,
    width: 22,
    textAlign: 'center',
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  meta: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: 13,
  },
  play: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
  },
  playGlyph: {
    color: colors.accent,
    fontSize: 13,
    marginLeft: 2,
  },
  menuGlyph: {
    color: colors.textMuted,
    fontSize: 16,
    fontWeight: '700',
  },
  chevron: {
    color: colors.textMuted,
    fontSize: 16,
    fontWeight: '700',
    width: 18,
    textAlign: 'center',
  },
  child: {
    paddingLeft: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
