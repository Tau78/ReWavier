import { useMemo } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatTimecode } from '../../domain/models';
import { buildLessonRecapText, lessonRecapRows } from '../../domain/practice';
import type { RootStackParamList } from '../../navigation/types';
import { useLibraryStore } from '../../store/libraryStore';
import { colors, layout } from '../../theme/colors';
import { KindRow } from '../../theme/graphics';

type Nav = NativeStackNavigationProp<RootStackParamList, 'LessonRecap'>;
type Route = RouteProp<RootStackParamList, 'LessonRecap'>;

export function LessonRecapScreen() {
  const navigation = useNavigation<Nav>();
  const { kind, id } = useRoute<Route>().params;
  const folders = useLibraryStore((s) => s.folders);
  const albums = useLibraryStore((s) => s.albums);
  const markersByTrackId = useLibraryStore((s) => s.markersByTrackId);
  const allTracks = useLibraryStore((s) => s.tracks);
  const tracks = useMemo(
    () => useLibraryStore.getState().tracksIn(kind, id),
    [kind, id, folders, albums, markersByTrackId, allTracks],
  );
  const title =
    kind === 'album'
      ? albums.find((item) => item.id === id)?.name
      : folders.find((item) => item.id === id)?.name;
  const name = title?.trim() || (kind === 'album' ? 'Album' : 'Cartella');
  const rows = useMemo(
    () => lessonRecapRows(tracks, markersByTrackId),
    [tracks, markersByTrackId],
  );
  const shareText = useMemo(() => buildLessonRecapText(name, rows), [name, rows]);

  const share = () => {
    void Share.share({ message: shareText, title: name });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={layout.hitSlop}
          accessibilityRole="button"
          accessibilityLabel="Indietro"
        >
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <View style={styles.headerText}>
          <KindRow label={kind === 'album' ? 'Album' : 'Cartella'} />
          <Text style={styles.title} numberOfLines={1}>
            Resoconto lezione
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {name}
          </Text>
        </View>
        {rows.length > 0 ? (
          <Pressable onPress={share} hitSlop={layout.hitSlop} accessibilityRole="button">
            <Text style={styles.share}>Condividi</Text>
          </Pressable>
        ) : (
          <View style={styles.shareSpacer} />
        )}
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {rows.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.empty}>
              Qui compariranno i momenti toccati in lezione, con la prima riga di ogni appunto.
            </Text>
          </View>
        ) : (
          <>
            <Text style={styles.count}>
              {rows.length === 1 ? '1 appunto' : `${rows.length} appunti`}
            </Text>
            {rows.map((row) => (
              <View key={row.key} style={styles.row}>
                <View style={[styles.swatch, { backgroundColor: row.color }]} />
                <View style={styles.copy}>
                  <Text style={styles.time}>{formatTimecode(row.timestampMs)}</Text>
                  <Text style={styles.track} numberOfLines={1}>
                    {row.trackTitle}
                  </Text>
                  <Text style={[styles.who, { color: row.color }]} numberOfLines={1}>
                    {row.author === 'Tu' ? 'Tu dici:' : `${row.author} dice:`}
                  </Text>
                  {row.preview ? (
                    <Text style={styles.preview} numberOfLines={3}>
                      {row.preview}
                    </Text>
                  ) : null}
                </View>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 12,
    gap: 8,
  },
  back: {
    color: colors.textMuted,
    fontSize: 34,
    lineHeight: 36,
    width: 28,
    marginTop: -4,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  subtitle: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: 13,
  },
  share: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '700',
    marginTop: 18,
  },
  shareSpacer: {
    width: 28,
  },
  scroll: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  count: {
    color: colors.textMuted,
    fontSize: 13,
    marginBottom: 10,
  },
  emptyBox: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  empty: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  swatch: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  time: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  track: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: 13,
  },
  who: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '700',
  },
  preview: {
    marginTop: 2,
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
});
