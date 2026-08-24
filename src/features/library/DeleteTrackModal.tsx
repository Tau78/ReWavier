import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { colors, layout } from '../../theme/colors';

export function DeleteTrackModal({
  visible,
  title,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  title: string;
  onCancel: () => void;
  onConfirm: (deleteFromDevice: boolean) => void;
}) {
  const [deleteFromDevice, setDeleteFromDevice] = useState(false);

  useEffect(() => {
    if (visible) {
      setDeleteFromDevice(false);
    }
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.overlay} onPress={onCancel} />
      <View style={styles.wrap} pointerEvents="box-none">
        <View style={styles.card}>
          <Text style={styles.title}>Togliere questa traccia?</Text>
          {title ? (
            <Text style={styles.name} numberOfLines={2}>
              {title}
            </Text>
          ) : null}
          <Text style={styles.hint}>
            {deleteFromDevice
              ? 'Scompare dalla libreria e il file viene cancellato dal telefono. Da qui non si recupera.'
              : 'Scompare dalla libreria. Il file resta sul telefono, nella cartella di ReWavier.'}
          </Text>

          <Pressable
            onPress={() => setDeleteFromDevice((value) => !value)}
            style={styles.flagRow}
            accessibilityRole="switch"
            accessibilityState={{ checked: deleteFromDevice }}
            accessibilityLabel="Elimina anche il file dal telefono"
          >
            <Text style={styles.flagLabel}>Elimina anche il file dal telefono</Text>
            <Switch
              value={deleteFromDevice}
              onValueChange={setDeleteFromDevice}
              trackColor={{ false: colors.border, true: colors.accent }}
              thumbColor={colors.text}
              ios_backgroundColor={colors.border}
            />
          </Pressable>

          <View style={styles.actions}>
            <Pressable onPress={onCancel} hitSlop={layout.hitSlop} accessibilityRole="button">
              <Text style={styles.cancel}>Annulla</Text>
            </Pressable>
            <Pressable
              onPress={() => onConfirm(deleteFromDevice)}
              accessibilityRole="button"
              accessibilityLabel="Togli traccia"
              style={styles.ok}
            >
              <Text style={styles.okLabel}>Togli</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlay,
  },
  wrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  card: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 20,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  name: {
    marginTop: 6,
    color: colors.textMuted,
    fontSize: 15,
  },
  hint: {
    marginTop: 12,
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  flagRow: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  flagLabel: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  actions: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cancel: {
    color: colors.textMuted,
    fontSize: 16,
    fontWeight: '500',
  },
  ok: {
    backgroundColor: colors.danger,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  okLabel: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
});
