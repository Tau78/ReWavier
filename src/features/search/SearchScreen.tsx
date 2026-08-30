import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { albumTrackCount } from '../../domain/library';
import type { MainTabNavigation } from '../../navigation/types';
import { useLibraryStore } from '../../store/libraryStore';
import { colors } from '../../theme/colors';
import { openTrack } from '../library/openTrack';

type Nav = MainTabNavigation<'Cerca'>;

function matches(haystack: string, query: string): boolean {
  return haystack.toLowerCase().includes(query);
}

export function SearchScreen() {
  const navigation = useNavigation<Nav>();
  const tracks = useLibraryStore((s) => s.tracks);
  const albums = useLibraryStore((s) => s.albums);
  const folders = useLibraryStore((s) => s.folders);
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();

  const results = useMemo(() => {
    if (!q) {
      return { tracks: [], albums: [], folders: [] };
    }
    return {
      tracks: tracks.filter(
        (track) => matches(track.title, q) || matches(track.artist, q),
      ),
      albums: albums.filter((album) => matches(album.name, q)),
      folders: folders.filter((folder) => matches(folder.name, q)),
    };
  }, [albums, folders, q, tracks]);

  const hasQuery = q.length > 0;
  const empty =
    hasQuery &&
    results.tracks.length === 0 &&
    results.albums.length === 0 &&
    results.folders.length === 0;

  const play = (trackId: string) => {
    if (openTrack(trackId, results.tracks.map((track) => track.id))) {
      navigation.navigate('Player');
      return;
    }
    Alert.alert('Scarica', 'Questa traccia non è ancora sul telefono.');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.title}>Cerca</Text>
      </View>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Cerca brani, album o cartelle…"
        placeholderTextColor={colors.textMuted}
        selectionColor={colors.accent}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        clearButtonMode="while-editing"
        style={styles.input}
        accessibilityLabel="Cerca brani, album o cartelle"
      />
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {!hasQuery ? (
          <Text style={styles.empty}>Scrivi un nome per trovare brani, album o cartelle.</Text>
        ) : null}
        {empty ? <Text style={styles.empty}>Nessun risultato. Prova un altro nome.</Text> : null}

        {results.folders.length > 0 ? (
          <View style={styles.card}>
            <Text style={styles.section}>Cartelle</Text>
            {results.folders.map((folder) => (
              <Pressable
                key={folder.id}
                onPress={() => navigation.navigate('Collection', { kind: 'folder', id: folder.id })}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={`Cartella ${folder.name}`}
              >
                <Text style={styles.glyph}>▤</Text>
                <View style={styles.meta}>
                  <Text style={styles.name} numberOfLines={1}>
                    {folder.name}
                  </Text>
                  <Text style={styles.sub}>Cartella</Text>
                </View>
              </Pressable>
            ))}
          </View>
        ) : null}

        {results.albums.length > 0 ? (
          <View style={styles.card}>
            <Text style={styles.section}>Album</Text>
            {results.albums.map((album) => {
              const count = albumTrackCount(album.trackIds);
              return (
                <Pressable
                  key={album.id}
                  onPress={() => navigation.navigate('Collection', { kind: 'album', id: album.id })}
                  style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel={`Album ${album.name}`}
                >
                  <Text style={styles.glyph}>▣</Text>
                  <View style={styles.meta}>
                    <Text style={styles.name} numberOfLines={1}>
                      {album.name}
                    </Text>
                    <Text style={styles.sub}>
                      {count === 1 ? '1 brano' : `${count} brani`}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {results.tracks.length > 0 ? (
          <View style={styles.card}>
            <Text style={styles.section}>Brani</Text>
            {results.tracks.map((track) => (
              <Pressable
                key={track.id}
                onPress={() => play(track.id)}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={`${track.title}, ${track.artist}`}
              >
                <Text style={styles.glyph}>♪</Text>
                <View style={styles.meta}>
                  <Text style={styles.name} numberOfLines={1}>
                    {track.title}
                  </Text>
                  <Text style={styles.sub} numberOfLines={1}>
                    {track.artist}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
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
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 8,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.6,
  },
  input: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    color: colors.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 32,
    gap: 12,
  },
  empty: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    paddingHorizontal: 4,
    paddingVertical: 12,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
    paddingBottom: 4,
  },
  section: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 12,
  },
  glyph: {
    color: colors.textMuted,
    fontSize: 18,
    width: 22,
    textAlign: 'center',
  },
  meta: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  sub: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: 13,
  },
  pressed: {
    opacity: 0.7,
  },
});
