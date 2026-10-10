import { useMemo } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { isMarkerHidden } from '../../domain/markers';
import type { Marker, Track } from '../../domain/models';
import { usePlayerStore } from '../../store/playerStore';
import { colors } from '../../theme/colors';
import { MarkerCueStrip, type MarkerCueItem } from './MarkerCueStrip';
import { ensurePlayableAndOpen } from './openTrack';

type CueRow = {
  key: string;
  track: Track;
  marker: Marker;
};

export function CollectionMarkers({
  tracks,
  markersByTrackId,
  memberColors,
}: {
  tracks: Track[];
  markersByTrackId: Record<string, Marker[]>;
  memberColors?: Record<string, string> | null;
}) {
  const playerTrackId = usePlayerStore((s) => s.track.id);
  const positionMs = usePlayerStore((s) => s.positionMs);

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

  const items = useMemo<MarkerCueItem[]>(
    () =>
      rows.map((row) => ({
        key: row.key,
        marker: row.marker,
        accessibilityExtra: row.track.title,
      })),
    [rows],
  );

  if (rows.length === 0) {
    return null;
  }

  const activeMarkerId = (() => {
    const onTrack = rows.filter((row) => row.track.id === playerTrackId);
    if (onTrack.length === 0) {
      return null;
    }
    let best: CueRow | null = null;
    let bestDelta = Number.POSITIVE_INFINITY;
    for (const row of onTrack) {
      const delta = Math.abs(positionMs - row.marker.timestampMs);
      if (delta < 280 && delta < bestDelta) {
        best = row;
        bestDelta = delta;
      }
    }
    return best?.marker.id ?? null;
  })();

  const playCue = (marker: Marker) => {
    const row = rows.find((item) => item.marker.id === marker.id);
    if (!row) {
      return;
    }
    void ensurePlayableAndOpen(row.track.id, tracks.map((track) => track.id), {
      autoPlay: true,
      startAtMs: row.marker.timestampMs,
      resume: false,
    }).then((opened) => {
      if (opened) {
        usePlayerStore.getState().setDockExpanded(true);
        return;
      }
      Alert.alert('Ascolto', 'Questo brano non è ancora arrivato. Riprova tra un attimo.');
    });
  };

  return (
    <View style={styles.card} accessibilityLabel="Appunti dell’album">
      <Text style={styles.label}>Appunti</Text>
      <MarkerCueStrip
        items={items}
        memberColors={memberColors}
        activeMarkerId={activeMarkerId}
        onPress={playCue}
        onLongPress={playCue}
        accessibilityLabel="Appunti nell’album"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
    marginBottom: 12,
  },
  label: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
});
