import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { Album, Playlist } from '../../domain/library';
import type { Track } from '../../domain/models';
import { resolveLibraryUri } from '../../files/libraryUris';
import { colors } from '../../theme/colors';

const TILE = 160;
const CAP = 12;

export type HeroKind = 'album' | 'playlist' | 'track';

export type HeroTile = {
  key: string;
  kind: HeroKind;
  id: string;
  name: string;
  artworkUri?: string;
};

/** Albums with art, albums without, playlists, then tracks with art. Cap 12. */
export function buildHeroTiles(
  albums: Album[],
  playlists: Playlist[],
  tracks: Track[],
  cap = CAP,
): HeroTile[] {
  const withArt: HeroTile[] = [];
  const withoutArt: HeroTile[] = [];
  for (const album of albums) {
    const tile: HeroTile = {
      key: `album:${album.id}`,
      kind: 'album',
      id: album.id,
      name: album.name,
      artworkUri: album.artworkUri,
    };
    if (album.artworkUri) {
      withArt.push(tile);
    } else {
      withoutArt.push(tile);
    }
  }
  const playlistTiles: HeroTile[] = playlists.map((playlist) => ({
    key: `playlist:${playlist.id}`,
    kind: 'playlist',
    id: playlist.id,
    name: playlist.name,
  }));
  const trackTiles: HeroTile[] = tracks
    .filter((track) => Boolean(track.artworkUri))
    .map((track) => ({
      key: `track:${track.id}`,
      kind: 'track',
      id: track.id,
      name: track.title,
      artworkUri: track.artworkUri,
    }));
  return [...withArt, ...withoutArt, ...playlistTiles, ...trackTiles].slice(0, cap);
}

function CoverFace({ name, artworkUri }: { name: string; artworkUri?: string }) {
  const uri = resolveLibraryUri(artworkUri);
  const letter = (name.trim()[0] || '?').toUpperCase();
  if (uri) {
    return <Image source={{ uri }} style={styles.art} resizeMode="cover" />;
  }
  return (
    <View style={styles.fallback}>
      <Text style={styles.letter}>{letter}</Text>
    </View>
  );
}

export function HeroCovers({
  albums,
  playlists,
  tracks,
  onPressAlbum,
  onPressPlaylist,
  onPressTrack,
}: {
  albums: Album[];
  playlists: Playlist[];
  tracks: Track[];
  onPressAlbum: (id: string) => void;
  onPressPlaylist: (id: string) => void;
  onPressTrack: (id: string) => void;
}) {
  const tiles = buildHeroTiles(albums, playlists, tracks);
  if (tiles.length === 0) {
    return null;
  }

  const onPress = (tile: HeroTile) => {
    if (tile.kind === 'album') {
      onPressAlbum(tile.id);
      return;
    }
    if (tile.kind === 'playlist') {
      onPressPlaylist(tile.id);
      return;
    }
    onPressTrack(tile.id);
  };

  const labelFor = (tile: HeroTile) => {
    if (tile.kind === 'album') {
      return `Apri album ${tile.name}`;
    }
    if (tile.kind === 'playlist') {
      return `Apri playlist ${tile.name}`;
    }
    return `Ascolta ${tile.name}`;
  };

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {tiles.map((tile) => (
        <Pressable
          key={tile.key}
          onPress={() => onPress(tile)}
          style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={labelFor(tile)}
        >
          <View style={styles.cover}>
            <CoverFace name={tile.name} artworkUri={tile.artworkUri} />
          </View>
          <Text style={styles.caption} numberOfLines={1}>
            {tile.name}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 8,
    gap: 14,
  },
  tile: {
    width: TILE,
  },
  cover: {
    width: TILE,
    height: TILE,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.38,
    shadowRadius: 16,
    elevation: 10,
  },
  art: {
    width: '100%',
    height: '100%',
  },
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  letter: {
    color: colors.text,
    fontSize: 56,
    fontWeight: '700',
    letterSpacing: -1.5,
  },
  caption: {
    marginTop: 8,
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.82,
  },
});
