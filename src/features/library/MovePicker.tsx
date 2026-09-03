import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { Folder } from '../../domain/library';
import { colors } from '../../theme/colors';
import { PromptModal } from './PromptModal';

function folderPath(folders: Folder[], id: string): string {
  const parts: string[] = [];
  let current: string | null = id;
  const guard = new Set<string>();
  while (current && !guard.has(current)) {
    guard.add(current);
    const folder = folders.find((item) => item.id === current);
    if (!folder) {
      break;
    }
    parts.unshift(folder.name);
    current = folder.parentId;
  }
  return parts.join(' / ');
}

export function MovePicker({
  visible,
  title,
  folders,
  excludeIds,
  onClose,
  onSelect,
  onCreateFolder,
}: {
  visible: boolean;
  title: string;
  folders: Folder[];
  excludeIds?: Set<string>;
  onClose: () => void;
  onSelect: (folderId: string | null) => void;
  onCreateFolder?: (name: string) => void;
}) {
  const options = folders.filter((folder) => !excludeIds?.has(folder.id));
  const [naming, setNaming] = useState(false);

  useEffect(() => {
    if (!visible) {
      setNaming(false);
    }
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} />
      <View style={styles.card}>
        <Text style={styles.title}>{title}</Text>
        <ScrollView style={styles.list}>
          {onCreateFolder ? (
            <Pressable
              onPress={() => setNaming(true)}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <Text style={styles.create}>＋ Nuova playlist</Text>
              <Text style={styles.meta}>Crea e sposta qui</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => {
              onSelect(null);
              onClose();
            }}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <Text style={styles.name}>Libreria</Text>
            <Text style={styles.meta}>Nessuna playlist</Text>
          </Pressable>
          {options.map((folder) => (
            <Pressable
              key={folder.id}
              onPress={() => {
                onSelect(folder.id);
                onClose();
              }}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <Text style={styles.name}>{folderPath(folders, folder.id)}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <Pressable onPress={onClose} style={styles.cancelWrap}>
          <Text style={styles.cancel}>Annulla</Text>
        </Pressable>
      </View>
      <PromptModal
        visible={naming}
        title="Nuova playlist"
        placeholder="Nome playlist"
        confirmLabel="Crea e sposta"
        onCancel={() => setNaming(false)}
        onSubmit={(name) => {
          setNaming(false);
          onCreateFolder?.(name);
        }}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.overlay,
  },
  card: {
    position: 'absolute',
    left: 16,
    right: 16,
    top: 80,
    bottom: 80,
    backgroundColor: colors.surfaceRaised,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingTop: 16,
  },
  title: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
    paddingHorizontal: 18,
    marginBottom: 8,
  },
  list: {
    flex: 1,
  },
  row: {
    paddingHorizontal: 18,
    paddingVertical: 13,
  },
  pressed: {
    backgroundColor: colors.surface,
  },
  name: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  create: {
    color: colors.accent,
    fontSize: 16,
    fontWeight: '700',
  },
  meta: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: 12,
  },
  cancelWrap: {
    padding: 16,
    alignItems: 'center',
  },
  cancel: {
    color: colors.textMuted,
    fontSize: 16,
  },
});
