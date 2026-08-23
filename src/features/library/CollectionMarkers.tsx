import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import {
  isMarkerHidden,
  markerAuthorLabel,
  markerColor,
  markerPreviewText,
} from '../../domain/markers';
import { formatTimecode, type Marker, type Track } from '../../domain/models';
import type { RootStackParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';
import { openTrack } from './openTrack';

type Nav = NativeStackNavigationProp<RootStackParamList>;

type CueRow = {
  key: string;
  track: Track;
  marker: Marker;
};

export function CollectionMarkers({
  tracks,
  markersByTrackId,
}: {
  tracks: Track[];
  markersByTrackId: Record<string, Marker[]>;
}) {
  const navigation = useNavigation<Nav>();
  const [open, setOpen] = useState(false);

  const rows = useMemo<CueRow[]>(() => {
    const next: CueRow[] = [];
    for (const track of tracks) {
      const markers = (markersByTrackId[track.id] ?? [])
        .filter((marker) => !isMarkerHidden(marker))
        .slice()
        .sort((a, b) => a.timestampMs - b.timestampMs);
      for (const marker of markers) {
        next.push({ key: `${track.id}:${marker.id}`, track, marker });
      }
    }
    return next;
  }, [tracks, markersByTrackId]);

  if (rows.length === 0) {
    return null;
  }

  const playCue = (row: CueRow) => {
    if (
      !openTrack(
        row.track.id,
        tracks.map((track) => track.id),
        { autoPlay: true, startAtMs: row.marker.timestampMs },
      )
    ) {
      Alert.alert(
        'Scarica',
        'Questa traccia non è ancora sul telefono. Tocca ↓ per il download offline.',
      );
      return;
    }
    navigation.navigate('Player');
  };

  return (
    <View style={styles.card}>
      <Pressable
        onPress={() => setOpen((value) => !value)}
        style={styles.header}
        accessibilityRole="button"
        accessibilityLabel={open ? 'Nascondi appunti' : 'Mostra appunti'}
        accessibilityState={{ expanded: open }}
      >
        <Text style={styles.title}>Appunti</Text>
        <Text style={styles.count}>
          {rows.length === 1 ? '1 appunto' : `${rows.length} appunti`}
        </Text>
        <Text style={styles.chevron}>{open ? '˄' : '˅'}</Text>
      </Pressable>
      {open
        ? rows.map((row) => {
            const pinColor = markerColor(row.marker);
            const author = markerAuthorLabel(row.marker);
            const preview = markerPreviewText(row.marker.text);
            const says = author === 'Tu' ? 'Tu dici:' : `${author} dice:`;
            return (
              <Pressable
                key={row.key}
                onPress={() => playCue(row)}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={`Parti da ${formatTimecode(row.marker.timestampMs)} in ${row.track.title}`}
              >
                <View style={[styles.swatch, { backgroundColor: pinColor }]} />
                <View style={styles.copy}>
                  <Text style={styles.time}>{formatTimecode(row.marker.timestampMs)}</Text>
                  <Text style={styles.track} numberOfLines={1}>
                    {row.track.title}
                  </Text>
                  <Text style={[styles.who, { color: pinColor }]} numberOfLines={1}>
                    {says}
                  </Text>
                  {preview ? (
                    <Text style={styles.preview} numberOfLines={2}>
                      {preview}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })
        : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  count: {
    color: colors.textMuted,
    fontSize: 13,
  },
  chevron: {
    color: colors.textMuted,
    fontSize: 16,
    fontWeight: '700',
    width: 18,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  pressed: {
    opacity: 0.7,
    backgroundColor: colors.surfaceRaised,
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
