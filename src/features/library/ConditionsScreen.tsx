import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  createId,
  trackMatchesSmart,
  type SmartCondition,
} from '../../domain/library';
import type { RootStackParamList } from '../../navigation/types';
import { useLibraryStore } from '../../store/libraryStore';
import { colors, layout } from '../../theme/colors';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Conditions'>;
type Route = RouteProp<RootStackParamList, 'Conditions'>;

function newMinNotes(): SmartCondition {
  return { id: createId('c'), type: 'minNotes', value: 1 };
}

function newTitleContains(): SmartCondition {
  return { id: createId('c'), type: 'titleContains', value: '' };
}

export function ConditionsScreen() {
  const navigation = useNavigation<Nav>();
  const existingId = useRoute<Route>().params?.id;
  const existing = useLibraryStore((s) =>
    existingId ? s.smartPlaylists.find((item) => item.id === existingId) : undefined,
  );
  const createSmartPlaylist = useLibraryStore((s) => s.createSmartPlaylist);
  const updateSmartPlaylist = useLibraryStore((s) => s.updateSmartPlaylist);
  const deleteSmartPlaylist = useLibraryStore((s) => s.deleteSmartPlaylist);

  const [name, setName] = useState(existing?.name ?? '');
  const [conditions, setConditions] = useState<SmartCondition[]>(
    existing?.conditions ?? [newMinNotes()],
  );

  const canSave = name.trim().length > 0 && conditions.length > 0;

  const tracks = useLibraryStore((s) => s.tracks);
  const markersByTrackId = useLibraryStore((s) => s.markersByTrackId);
  const preview = useMemo(
    () =>
      tracks.filter((track) =>
        trackMatchesSmart(track, markersByTrackId[track.id] ?? [], {
          id: existing?.id ?? 'draft',
          name: name.trim() || 'Bozza',
          conditions,
        }),
      ).length,
    [tracks, markersByTrackId, conditions, name, existing?.id],
  );

  const setCondition = (id: string, patch: Partial<SmartCondition>) => {
    setConditions((list) =>
      list.map((item) => (item.id === id ? ({ ...item, ...patch } as SmartCondition) : item)),
    );
  };

  const save = () => {
    if (!canSave) {
      return;
    }
    const payload = {
      name: name.trim(),
      conditions: conditions.filter((item) =>
        item.type === 'minNotes' ? true : item.value.trim().length > 0,
      ),
    };
    if (payload.conditions.length === 0) {
      return;
    }
    if (existing) {
      updateSmartPlaylist({ ...existing, ...payload });
      navigation.goBack();
      return;
    }
    const id = createSmartPlaylist(payload);
    navigation.replace('Collection', { kind: 'smart', id });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={layout.hitSlop}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.kind}>Smart playlist</Text>
          <Text style={styles.title}>{existing ? 'Modifica condizioni' : 'Nuove condizioni'}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.label}>Nome</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Es. Da riascoltare"
            placeholderTextColor={colors.textMuted}
            selectionColor={colors.accent}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Regole (tutte devono essere vere)</Text>
          {conditions.map((condition) => (
            <View key={condition.id} style={styles.rule}>
              {condition.type === 'minNotes' ? (
                <>
                  <Text style={styles.ruleText}>Almeno</Text>
                  <View style={styles.stepper}>
                    <Pressable
                      onPress={() =>
                        setCondition(condition.id, {
                          value: Math.max(1, condition.value - 1),
                        })
                      }
                      style={styles.stepBtn}
                    >
                      <Text style={styles.stepGlyph}>−</Text>
                    </Pressable>
                    <Text style={styles.stepValue}>{condition.value}</Text>
                    <Pressable
                      onPress={() =>
                        setCondition(condition.id, { value: condition.value + 1 })
                      }
                      style={styles.stepBtn}
                    >
                      <Text style={styles.stepGlyph}>+</Text>
                    </Pressable>
                  </View>
                  <Text style={styles.ruleText}>appunti</Text>
                </>
              ) : (
                <>
                  <Text style={styles.ruleText}>Titolo contiene</Text>
                  <TextInput
                    style={styles.ruleInput}
                    value={condition.value}
                    onChangeText={(value) => setCondition(condition.id, { value })}
                    placeholder="testo"
                    placeholderTextColor={colors.textMuted}
                    selectionColor={colors.accent}
                  />
                </>
              )}
              <Pressable
                onPress={() =>
                  setConditions((list) => list.filter((item) => item.id !== condition.id))
                }
                hitSlop={layout.hitSlop}
              >
                <Text style={styles.remove}>Rimuovi</Text>
              </Pressable>
            </View>
          ))}

          <View style={styles.addRow}>
            <Pressable onPress={() => setConditions((list) => [...list, newMinNotes()])}>
              <Text style={styles.add}>+ Minimo appunti</Text>
            </Pressable>
            <Pressable onPress={() => setConditions((list) => [...list, newTitleContains()])}>
              <Text style={styles.add}>+ Titolo contiene</Text>
            </Pressable>
          </View>
        </View>

        <Text style={styles.preview}>{preview} tracce corrispondono ora</Text>

        <Pressable
          onPress={save}
          disabled={!canSave}
          style={[styles.save, !canSave && styles.saveDisabled]}
        >
          <Text style={styles.saveLabel}>Salva</Text>
        </Pressable>

        {existing ? (
          <Pressable
            onPress={() => {
              deleteSmartPlaylist(existing.id);
              navigation.popToTop();
            }}
          >
            <Text style={styles.delete}>Elimina smart playlist</Text>
          </Pressable>
        ) : null}
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
    paddingBottom: 10,
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
  scroll: {
    paddingHorizontal: 16,
    paddingBottom: 36,
    gap: 12,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 14,
  },
  label: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  input: {
    borderRadius: 12,
    backgroundColor: colors.surfaceRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  rule: {
    marginBottom: 12,
    gap: 8,
  },
  ruleText: {
    color: colors.text,
    fontSize: 15,
  },
  ruleInput: {
    borderRadius: 10,
    backgroundColor: colors.surfaceRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    color: colors.text,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 15,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepGlyph: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '600',
  },
  stepValue: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    minWidth: 24,
    textAlign: 'center',
  },
  remove: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '600',
  },
  addRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginTop: 4,
  },
  add: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '700',
  },
  preview: {
    color: colors.textMuted,
    fontSize: 13,
    paddingHorizontal: 4,
  },
  save: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveDisabled: {
    opacity: 0.4,
  },
  saveLabel: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  delete: {
    color: colors.danger,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 8,
  },
});
