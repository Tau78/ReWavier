import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { applyAudioReview } from '../../cloud/syncEngine';
import { formatTimecode } from '../../domain/models';
import { useSyncStore } from '../../store/syncStore';
import { colors, layout } from '../../theme/colors';
import { KindRow } from '../../theme/graphics';

export function SyncReviewScreen() {
  const navigation = useNavigation();
  const reviews = useSyncStore((s) => s.pendingReviews);
  const current = reviews[0];
  const [keepIds, setKeepIds] = useState<Set<string>>(() => new Set(current?.markers.map((m) => m.id) ?? []));

  const markers = current?.markers ?? [];
  const allOn = useMemo(
    () => markers.length > 0 && markers.every((marker) => keepIds.has(marker.id)),
    [markers, keepIds],
  );

  if (!current) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={layout.hitSlop}>
            <Text style={styles.back}>‹</Text>
          </Pressable>
          <View>
            <KindRow label="Drive" />
            <Text style={styles.title}>Nessun file da rivedere</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const toggle = (id: string) => {
    setKeepIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const onApply = () => {
    void applyAudioReview(current.trackId, [...keepIds]).then(() => {
      const left = useSyncStore.getState().pendingReviews;
      if (left[0]) {
        setKeepIds(new Set(left[0].markers.map((marker) => marker.id)));
        return;
      }
      navigation.goBack();
    });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={layout.hitSlop}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <View>
          <KindRow label="Nuova versione" />
          <Text style={styles.title}>{current.title}</Text>
        </View>
      </View>
      <Text style={styles.hint}>
        {current.fileName} è stato sostituito su Drive. I marker flaggati restano visibili,
        gli altri vanno in Hide (storico).
      </Text>
      <Pressable
        onPress={() =>
          setKeepIds(allOn ? new Set() : new Set(markers.map((marker) => marker.id)))
        }
        hitSlop={layout.hitSlop}
      >
        <Text style={styles.link}>{allOn ? 'Deseleziona tutti' : 'Mantieni tutti'}</Text>
      </Pressable>
      <ScrollView contentContainerStyle={styles.scroll}>
        {markers.map((marker) => {
          const on = keepIds.has(marker.id);
          return (
            <Pressable key={marker.id} onPress={() => toggle(marker.id)} style={styles.row}>
              <View style={[styles.box, on && styles.boxOn]} />
              <View style={styles.meta}>
                <Text style={styles.rowTitle} numberOfLines={2}>
                  {marker.text || 'Senza testo'}
                </Text>
                <Text style={styles.rowMeta}>
                  {formatTimecode(marker.timestampMs)}
                  {marker.authorName ? ` · ${marker.authorName}` : ''}
                  {marker.hidden ? ' · già Hide' : ''}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
      <Pressable onPress={onApply} style={styles.send}>
        <Text style={styles.sendLabel}>Applica e continua</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 8,
    gap: 4,
  },
  back: { color: colors.textMuted, fontSize: 34, lineHeight: 36, width: 28, marginTop: -4 },
  title: { color: colors.text, fontSize: 22, fontWeight: '700' },
  hint: {
    paddingHorizontal: 20,
    marginBottom: 8,
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  link: {
    paddingHorizontal: 20,
    marginBottom: 8,
    color: colors.accent,
    fontSize: 14,
    fontWeight: '700',
  },
  scroll: { paddingHorizontal: 16, paddingBottom: 20 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
  },
  box: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border,
  },
  boxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  meta: { flex: 1, minWidth: 0 },
  rowTitle: { color: colors.text, fontSize: 15, fontWeight: '600' },
  rowMeta: { marginTop: 3, color: colors.textMuted, fontSize: 12 },
  send: {
    margin: 16,
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  sendLabel: { color: colors.text, fontSize: 16, fontWeight: '700' },
});
