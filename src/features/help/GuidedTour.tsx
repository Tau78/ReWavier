import { useEffect, useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { useHelpStore } from '../../store/helpStore';
import { colors, layout } from '../../theme/colors';
import { TOUR_STEPS } from './tourCopy';

export function GuidedTour() {
  const tourDone = useHelpStore((s) => s.tourDone);
  const tourVisible = useHelpStore((s) => s.tourVisible);
  const skipTour = useHelpStore((s) => s.skipTour);
  const completeTour = useHelpStore((s) => s.completeTour);
  const hideTour = useHelpStore((s) => s.hideTour);
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (tourVisible) {
      setStepIndex(0);
    }
  }, [tourVisible]);

  const step = TOUR_STEPS[stepIndex] ?? TOUR_STEPS[0];
  const last = stepIndex >= TOUR_STEPS.length - 1;

  const onCloseRequest = () => {
    if (tourDone) {
      hideTour();
      return;
    }
    skipTour();
  };

  const onNext = () => {
    if (last) {
      completeTour();
      return;
    }
    setStepIndex((current) => Math.min(current + 1, TOUR_STEPS.length - 1));
  };

  return (
    <Modal
      visible={tourVisible}
      transparent
      animationType="fade"
      onRequestClose={onCloseRequest}
    >
      <View style={styles.wrap} accessibilityViewIsModal>
        <View style={styles.overlay} />
        <View style={styles.card} accessibilityLabel={step.title}>
          {step.image ? (
            <Image
              source={step.image}
              style={styles.shot}
              resizeMode="contain"
              accessibilityLabel={`Foto: ${step.title}`}
            />
          ) : null}
          <Text style={styles.progress} accessibilityLabel={`Passo ${stepIndex + 1} di ${TOUR_STEPS.length}`}>
            {stepIndex + 1} di {TOUR_STEPS.length}
          </Text>
          <Text style={styles.title}>{step.title}</Text>
          <Text style={styles.body}>{step.body}</Text>
          <View style={styles.actions}>
            {last ? (
              <View />
            ) : (
              <Pressable
                onPress={skipTour}
                hitSlop={layout.hitSlop}
                accessibilityRole="button"
                accessibilityLabel="Salta la guida"
              >
                <Text style={styles.skip}>Salta</Text>
              </Pressable>
            )}
            <Pressable
              onPress={onNext}
              style={({ pressed }) => [styles.next, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={last ? 'Ho capito' : 'Avanti'}
            >
              <Text style={styles.nextLabel}>{last ? 'Ho capito' : 'Avanti'}</Text>
            </Pressable>
          </View>
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
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  shot: {
    width: '100%',
    height: 220,
    borderRadius: 12,
    backgroundColor: colors.background,
    marginBottom: 14,
  },
  progress: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  body: {
    marginTop: 8,
    color: colors.text,
    fontSize: 16,
    lineHeight: 22,
  },
  actions: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  skip: {
    color: colors.textMuted,
    fontSize: 16,
    fontWeight: '500',
  },
  next: {
    minWidth: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextLabel: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.85,
  },
});
