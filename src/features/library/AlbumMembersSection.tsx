import { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { albumMemberRows } from '../../domain/albumPeople';
import { ColorSwatches } from '../auth/BandFields';
import { canWriteWithRole, roleOfAlbum } from '../../domain/folderRole';
import type { Album } from '../../domain/library';
import type { Marker } from '../../domain/models';
import { refreshAlbumMemberEmails } from '../../cloud/syncEngine';
import { useLibraryStore } from '../../store/libraryStore';
import { useSessionStore } from '../../store/sessionStore';
import { colors } from '../../theme/colors';

export function AlbumMembersSection({
  album,
  markersByTrackId,
}: {
  album: Album;
  markersByTrackId: Record<string, Marker[]>;
}) {
  const user = useSessionStore((s) => s.user);
  const setAlbumMemberColor = useLibraryStore((s) => s.setAlbumMemberColor);
  const canEdit = canWriteWithRole(roleOfAlbum(album));

  const members = useMemo(
    () => albumMemberRows(album, markersByTrackId, user),
    [album, markersByTrackId, user],
  );

  useEffect(() => {
    if (!album.driveFolderId) {
      return;
    }
    void refreshAlbumMemberEmails(album.id).catch(() => undefined);
  }, [album.id, album.driveFolderId]);

  if (members.length === 0) {
    return (
      <View style={styles.block}>
        <Text style={styles.title}>Membri di questo album</Text>
        <Text style={styles.hint}>
          Compariranno qui quando qualcuno scrive un appunto, oppure se Drive condivide la cartella
          con altre persone.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.block}>
      <Text style={styles.title}>Membri di questo album</Text>
      <Text style={styles.hint}>
        {canEdit
          ? 'Scegli un colore: vale per tutti in questo album e sostituisce il colore personale.'
          : 'Colori scelti per questo album (solo lettura).'}
      </Text>
      {members.map((member) => (
        <View key={member.key} style={styles.row}>
          <View style={[styles.dot, { backgroundColor: member.color }]}>
            <Text style={styles.initial}>
              {(member.name.trim()[0] ?? '?').toLocaleUpperCase('it-IT')}
            </Text>
          </View>
          <View style={styles.copy}>
            <Text style={styles.name} numberOfLines={1}>
              {member.name}
            </Text>
            <Text style={styles.email} numberOfLines={1}>
              {member.email || 'Email non disponibile'}
            </Text>
            {canEdit ? (
              <ColorSwatches
                value={album.memberColors?.[member.key] ?? member.color}
                onChange={(color) => setAlbumMemberColor(album.id, member.key, color)}
              />
            ) : (
              <Pressable disabled style={styles.swatchReadonly}>
                <View style={[styles.swatchChip, { backgroundColor: member.color }]} />
              </Pressable>
            )}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    marginTop: 14,
    gap: 10,
  },
  title: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  hint: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 4,
  },
  dot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  initial: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  name: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  email: {
    color: colors.textMuted,
    fontSize: 12,
  },
  swatchReadonly: {
    alignSelf: 'flex-start',
  },
  swatchChip: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
});
