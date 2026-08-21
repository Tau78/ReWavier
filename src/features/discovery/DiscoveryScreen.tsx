import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useDiscoveryStore } from '../../store/discoveryStore';
import { colors, layout } from '../../theme/colors';
import {
  AREA_LABEL,
  DISCOVERY_QUESTIONS,
  type DiscoveryArea,
} from './questions';

const AREA_COLOR: Record<DiscoveryArea, string> = {
  buie: colors.waveform,
  funzioni: colors.accent,
  bug: colors.danger,
  stub: colors.textMuted,
};

export function DiscoveryScreen() {
  const navigation = useNavigation();
  const index = useDiscoveryStore((s) => s.index);
  const answers = useDiscoveryStore((s) => s.answers);
  const answer = useDiscoveryStore((s) => s.answer);
  const back = useDiscoveryStore((s) => s.back);
  const reset = useDiscoveryStore((s) => s.reset);

  const done = index >= DISCOVERY_QUESTIONS.length;
  const question = DISCOVERY_QUESTIONS[index];
  const progress = done
    ? 1
    : index / DISCOVERY_QUESTIONS.length;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={layout.hitSlop}
          accessibilityRole="button"
          accessibilityLabel="Indietro"
        >
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.kind}>Tap to answer</Text>
          <Text style={styles.title}>30 domande</Text>
        </View>
        {index > 0 ? (
          <Pressable onPress={back} hitSlop={layout.hitSlop}>
            <Text style={styles.prev}>Precedente</Text>
          </Pressable>
        ) : (
          <View style={styles.prevSpacer} />
        )}
      </View>

      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${Math.round(progress * 100)}%` }]} />
      </View>
      <Text style={styles.counter}>
        {done ? 'Completato' : `${index + 1} / ${DISCOVERY_QUESTIONS.length}`}
      </Text>

      {done ? (
        <ScrollView contentContainerStyle={styles.summary}>
          <Text style={styles.doneTitle}>Mappa aggiornata</Text>
          <Text style={styles.doneLead}>
            Decisioni del 21 agosto 2026. Gli agenti le usano e non rifanno il form.
          </Text>
          {DISCOVERY_QUESTIONS.map((item) => {
            const picked = item.options.find((option) => option.id === answers[item.id]);
            return (
              <View key={item.id} style={styles.summaryRow}>
                <Text style={[styles.pill, { color: AREA_COLOR[item.area] }]}>
                  {AREA_LABEL[item.area]}
                </Text>
                <Text style={styles.summaryQ}>{item.prompt}</Text>
                <Text style={styles.summaryA}>{picked?.label ?? '—'}</Text>
              </View>
            );
          })}
          <Pressable onPress={reset} style={styles.reset}>
            <Text style={styles.resetLabel}>Ricomincia</Text>
          </Pressable>
        </ScrollView>
      ) : (
        <View style={styles.card}>
          <Text style={[styles.pill, { color: AREA_COLOR[question.area] }]}>
            {AREA_LABEL[question.area]}
          </Text>
          <Text style={styles.prompt}>{question.prompt}</Text>
          <View style={styles.options}>
            {question.options.map((option) => {
              const selected = answers[question.id] === option.id;
              return (
                <Pressable
                  key={option.id}
                  onPress={() => answer(question.id, option.id)}
                  style={({ pressed }) => [
                    styles.option,
                    selected && styles.optionOn,
                    pressed && styles.optionPressed,
                  ]}
                >
                  <Text style={[styles.optionLabel, selected && styles.optionLabelOn]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 8,
    gap: 4,
  },
  back: {
    color: colors.textMuted,
    fontSize: 34,
    lineHeight: 36,
    width: 28,
    marginTop: -4,
  },
  headerText: {
    flex: 1,
  },
  kind: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  prev: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 16,
  },
  prevSpacer: {
    width: 72,
  },
  barTrack: {
    height: 4,
    marginHorizontal: 20,
    borderRadius: 2,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  barFill: {
    height: 4,
    backgroundColor: colors.accent,
  },
  counter: {
    marginTop: 8,
    marginHorizontal: 20,
    color: colors.textMuted,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  card: {
    margin: 16,
    padding: 20,
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  pill: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  prompt: {
    marginTop: 12,
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.4,
    lineHeight: 28,
  },
  options: {
    marginTop: 22,
    gap: 10,
  },
  option: {
    minHeight: 56,
    borderRadius: 14,
    backgroundColor: colors.surfaceRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  optionOn: {
    borderColor: colors.accent,
    backgroundColor: '#3A2218',
  },
  optionPressed: {
    opacity: 0.8,
  },
  optionLabel: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  optionLabelOn: {
    color: colors.accent,
  },
  summary: {
    paddingHorizontal: 16,
    paddingBottom: 36,
    paddingTop: 8,
  },
  doneTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
  },
  doneLead: {
    marginTop: 6,
    marginBottom: 16,
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  summaryRow: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 8,
  },
  summaryQ: {
    marginTop: 4,
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  summaryA: {
    marginTop: 4,
    color: colors.accent,
    fontSize: 14,
  },
  reset: {
    marginTop: 12,
    alignItems: 'center',
    paddingVertical: 14,
  },
  resetLabel: {
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: '600',
  },
});
