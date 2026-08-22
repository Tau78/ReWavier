import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import type { Album } from '../../domain/library';
import { pickAndSaveAlbumArtwork } from '../../files/albumArtwork';
import { resolveLibraryUri } from '../../files/libraryUris';
import { useLibraryStore } from '../../store/libraryStore';
import { colors, layout } from '../../theme/colors';

function PlayIcon({ paused }: { paused: boolean }) {
  if (paused) {
    return (
      <View style={styles.pauseGlyph} accessibilityElementsHidden>
        <View style={styles.pauseBar} />
        <View style={styles.pauseBar} />
      </View>
    );
  }
  return <View style={styles.playGlyph} accessibilityElementsHidden />;
}

export function AlbumHero({
  album,
  trackCount,
  isPlayingThisAlbum,
  onPlay,
}: {
  album: Album;
  trackCount: number;
  isPlayingThisAlbum: boolean;
  onPlay: () => void;
}) {
  const letter = (album.name.trim()[0] || 'A').toUpperCase();
  const artworkUri = resolveLibraryUri(album.artworkUri);
  const meta = album.artist?.trim()
    ? `${album.artist} · ${trackCount} ${trackCount === 1 ? 'traccia' : 'tracce'}`
    : `${trackCount} ${trackCount === 1 ? 'traccia' : 'tracce'}`;

  const pickArtwork = async () => {
    try {
      const uri = await pickAndSaveAlbumArtwork(album.id);
      if (!uri) {
        return;
      }
      useLibraryStore.getState().setAlbumArtwork(album.id, uri);
    } catch (error) {
      Alert.alert(
        'Copertina',
        error instanceof Error ? error.message : 'Non riesco a usare questa immagine.',
      );
    }
  };

  const onArtworkPress = () => {
    if (!album.artworkUri) {
      void pickArtwork();
      return;
    }
    Alert.alert('Copertina', 'Vuoi cambiare o togliere la foto di questo album?', [
      { text: 'Annulla', style: 'cancel' },
      { text: 'Cambia', onPress: () => void pickArtwork() },
      {
        text: 'Togli',
        style: 'destructive',
        onPress: () => useLibraryStore.getState().setAlbumArtwork(album.id, undefined),
      },
    ]);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.artWrap}>
        <Pressable
          onPress={onArtworkPress}
          accessibilityRole="button"
          accessibilityLabel={album.artworkUri ? 'Cambia copertina' : 'Aggiungi copertina'}
          style={({ pressed }) => [styles.artHit, pressed && styles.pressed]}
        >
          {artworkUri ? (
            <Image source={{ uri: artworkUri }} style={styles.art} resizeMode="cover" />
          ) : (
            <View style={styles.placeholder}>
              <Text style={styles.letter}>{letter}</Text>
              <Text style={styles.addHint}>Tocca per aggiungere la copertina</Text>
            </View>
          )}
        </Pressable>
        <Pressable
          onPress={onPlay}
          accessibilityRole="button"
          accessibilityLabel={isPlayingThisAlbum ? 'Pausa album' : 'Ascolta l’album'}
          style={({ pressed }) => [styles.play, pressed && styles.playPressed]}
        >
          <PlayIcon paused={isPlayingThisAlbum} />
        </Pressable>
      </View>
      <Text style={styles.title} numberOfLines={2}>
        {album.name}
      </Text>
      <Text style={styles.meta} numberOfLines={1}>
        {album.origin === 'drive' ? `Drive · ${meta}` : meta}
      </Text>
    </View>
  );
}

const ART = 236;

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 18,
  },
  artWrap: {
    width: ART,
    height: ART,
    marginBottom: 16,
  },
  artHit: {
    width: ART,
    height: ART,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: colors.surfaceRaised,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 12,
  },
  art: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    backgroundColor: colors.surfaceRaised,
  },
  letter: {
    color: colors.text,
    fontSize: 72,
    fontWeight: '700',
    letterSpacing: -2,
  },
  addHint: {
    marginTop: 8,
    color: colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.86,
  },
  play: {
    position: 'absolute',
    right: -6,
    bottom: -6,
    width: layout.controlSize,
    height: layout.controlSize,
    borderRadius: layout.controlSize / 2,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  playPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.96 }],
  },
  playGlyph: {
    width: 0,
    height: 0,
    marginLeft: 3,
    borderTopWidth: 10,
    borderBottomWidth: 10,
    borderLeftWidth: 16,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: colors.text,
  },
  pauseGlyph: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  pauseBar: {
    width: 5,
    height: 18,
    borderRadius: 1.5,
    backgroundColor: colors.text,
  },
  title: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.5,
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  meta: {
    marginTop: 6,
    color: colors.textMuted,
    fontSize: 14,
  },
});
