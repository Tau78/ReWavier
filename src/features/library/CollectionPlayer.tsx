import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatTimecode } from '../../domain/models';
import { fileCreatedAtMs, formatFileCreatedAt } from '../../files/fileCreatedAt';
import type { RootStackParamList } from '../../navigation/types';
import { useLibraryStore } from '../../store/libraryStore';
import { usePlayerStore } from '../../store/playerStore';
import { colors, layout } from '../../theme/colors';
import { NoteBubble } from '../notes/NoteBubble';
import { AddNoteButton } from '../player/AddNoteButton';
import { PlaybackControls } from '../player/PlaybackControls';
import { PracticeBar } from '../player/PracticeBar';
import { TrackScoreTabs } from './TrackScoreTabs';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type MetaMode = 'duration' | 'created';

/** Bottom dock like the album player. Pass `trackIds` to show only those tracks; omit to show any loaded track. */
export function CollectionPlayer({ trackIds }: { trackIds?: string[] }) {
  const navigation = useNavigation<Nav>();
  const focused = useIsFocused();
  const track = usePlayerStore((s) => s.track);
  const positionMs = usePlayerStore((s) => s.positionMs);
  const libraryTrack = useLibraryStore((s) => (track.id ? s.getTrack(track.id) : undefined));
  const [metaMode, setMetaMode] = useState<MetaMode>('duration');
  const [createdLabel, setCreatedLabel] = useState<string | null>(null);

  useEffect(() => {
    setMetaMode('duration');
    const source = libraryTrack ?? track;
    const ms = fileCreatedAtMs(source);
    setCreatedLabel(ms != null ? formatFileCreatedAt(ms) : null);
  }, [track.id, libraryTrack?.fileUri, libraryTrack?.inboxUri, libraryTrack?.downloadedAt]);

  if (!track.id) {
    return null;
  }
  if (trackIds && (trackIds.length === 0 || !trackIds.includes(track.id))) {
    return null;
  }

  const showCreated = metaMode === 'created' && createdLabel != null;

  return (
    <SafeAreaView edges={['bottom']} style={styles.dock}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.navigate('Player')}
          hitSlop={layout.hitSlop}
          accessibilityRole="button"
          accessibilityLabel={`${track.title}. Apri il lettore grande`}
          style={styles.headerText}
        >
          <Text style={styles.title} numberOfLines={1}>
            {track.title}
          </Text>
          <Text style={styles.artist} numberOfLines={1}>
            {track.artist}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => {
            if (!createdLabel) {
              return;
            }
            setMetaMode((mode) => (mode === 'duration' ? 'created' : 'duration'));
          }}
          hitSlop={layout.hitSlop}
          accessibilityRole="button"
          accessibilityLabel={
            showCreated
              ? `Creato il ${createdLabel}. Tocca per la durata`
              : createdLabel
                ? `Durata ${formatTimecode(track.durationMs)}. Tocca per la data del file`
                : `Durata ${formatTimecode(track.durationMs)}`
          }
          style={styles.timecodeHit}
        >
          {showCreated ? (
            <Text style={styles.timecode} numberOfLines={1}>
              {createdLabel}
            </Text>
          ) : (
            <Text style={styles.timecode} numberOfLines={1}>
              {formatTimecode(positionMs)}
              <Text style={styles.timecodeSep}> / </Text>
              {formatTimecode(track.durationMs)}
            </Text>
          )}
        </Pressable>
      </View>

      <PracticeBar />
      <TrackScoreTabs trackId={track.id} />

      <PlaybackControls />
      <AddNoteButton />
      {focused ? <NoteBubble /> : null}
    </SafeAreaView>
  );
}

const mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

const styles = StyleSheet.create({
  dock: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  artist: {
    marginTop: 3,
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '500',
  },
  timecodeHit: {
    marginTop: 4,
    maxWidth: '46%',
  },
  timecode: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
    fontFamily: mono,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  timecodeSep: {
    color: colors.textMuted,
  },
});
