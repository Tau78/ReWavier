import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Constants from 'expo-constants';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BAND_COLORS } from '../../domain/bandColors';
import { LinkedDevicesCard } from './LinkedDevicesCard';
import { createId } from '../../domain/library';
import { userHasUsage, userUsages, type UsageType } from '../../domain/session';
import type { RootStackParamList } from '../../navigation/types';
import { useSessionStore } from '../../store/sessionStore';
import { colors, layout } from '../../theme/colors';
import { KindRow } from '../../theme/graphics';
import { ColorSwatches, SavedBandRow } from '../auth/BandFields';

const USAGES: { id: UsageType; title: string }[] = [
  { id: 'band', title: 'Band' },
  { id: 'creator', title: 'Creator' },
  { id: 'teacher', title: 'Teacher' },
];

export function SettingsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'Settings'>>();
  const user = useSessionStore((s) => s.user);
  const logout = useSessionStore((s) => s.logout);
  const setUsageTypes = useSessionStore((s) => s.setUsageTypes);
  const upsertBand = useSessionStore((s) => s.upsertBand);
  const removeBand = useSessionStore((s) => s.removeBand);
  const setActiveBand = useSessionStore((s) => s.setActiveBand);
  const version = Constants.expoConfig?.version ?? '1.0.0';
  const build = Constants.expoConfig?.ios?.buildNumber;

  const selected = userUsages(user);
  const bands = user?.bands ?? [];
  const lastColor = bands[bands.length - 1]?.color ?? user?.bandColor ?? BAND_COLORS[0];
  const [draftName, setDraftName] = useState('');
  const [draftColor, setDraftColor] = useState(lastColor);

  const toggleUsage = (id: UsageType) => {
    const next = selected.includes(id)
      ? selected.filter((item) => item !== id)
      : [...selected, id];
    if (next.length === 0) {
      Alert.alert('Profilo', 'Tieni almeno un’opzione tra Band, Creator e Teacher.');
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
        <View>
          <KindRow label="App" />
          <Text style={styles.title}>Impostazioni</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.rowLabel}>Account</Text>
          <Text style={styles.rowValue}>
            {user?.displayName || 'Utente'}
            {user?.email ? ` · ${user.email}` : ''}
          </Text>
          <Text style={styles.rowHint}>
            {user?.provider === 'google'
              ? 'Google · Drive già collegato'
              : user?.provider === 'apple'
                ? 'Apple'
                : 'Email'}
            {user && userHasUsage(user, 'band')
              ? ` · marker ${user.markersEditableByOthers ? 'modificabili' : 'sola lettura'}`
              : ''}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.rowLabel}>Come usi ReWavier</Text>
          <Text style={styles.rowHint}>Puoi cambiare queste scelte in qualsiasi momento.</Text>
          <View style={styles.pills}>
            {USAGES.map((item) => {
              const on = selected.includes(item.id);
              return (
                <Pressable
                  key={item.id}
                  onPress={() => toggleUsage(item.id)}
                  style={[styles.pill, on && styles.pillOn]}
                >
                  <Text style={[styles.pillLabel, on && styles.pillLabelOn]}>{item.title}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {userHasUsage(user, 'band') ? (
          <View style={styles.card}>
            <Text style={styles.rowLabel}>Le tue band</Text>
            <Text style={styles.rowHint}>
              Tocca una band per usarla sui marker. Nome e colore si modificano qui.
            </Text>
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
          </View>
        ) : null}

        <LinkedDevicesCard />
        <Pressable
          onPress={() =>
            Alert.alert(
              'Cartella dei brani',
              'Apri l’app File.\n\nSul telefono: Sul mio iPhone → ReWavier → Audio.\n\nSu iCloud: iCloud Drive → ReWavier.\n\nSu Drive: cartella ReWavier. Stesso Google sull’altro telefono, anche Android.',
            )
          }
          style={styles.card}
        >
          <Text style={styles.rowLabel}>Cartella dei brani</Text>
          <Text style={styles.rowValue}>
            I brani stanno nella cartella Audio. La trovi in File, sul telefono.
          </Text>
          <Text style={styles.rowHint}>Tocca per vedere dove sta la copia in nuvola.</Text>
        </Pressable>
        <View style={styles.card}>
          <Text style={styles.rowLabel}>Album della band</Text>
          <Text style={styles.rowValue}>
            Un album collegato a una cartella Drive della band si aggiorna da solo. Tocca ↓ per
            tenerlo anche sul telefono.
          </Text>
        </View>
        <Pressable onPress={() => navigation.navigate('Privacy')} style={styles.card}>
          <Text style={styles.rowLabel}>Privacy</Text>
          <Text style={styles.rowValue}>Nessun tracker · file solo sul dispositivo</Text>
        </Pressable>
        {__DEV__ ? (
          <Pressable onPress={() => navigation.navigate('Discovery')} style={styles.card}>
            <Text style={styles.rowLabel}>Mappa prodotto</Text>
            <Text style={styles.rowValue}>Solo in sviluppo · 30 domande già salvate</Text>
          </Pressable>
        ) : null}
        <Pressable onPress={() => void logout()} style={styles.card}>
          <Text style={styles.rowLabel}>Esci</Text>
          <Text style={styles.rowValue}>Torna al login</Text>
        </Pressable>
        <View style={styles.card}>
          <Text style={styles.rowLabel}>Versione</Text>
          <Text style={styles.rowValue}>
            ReWavier {version}
            {build ? ` (${build})` : ''} · Expo SDK 54
          </Text>
        </View>
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
    paddingBottom: 36,
  },
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
    marginTop: 12,
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
    marginTop: 14,
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
    marginTop: 18,
    marginBottom: 8,
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  addBtn: {
    marginTop: 12,
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
});
