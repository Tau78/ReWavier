import { useRef, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { RectButton, Swipeable } from 'react-native-gesture-handler';

import { colors } from '../../theme/colors';

function Action({
  label,
  tone,
  onPress,
}: {
  label: string;
  tone: 'danger' | 'accent' | 'neutral';
  onPress: () => void;
}) {
  const backgroundColor =
    tone === 'danger' ? colors.danger : tone === 'accent' ? colors.accent : colors.surfaceRaised;
  return (
    <RectButton style={[styles.action, { backgroundColor }]} onPress={onPress}>
      <Text style={styles.actionLabel}>{label}</Text>
    </RectButton>
  );
}

export function SwipeableRow({
  children,
  onDelete,
  onLeading,
  leadingLabel = 'Condividi',
}: {
  children: ReactNode;
  onDelete?: () => void;
  onLeading?: () => void;
  leadingLabel?: string;
}) {
  const ref = useRef<Swipeable>(null);
  const close = () => ref.current?.close();

  return (
    <Swipeable
      ref={ref}
      overshootLeft={false}
      overshootRight={false}
      friction={2}
      rightThreshold={40}
      leftThreshold={40}
      renderRightActions={
        onDelete
          ? () => (
              <View style={styles.actions}>
                <Action
                  label="Elimina"
                  tone="danger"
                  onPress={() => {
                    close();
                    onDelete();
                  }}
                />
              </View>
            )
          : undefined
      }
      renderLeftActions={
        onLeading
          ? () => (
              <View style={styles.actions}>
                <Action
                  label={leadingLabel}
                  tone="accent"
                  onPress={() => {
                    close();
                    onLeading();
                  }}
                />
              </View>
            )
          : undefined
      }
    >
      {children}
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
  },
  action: {
    width: 88,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
});
