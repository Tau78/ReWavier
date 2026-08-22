import { useEffect } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { runCloudSync } from '../../cloud/syncEngine';
import type { LinkedDevice, LinkedVia } from '../../cloud/deviceSync/deviceRegistry';
import { useDeviceStore } from '../../store/deviceStore';
import { useSyncStore } from '../../store/syncStore';
import { colors } from '../../theme/colors';

function viaLabel(via: LinkedVia[]): string {
  const icloud = via.includes('icloud');
  const drive = via.includes('drive');
  if (icloud && drive) {
    return 'iCloud e Drive';
  }
  if (icloud) {
    return 'iCloud';
  }
  if (drive) {
    return 'Drive';
  }
  return 'In attesa';
}

function formatLastSeen(ms: number): string {
  if (!ms) {
    return 'Mai allineato';
  }
  const delta = Date.now() - ms;
  if (delta < 60_000) {
    return 'Adesso';
  }
  if (delta < 3_600_000) {
    const mins = Math.max(1, Math.round(delta / 60_000));
    return `${mins} min fa`;
  }
  if (delta < 86_400_000) {
    const hours = Math.max(1, Math.round(delta / 3_600_000));
    return `${hours} ${hours === 1 ? 'ora' : 'ore'} fa`;
  }
  if (delta < 172_800_000) {
    return 'Ieri';
  }
  return new Date(ms).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
}

function DeviceGlyph({ kind }: { kind: LinkedDevice['kind'] }) {
  const letter = kind === 'android' ? 'A' : kind === 'ipad' ? 'iP' : 'i';
  return (
    <View style={styles.glyph} accessibilityElementsHidden>
      <Text style={styles.glyphLetter}>{letter}</Text>
    </View>
  );
}

function DeviceRow({
  device,
  badge,
  onPress,
}: {
  device: LinkedDevice;
  badge?: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.row, pressed && onPress ? styles.rowPressed : null]}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${device.name}. ${badge ?? formatLastSeen(device.lastSeenAt)}`}
    >
      <DeviceGlyph kind={device.kind} />
      <View style={styles.rowText}>
        <Text style={styles.rowName} numberOfLines={1}>
          {device.name}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {viaLabel(device.via)} · {formatLastSeen(device.lastSeenAt)}
        </Text>
      </View>
      {badge ? <Text style={styles.badge}>{badge}</Text> : <Text style={styles.chevron}>›</Text>}
    </Pressable>
  );
}

export function LinkedDevicesCard() {
  const selfId = useDeviceStore((s) => s.selfId);
  const devices = useDeviceStore((s) => s.devices);
  const unlinked = useDeviceStore((s) => s.unlinked);
  const loading = useDeviceStore((s) => s.loading);
  const refresh = useDeviceStore((s) => s.refresh);
  const unlink = useDeviceStore((s) => s.unlink);
  const relink = useDeviceStore((s) => s.relink);
  const syncStatus = useSyncStore((s) => s.status);
  const syncMessage = useSyncStore((s) => s.message);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const self = devices.find((device) => device.id === selfId);
  const others = devices.filter((device) => device.id !== selfId);

  const confirmUnlink = (device: LinkedDevice, isSelf: boolean) => {
    Alert.alert(
      isSelf ? 'Scollegare questo telefono?' : `Scollegare ${device.name}?`,
      isSelf
        ? 'Questo telefono smette di allineare i brani con gli altri. Puoi collegarlo di nuovo quando vuoi.'
        : 'Quel telefono non riceverà più i brani da qui. Potrai collegarlo di nuovo allineando da lì.',
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Scollega',
          style: 'destructive',
          onPress: () => {
            void unlink(device.id).catch((error) => {
              Alert.alert(
                'Scollega',
                error instanceof Error ? error.message : 'Non sono riuscito a scollegarlo.',
              );
            });
          },
        },
      ],
    );
  };

  const onRelink = () => {
    void relink()
      .then(() => runCloudSync())
      .catch((error) => {
        Alert.alert(
          'Collega',
          error instanceof Error ? error.message : 'Non sono riuscito a collegarlo.',
        );
      });
  };

  return (
    <View style={styles.card}>
      <Text style={styles.label}>Altri telefoni</Text>
      <Text style={styles.hint}>
        I telefoni che allineano i tuoi brani. Tocca uno per scollegarlo.
      </Text>

      {unlinked ? (
        <View style={styles.emptyBox}>
          <Text style={styles.empty}>Questo telefono è scollegato.</Text>
          <Pressable onPress={onRelink} style={styles.action}>
            <Text style={styles.actionLabel}>Collega di nuovo</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {self ? (
            <DeviceRow
              device={self}
              badge="Questo telefono"
              onPress={() => confirmUnlink(self, true)}
            />
          ) : (
            <View style={styles.emptyBox}>
              <Text style={styles.empty}>
                {loading ? 'Cerco i telefoni collegati…' : 'Questo telefono non è ancora in lista.'}
              </Text>
            </View>
          )}

          {others.length > 0 ? (
            <>
              <Text style={styles.section}>Collegati</Text>
              {others.map((device) => (
                <DeviceRow
                  key={device.id}
                  device={device}
                  onPress={() => confirmUnlink(device, false)}
                />
              ))}
            </>
          ) : (
            <Text style={styles.emptyOthers}>
              Nessun altro telefono. Tocca Allinea ora qui e sull’altro telefono.
            </Text>
          )}

          <Pressable
            onPress={() => {
              void runCloudSync().then(() => refresh());
            }}
            style={styles.action}
          >
            <Text style={styles.actionLabel}>
              {syncStatus === 'syncing' ? 'Allineo…' : 'Allinea ora'}
            </Text>
          </Pressable>
        </>
      )}

      {syncMessage ? <Text style={styles.status}>{syncMessage}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  label: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  hint: {
    marginTop: 4,
    marginBottom: 8,
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  section: {
    marginTop: 14,
    marginBottom: 4,
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  rowPressed: {
    opacity: 0.7,
  },
  glyph: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyphLetter: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  rowName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  rowMeta: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: 13,
  },
  badge: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '700',
  },
  chevron: {
    color: colors.textMuted,
    fontSize: 22,
    lineHeight: 24,
  },
  emptyBox: {
    paddingTop: 10,
    paddingBottom: 4,
  },
  empty: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 20,
  },
  emptyOthers: {
    marginTop: 10,
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  action: {
    marginTop: 14,
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  actionLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  status: {
    marginTop: 10,
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
});
