import type { JSX } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, layout } from '../../theme/colors';
import type { WhatsNewItem } from './whatsNew';

export function WhatsNewModal(props: {
  visible: boolean;
  items: WhatsNewItem[];
  onDismiss: () => void;
}): JSX.Element {
  const { visible, items, onDismiss } = props;
  const open = visible && items.length > 0;

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <View style={styles.wrap} accessibilityViewIsModal>
        <Pressable
          style={styles.overlay}
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Chiudi"
        />
        <View style={styles.card} accessibilityLabel="Cosa c’è di nuovo">
          <Text style={styles.title}>Cosa c’è di nuovo</Text>
          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={items.length > 3}
          >
            {items.map((item, index) => (
              <View key={`${item.title}-${index}`} style={styles.item}>
                <Text style={styles.itemTitle}>{item.title}</Text>
                <Text style={styles.itemBody}>{item.body}</Text>
              </View>
            ))}
          </ScrollView>
          <Pressable
            onPress={onDismiss}
            hitSlop={layout.hitSlop}
            style={({ pressed }) => [styles.done, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Ho visto"
          >
            <Text style={styles.doneLabel}>Ho visto</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlay,
  },
  card: {
    zIndex: 1,
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  list: {
    marginTop: 12,
    maxHeight: 360,
  },
  listContent: {
    paddingBottom: 4,
  },
  item: {
    marginBottom: 16,
  },
  itemTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  itemBody: {
    marginTop: 6,
    color: colors.text,
    fontSize: 16,
    lineHeight: 22,
  },
  done: {
    marginTop: 8,
    minHeight: 44,
    borderRadius: 22,
    backgroundColor: colors.accent,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneLabel: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.85,
  },
});
