import { useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { formatTimecode } from '../../domain/models';
import { isNotificationUnread, type AppNotification } from '../../domain/notifications';
import { useNotificationStore } from '../../store/notificationStore';
import { usePlayerStore } from '../../store/playerStore';
import { colors, layout } from '../../theme/colors';
import { ensurePlayableAndOpen } from './openTrack';

function formatWhen(ms: number): string {
  const date = new Date(ms);
  const time = date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  const startToday = new Date();
  startToday.setHours(0, 0, 0, 0);
  const startDay = new Date(date);
  startDay.setHours(0, 0, 0, 0);
  const dayDiff = Math.round((startToday.getTime() - startDay.getTime()) / 86_400_000);
  if (dayDiff === 0) {
    return `oggi · ${time}`;
  }
  if (dayDiff === 1) {
    return `ieri · ${time}`;
  }
  const day = date.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
  return `${day} · ${time}`;
}

export function AlbumNotificationBell({
  albumId,
  queueIds,
}: {
  albumId: string;
  queueIds: string[];
}) {
  const [open, setOpen] = useState(false);
  const items = useNotificationStore((s) => s.items);
  const markRead = useNotificationStore((s) => s.markRead);
  const albumItems = useMemo(
    () => items.filter((item) => item.albumId === albumId),
    [items, albumId],
  );
  const unread = albumItems.filter(isNotificationUnread).length;

  const onOpenItem = (item: AppNotification) => {
    markRead(item.id);
    setOpen(false);
    void ensurePlayableAndOpen(item.trackId, queueIds, {
      autoPlay: true,
      startAtMs: item.timestampMs,
    }).then((opened) => {
      if (opened) {
        usePlayerStore.getState().setDockExpanded(true);
        return;
      }
      Alert.alert('Ascolto', 'Questo brano non è ancora arrivato. Riprova tra un attimo.');
    });
  };

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.bell, pressed && styles.bellPressed]}
        accessibilityRole="button"
        accessibilityLabel={
          unread > 0
            ? `Notifiche, ${unread === 1 ? '1 non letta' : `${unread} non lette`}`
            : 'Notifiche'
        }
      >
        <Text style={styles.bellGlyph}>N</Text>
        {unread > 0 ? <View style={styles.dot} accessibilityElementsHidden /> : null}
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityLabel="Chiudi" />
          <View style={styles.sheet} accessibilityLabel="Elenco notifiche">
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Notifiche</Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={layout.hitSlop}>
                <Text style={styles.sheetClose}>Chiudi</Text>
              </Pressable>
            </View>
            {albumItems.length === 0 ? (
              <Text style={styles.empty}>
                Quando qualcuno ti tagga con @ in un appunto, compare qui. Tocca e parti da quel punto.
              </Text>
            ) : (
              <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
                {albumItems.map((item) => {
                  const unreadItem = isNotificationUnread(item);
                  return (
                    <Pressable
                      key={item.id}
                      onPress={() => onOpenItem(item)}
                      style={({ pressed }) => [
                        styles.row,
                        unreadItem && styles.rowUnread,
                        pressed && styles.rowPressed,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`${item.fromAuthorName} ti ha taggato a ${formatTimecode(item.timestampMs)}. ${item.snippet}`}
                    >
                      {unreadItem ? <View style={styles.rowDot} /> : <View style={styles.rowDotSpacer} />}
                      <View style={styles.rowBody}>
                        <Text style={styles.rowWho} numberOfLines={1}>
                          {item.fromAuthorName} · {formatTimecode(item.timestampMs)}
                        </Text>
                        <Text style={styles.rowSnippet} numberOfLines={2}>
                          {item.snippet || 'Ti ha taggato in un appunto'}
                        </Text>
                        <Text style={styles.rowWhen}>{formatWhen(item.createdAt)}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  bell: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellPressed: {
    opacity: 0.7,
  },
  bellGlyph: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
  },
  dot: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.accent,
    borderWidth: 1.5,
    borderColor: colors.surface,
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-start',
    paddingTop: 72,
    paddingHorizontal: 16,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    maxHeight: '70%',
    overflow: 'hidden',
    zIndex: 2,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  sheetTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  sheetClose: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '600',
  },
  empty: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    padding: 16,
  },
  list: {
    maxHeight: 420,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: 8,
  },
  rowUnread: {
    backgroundColor: colors.surfaceRaised,
  },
  rowPressed: {
    opacity: 0.75,
  },
  rowDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
    backgroundColor: colors.accent,
  },
  rowDotSpacer: {
    width: 8,
    height: 8,
    marginTop: 6,
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  rowWho: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  rowSnippet: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  rowWhen: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: 11,
  },
});
