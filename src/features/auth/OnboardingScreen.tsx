import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BAND_COLORS } from '../../domain/bandColors';
import { createId } from '../../domain/library';
import type { UsageType, UserBand } from '../../domain/session';
import { useSessionStore } from '../../store/sessionStore';
import { colors, layout } from '../../theme/colors';
import { KindRow, ScreenAura } from '../../theme/graphics';
import { BandDraftFields, SavedBandRow } from './BandFields';

const USAGES: { id: UsageType; title: string; body: string }[] = [
  { id: 'band', title: 'Band', body: 'Album condivisi su Drive. Con Google, Drive è già collegato.' },
  { id: 'creator', title: 'Creator', body: 'Lavori sui tuoi brani. Con Google, Drive è già collegato.' },
  { id: 'teacher', title: 'Teacher', body: 'Lezioni e cartelle per studente. Con Google, Drive è già collegato.' },
];

export function OnboardingScreen() {
  const user = useSessionStore((s) => s.user);
  const completeOnboarding = useSessionStore((s) => s.completeOnboarding);
  const connectDrive = useSessionStore((s) => s.connectDrive);

  const [step, setStep] = useState<'roles' | 'band'>('roles');
  const [usageTypes, setUsageTypes] = useState<UsageType[]>([]);
  const [bands, setBands] = useState<UserBand[]>([]);
  const [draftName, setDraftName] = useState('');
  const [draftColor, setDraftColor] = useState<string>(BAND_COLORS[0]);
  const [editable, setEditable] = useState(false);

  const driveOk = user?.driveConnected === true && user.driveLink != null;
  const wantsBand = usageTypes.includes('band');
  const canAdvance = usageTypes.length > 0;
  const draftReady = draftName.trim().length > 0 && draftColor != null;
  const canFinishBand = bands.length > 0 || draftReady;

  const toggleUsage = (id: UsageType) => {
    setUsageTypes((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  const commitDraft = (): UserBand[] | null => {
    const name = draftName.trim();
    if (!name) {
      return bands.length > 0 ? bands : null;
    }
    const next: UserBand = { id: createId('band'), name, color: draftColor };
    return [...bands, next];
  };

  const addAnotherBand = () => {
    if (!draftReady) {
      Alert.alert('Nome della band', 'Scrivi il nome, poi puoi aggiungerne un’altra.');
      return;
    }
    const next = commitDraft();
    if (!next) {
      return;
    }
    setBands(next);
    setDraftName('');
    setDraftColor(draftColor);
  };

  const onFilesDrive = () => {
    connectDrive('files');
    Alert.alert(
      'Drive collegato da File',
      'In Libreria → Album importa una cartella Drive. I file restano in nuvola, in app ascolti dalla cache.',
    );
  };

  const finish = (includeBand: boolean) => {
    const nextBands = includeBand ? commitDraft() ?? [] : [];
    if (includeBand && nextBands.length === 0) {
      Alert.alert('Band', 'Aggiungi almeno il nome di una band.');
      return;
    }
    try {
      completeOnboarding({
        usageTypes,
        bands: nextBands,
        driveLink: includeBand ? user?.driveLink ?? null : user?.driveLink,
        markersEditableByOthers: includeBand ? editable : true,
      });
    } catch (error) {
      Alert.alert('Wizard', error instanceof Error ? error.message : 'Riprova');
    }
  };

  const onAvanti = () => {
    if (!canAdvance) {
      return;
    }
    if (wantsBand) {
      setStep('band');
      return;
    }
    finish(false);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScreenAura />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <KindRow label="Primo avvio" />
        <Text style={styles.title}>
          {step === 'roles' ? 'Come usi ReWavier?' : 'Le tue band'}
        </Text>
        <Text style={styles.sub}>
          {step === 'roles'
            ? `Ciao ${user?.displayName || ''}. Scegli una o più opzioni, poi Avanti.`
            : 'Prima il nome, poi il colore. Puoi aggiungerne altre: il colore parte da quello appena scelto.'}
        </Text>

        {step === 'roles'
          ? USAGES.map((item) => {
              const selected = usageTypes.includes(item.id);
              return (
                <Pressable
                  key={item.id}
                  onPress={() => toggleUsage(item.id)}
                  style={[styles.card, selected && styles.cardOn]}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                >
                  <View style={styles.cardTop}>
                    <Text style={styles.cardTitle}>{item.title}</Text>
                    <View style={[styles.check, selected && styles.checkOn]}>
                      {selected ? <Text style={styles.checkGlyph}>✓</Text> : null}
                    </View>
                  </View>
                  <Text style={styles.cardBody}>{item.body}</Text>
                </Pressable>
              );
            })
          : null}

        {step === 'band' ? (
          <>
            {bands.length > 0 ? (
              <View style={styles.block}>
                {bands.map((band) => (
                  <SavedBandRow
                    key={band.id}
                    band={band}
                    onDelete={() => setBands((list) => list.filter((item) => item.id !== band.id))}
                  />
                ))}
              </View>
            ) : null}

            <BandDraftFields
              name={draftName}
              color={draftColor}
              onName={setDraftName}
              onColor={setDraftColor}
            />

            <Pressable onPress={addAnotherBand} hitSlop={layout.hitSlop}>
              <Text style={styles.add}>＋ Aggiungi un’altra band</Text>
            </Pressable>

            <View style={styles.block}>
              <Text style={styles.blockTitle}>Drive</Text>
              {user?.provider === 'google' || (driveOk && user?.driveLink === 'google') ? (
                <Text style={styles.ok}>Già collegato col login Google</Text>
              ) : driveOk ? (
                <Text style={styles.ok}>Collegato · File</Text>
              ) : (
                <>
                  <Text style={styles.blockBody}>
                    Sei entrato senza Google. Puoi collegare Drive da File, oppure tornare al login
                    e usare Continua con Google.
                  </Text>
                  <Pressable onPress={onFilesDrive} style={styles.google}>
                    <Text style={styles.googleLabel}>Collega da File</Text>
                  </Pressable>
                </>
              )}
            </View>

            <View style={styles.block}>
              <Text style={styles.blockTitle}>I tuoi marker condivisi</Text>
              <Pressable
                onPress={() => setEditable(false)}
                style={[styles.choice, !editable && styles.cardOn]}
              >
                <Text style={styles.cardTitle}>Sola lettura</Text>
                <Text style={styles.cardBody}>I compagni li vedono, non li modificano.</Text>
              </Pressable>
              <Pressable
                onPress={() => setEditable(true)}
                style={[styles.choice, editable && styles.cardOn]}
              >
                <Text style={styles.cardTitle}>Modificabili</Text>
                <Text style={styles.cardBody}>Anche gli altri membri possono editarli.</Text>
              </Pressable>
            </View>
          </>
        ) : null}

        {step === 'roles' ? (
          <Pressable
            onPress={onAvanti}
            disabled={!canAdvance}
            style={[styles.primary, !canAdvance && styles.primaryOff]}
          >
            <Text style={styles.primaryLabel}>{wantsBand ? 'Avanti' : 'Entra in libreria'}</Text>
          </Pressable>
        ) : (
          <>
            <Pressable
              onPress={() => finish(true)}
              disabled={!canFinishBand}
              style={[styles.primary, !canFinishBand && styles.primaryOff]}
            >
              <Text style={styles.primaryLabel}>Entra in libreria</Text>
            </Pressable>
            <Pressable onPress={() => setStep('roles')} hitSlop={layout.hitSlop}>
              <Text style={styles.link}>Indietro</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
    backgroundColor: colors.background,
  },
  title: {
    marginTop: 6,
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  sub: {
    marginTop: 8,
    marginBottom: 20,
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 21,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 10,
  },
  cardOn: {
    borderColor: colors.accent,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  check: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  checkGlyph: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  cardTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  cardBody: {
    marginTop: 4,
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  block: {
    marginTop: 16,
  },
  blockTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  blockBody: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  add: {
    marginTop: 16,
    color: colors.accent,
    fontSize: 15,
    fontWeight: '700',
  },
  google: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
  },
  googleLabel: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  link: {
    marginTop: 12,
    color: colors.accent,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  ok: {
    marginTop: 4,
    color: '#34C759',
    fontSize: 14,
    fontWeight: '600',
  },
  choice: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 8,
  },
  primary: {
    marginTop: 24,
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryOff: {
    opacity: 0.4,
  },
  primaryLabel: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
});
