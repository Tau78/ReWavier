import { type ReactNode, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BAND_COLORS } from '../../domain/bandColors';
import { FAQ_URL } from '../../legal/urls';
import { isDemoUser } from '../../auth/demoAccount';
import { runGoogleDriveConnect, useGoogleDriveConnect } from '../../auth/useGoogleSignIn';
import { LinkedDevicesCard } from './LinkedDevicesCard';
import { createId } from '../../domain/library';
import { userHasUsage, userUsages, type UsageType } from '../../domain/session';
import type { RootStackParamList } from '../../navigation/types';
import { useSessionStore } from '../../store/sessionStore';
import { colors, DeepBackdrop, layout } from '../../theme';
import { KindRow } from '../../theme/graphics';
import { ColorSwatches, SavedBandRow } from '../auth/BandFields';

const USAGES: { id: UsageType; title: string }[] = [
  { id: 'band', title: 'Band' },
  { id: 'creator', title: 'Creator' },
  { id: 'teacher', title: 'Teacher' },
  { id: 'business', title: 'Business' },
];

type SectionId =
  | 'account'
  | 'profilo'
  | 'band'
  | 'file'
  | 'aiuto'
  | 'esci';

function SettingsSection({
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  title: string;
  summary?: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Pressable
        onPress={onToggle}
        style={({ pressed }) => [styles.sectionHeader, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={open ? `Chiudi ${title}` : `Apri ${title}`}
        android_ripple={{ color: '#FFFFFF18' }}
      >
        <View style={styles.sectionHeaderText}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {summary && !open ? (
            <Text style={styles.sectionSummary} numberOfLines={1}>
              {summary}
            </Text>
          ) : null}
        </View>
        <Text style={styles.chevron}>{open ? '˄' : '˅'}</Text>
      </Pressable>
      {open ? <View style={styles.sectionBody}>{children}</View> : null}
    </View>
  );
}

function InfoBlock({
  label,
  value,
  hint,
}: {
  label: string;
  value?: string;
  hint?: string;
}) {
  return (
    <View style={styles.block}>
      <Text style={styles.rowLabel}>{label}</Text>
      {value ? <Text style={styles.rowValue}>{value}</Text> : null}
      {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
    </View>
  );
}

function LinkRow({
  label,
  value,
  hint,
  onPress,
  accessibilityLabel,
  accessibilityRole = 'button',
}: {
  label: string;
  value: string;
  hint?: string;
  onPress: () => void;
  accessibilityLabel?: string;
  accessibilityRole?: 'button' | 'link';
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.block, styles.linkBlock, pressed && styles.pressed]}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel ?? label}
      android_ripple={{ color: '#FFFFFF18' }}
    >
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
      {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
    </Pressable>
  );
}

export function SettingsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'Settings'>>();
  const user = useSessionStore((s) => s.user);
  const logout = useSessionStore((s) => s.logout);
  const deleteAccount = useSessionStore((s) => s.deleteAccount);
  const setUsageTypes = useSessionStore((s) => s.setUsageTypes);
  const upsertBand = useSessionStore((s) => s.upsertBand);
  const removeBand = useSessionStore((s) => s.removeBand);
  const setActiveBand = useSessionStore((s) => s.setActiveBand);
  const version = Constants.expoConfig?.version ?? '1.0.0';
  const build = Constants.expoConfig?.ios?.buildNumber;
  const googleDrive = useGoogleDriveConnect();
  const driveLinked = user?.driveConnected === true && user.driveLink === 'google';
  const showBand = userHasUsage(user, 'band');
  const showDevices = !isDemoUser(user);

  const selected = userUsages(user);
  const bands = user?.bands ?? [];
  const lastColor = bands[bands.length - 1]?.color ?? user?.bandColor ?? BAND_COLORS[0];
  const [draftName, setDraftName] = useState('');
  const [draftColor, setDraftColor] = useState(lastColor);
  const [open, setOpen] = useState<Record<SectionId, boolean>>({
    account: true,
    profilo: false,
    band: false,
    file: false,
    aiuto: false,
    esci: true,
  });

  const toggle = (id: SectionId) => {
    setOpen((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const providerLabel =
    user?.provider === 'google'
      ? driveLinked
        ? 'Google · Drive collegato'
        : 'Google'
      : user?.provider === 'apple'
        ? 'Apple'
        : 'Email';

  const toggleUsage = (id: UsageType) => {
    const next = selected.includes(id)
      ? selected.filter((item) => item !== id)
      : [...selected, id];
    if (next.length === 0) {
      Alert.alert('Profilo', 'Tieni almeno un’opzione tra Band, Creator, Teacher e Business.');
      return;
    }
    setUsageTypes(next);
  };

  const addBand = () => {
    const name = draftName.trim();
    if (!name) {
      Alert.alert('Nome della band', 'Scrivi il nome prima di aggiungerla.');
      return;
    }
    upsertBand({ id: createId('band'), name, color: draftColor });
    setDraftName('');
    setDraftColor(draftColor);
  };

  const confirmLogout = () => {
    Alert.alert('Uscire?', 'Torni al login. I brani restano su questo telefono.', [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Esci',
        style: 'destructive',
        onPress: () => {
          void logout().catch((error) => {
            Alert.alert('Account', error instanceof Error ? error.message : 'Riprova');
          });
        },
      },
    ]);
  };

  const runDelete = (purgeLibrary: boolean) => {
    void deleteAccount({ purgeLibrary }).catch((error) => {
      Alert.alert('Account', error instanceof Error ? error.message : 'Riprova');
    });
  };

  /** Android drops a second Alert if shown in the same tick as the first. */
  const later = (fn: () => void) => {
    setTimeout(fn, 320);
  };

  const confirmDeleteAccount = () => {
    Alert.alert('Eliminare l’account?', 'Scegli cosa cancellare da questo telefono.', [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Solo accesso',
        onPress: () =>
          later(() =>
            Alert.alert(
              'Solo l’accesso',
              'Togli l’account da questo telefono. I brani restano nella cartella ReWavier in File.',
              [
                { text: 'Annulla', style: 'cancel' },
                {
                  text: 'Elimina accesso',
                  style: 'destructive',
                  onPress: () => runDelete(false),
                },
              ],
            ),
          ),
      },
      {
        text: 'Accesso e brani',
        style: 'destructive',
        onPress: () =>
          later(() =>
            Alert.alert(
              'Cancellare anche i brani?',
              'Si tolgono accesso, brani e appunti di questo account su questo telefono. Non si può annullare.',
              [
                { text: 'Annulla', style: 'cancel' },
                {
                  text: 'Cancella tutto',
                  style: 'destructive',
                  onPress: () => runDelete(true),
                },
              ],
            ),
          ),
      },
    ]);
  };

  const connectDrive = () => {
    void (async () => {
      try {
        const linked = await runGoogleDriveConnect(googleDrive);
        if (linked) {
          Alert.alert('Drive', 'Google Drive è collegato.');
        }
      } catch (error) {
        Alert.alert('Drive', error instanceof Error ? error.message : 'Riprova');
      }
    })();
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <DeepBackdrop />
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={layout.hitSlop}
          accessibilityRole="button"
          accessibilityLabel="Indietro"
        >
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <View>
          <KindRow label="App" />
          <Text style={styles.title}>Impostazioni</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <SettingsSection
          title="Account"
          summary={`${user?.displayName || 'Utente'} · ${providerLabel}`}
          open={open.account}
          onToggle={() => toggle('account')}
        >
          <InfoBlock
            label="Accesso"
            value={`${user?.displayName || 'Utente'}${user?.email ? ` · ${user.email}` : ''}`}
            hint={`${providerLabel}${
              user && userHasUsage(user, 'band')
                ? ` · marker ${user.markersEditableByOthers ? 'modificabili' : 'sola lettura'}`
                : ''
            }`}
          />
          <InfoBlock
            label="Album Drive"
            hint="Il permesso di scrivere in un album Drive arriva da come è stata condivisa quella cartella, non da un interruttore qui."
          />
          {user?.provider === 'google' && !driveLinked ? (
            <LinkRow
              label="Collega Google Drive"
              value="Per aprire le cartelle Drive e tenere i brani allineati."
              onPress={connectDrive}
            />
          ) : null}
        </SettingsSection>

        <SettingsSection
          title="Come usi ReWavier"
          summary={selected.map((id) => USAGES.find((u) => u.id === id)?.title).filter(Boolean).join(' · ')}
          open={open.profilo}
          onToggle={() => toggle('profilo')}
        >
          <InfoBlock
            label="Profilo"
            hint="Puoi cambiare queste scelte in qualsiasi momento."
          />
          <View style={styles.pills}>
            {USAGES.map((item) => {
              const on = selected.includes(item.id);
              return (
                <Pressable
                  key={item.id}
                  onPress={() => toggleUsage(item.id)}
                  style={[styles.pill, on && styles.pillOn]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[styles.pillLabel, on && styles.pillLabelOn]}>{item.title}</Text>
                </Pressable>
              );
            })}
          </View>
        </SettingsSection>

        {showBand ? (
          <SettingsSection
            title="Le tue band"
            summary={
              bands.length === 0
                ? 'Nessuna band'
                : bands.map((band) => band.name).join(' · ')
            }
            open={open.band}
            onToggle={() => toggle('band')}
          >
            <InfoBlock
              label="Band"
              hint="Tocca una band per usarla sui marker. Nome e colore si modificano qui."
            />
            {bands.map((band) => (
              <View key={band.id} style={styles.bandEdit}>
                <SavedBandRow
                  band={band}
                  active={user?.activeBandId === band.id}
                  onPress={() => setActiveBand(band.id)}
                  onDelete={() => {
                    Alert.alert('Eliminare la band?', band.name, [
                      { text: 'Annulla', style: 'cancel' },
                      {
                        text: 'Elimina',
                        style: 'destructive',
                        onPress: () => removeBand(band.id),
                      },
                    ]);
                  }}
                />
                <TextInput
                  style={styles.input}
                  value={band.name}
                  onChangeText={(name) => upsertBand({ ...band, name })}
                  placeholder="Nome della band"
                  placeholderTextColor={colors.textMuted}
                  selectionColor={colors.accent}
                />
                <ColorSwatches
                  value={band.color}
                  onChange={(color) => upsertBand({ ...band, color })}
                />
              </View>
            ))}
            <Text style={styles.addTitle}>Aggiungi un’altra band</Text>
            <TextInput
              style={styles.input}
              value={draftName}
              onChangeText={setDraftName}
              placeholder="Nome della band"
              placeholderTextColor={colors.textMuted}
              selectionColor={colors.accent}
            />
            <ColorSwatches value={draftColor} onChange={setDraftColor} />
            <Pressable onPress={addBand} style={styles.addBtn}>
              <Text style={styles.addBtnLabel}>Aggiungi band</Text>
            </Pressable>
          </SettingsSection>
        ) : null}

        <SettingsSection
          title="File e dispositivi"
          summary="Cartelle, album, altri telefoni"
          open={open.file}
          onToggle={() => toggle('file')}
        >
          {showDevices ? (
            <View style={styles.devicesWrap}>
              <LinkedDevicesCard embedded />
            </View>
          ) : null}
          <LinkRow
            label="Cartella dei brani"
            value="I brani stanno nella cartella Audio. La trovi in File, sul telefono."
            hint="Tocca per vedere dove sta la copia in nuvola."
            onPress={() =>
              Alert.alert(
                'Cartella dei brani',
                'Apri l’app File.\n\nSul telefono: Sul mio iPhone → ReWavier → Audio.\n\nSu iCloud: iCloud Drive → ReWavier.\n\nSu Drive: cartella ReWavier. Stesso Google sull’altro telefono, anche Android.',
              )
            }
          />
          <InfoBlock
            label="Album della band"
            value="Un album collegato a una cartella Drive della band si aggiorna quando apri l’album o torni nell’app. Trascina in basso per ricontrollare ora. Tocca ↓ per tenerlo anche sul telefono."
          />
        </SettingsSection>

        <SettingsSection
          title="Aiuto e informazioni"
          summary={`Guida · Privacy · v${version}`}
          open={open.aiuto}
          onToggle={() => toggle('aiuto')}
        >
          <LinkRow
            label="Guida"
            value="I passi per iniziare, con le foto."
            onPress={() => navigation.navigate('Help')}
            accessibilityLabel="Guida"
          />
          <LinkRow
            label="Domande frequenti"
            value="Apri la guida con le schermate"
            hint="Si apre nel browser. Stesse risposte del tour, più dettagli."
            onPress={() => {
              void WebBrowser.openBrowserAsync(FAQ_URL);
            }}
            accessibilityLabel="Domande frequenti"
            accessibilityRole="link"
          />
          <LinkRow
            label="Privacy"
            value="Nessun tracker · file solo sul dispositivo"
            onPress={() => navigation.navigate('Privacy')}
          />
          {__DEV__ ? (
            <LinkRow
              label="Mappa prodotto"
              value="Solo in sviluppo · 30 domande già salvate"
              onPress={() => navigation.navigate('Discovery')}
            />
          ) : null}
          <InfoBlock
            label="Versione"
            value={`ReWavier ${version}${build ? ` (${build})` : ''} · Expo SDK 54`}
          />
        </SettingsSection>

        <SettingsSection
          title="Esci e elimina"
          summary="Esci · Elimina account"
          open={open.esci}
          onToggle={() => toggle('esci')}
        >
          <Pressable
            onPress={confirmLogout}
            style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Esci"
            android_ripple={{ color: '#FFFFFF22' }}
          >
            <Text style={styles.actionBtnLabel}>Esci</Text>
            <Text style={styles.actionBtnHint}>Torni al login. I brani restano qui.</Text>
          </Pressable>
          <Pressable
            onPress={confirmDeleteAccount}
            style={({ pressed }) => [
              styles.actionBtn,
              styles.actionBtnDanger,
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Elimina account"
            android_ripple={{ color: '#FFFFFF22' }}
          >
            <Text style={[styles.actionBtnLabel, styles.danger]}>Elimina account</Text>
            <Text style={[styles.actionBtnHint, styles.danger]}>
              Solo accesso, oppure anche brani e appunti.
            </Text>
          </Pressable>
        </SettingsSection>
      </ScrollView>
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
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  scroll: {
    paddingBottom: 40,
    paddingTop: 4,
  },
  section: {
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
    minHeight: 56,
  },
  sectionHeaderText: {
    flex: 1,
    gap: 2,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  sectionSummary: {
    color: colors.textMuted,
    fontSize: 13,
  },
  chevron: {
    color: colors.textMuted,
    fontSize: 18,
    width: 22,
    textAlign: 'center',
  },
  sectionBody: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingBottom: 10,
  },
  block: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  linkBlock: {
    backgroundColor: colors.surfaceRaised,
    marginHorizontal: 10,
    marginTop: 8,
    borderRadius: 12,
  },
  devicesWrap: {
    marginTop: 4,
  },
  rowLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  rowValue: {
    marginTop: 4,
    color: colors.text,
    fontSize: 16,
  },
  rowHint: {
    marginTop: 4,
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  pill: {
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  pillOn: {
    borderColor: colors.accent,
    backgroundColor: '#3A2218',
  },
  pillLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  pillLabelOn: {
    color: colors.accent,
  },
  bandEdit: {
    marginTop: 8,
    marginHorizontal: 16,
    gap: 10,
  },
  input: {
    borderRadius: 12,
    backgroundColor: colors.surfaceRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 16,
  },
  addTitle: {
    marginTop: 14,
    marginBottom: 8,
    marginHorizontal: 16,
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  addBtn: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  addBtnLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  danger: {
    color: colors.danger,
  },
  actionBtn: {
    minHeight: 56,
    marginHorizontal: 10,
    marginTop: 8,
    borderRadius: 14,
    backgroundColor: colors.surfaceRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    justifyContent: 'center',
  },
  actionBtnDanger: {
    borderColor: colors.danger,
  },
  pressed: {
    opacity: 0.88,
  },
  actionBtnLabel: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  actionBtnHint: {
    marginTop: 4,
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
});
