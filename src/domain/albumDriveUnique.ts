import { flattenAlbumTrackIds } from './albumVersions';
import type { Album } from './library';

/** Non-empty Drive folder id, or empty string when local-only. */
export function albumDriveFolderKey(album: { driveFolderId?: string }): string {
  return album.driveFolderId?.trim() ?? '';
}

function albumRichness(album: Album): number {
  const tracks = flattenAlbumTrackIds(album).length;
  const docs = album.documents?.length ?? 0;
  const notes = album.notes?.trim() ? 2 : 0;
  const synced = album.lastSyncedAt ?? 0;
  const ordered = album.orderUpdatedAt ?? 0;
  return tracks * 1000 + docs * 10 + notes + Math.min(synced, 1) + Math.min(ordered, 1);
}

function preferAlbum(left: Album, right: Album): Album {
  const leftScore = albumRichness(left);
  const rightScore = albumRichness(right);
  if (rightScore !== leftScore) {
    return rightScore > leftScore ? right : left;
  }
  if ((right.lastSyncedAt ?? 0) !== (left.lastSyncedAt ?? 0)) {
    return (right.lastSyncedAt ?? 0) > (left.lastSyncedAt ?? 0) ? right : left;
  }
  return left.id <= right.id ? left : right;
}

function mergeSameDriveFolder(winner: Album, loser: Album): Album {
  const winnerTracks = new Set(winner.trackIds);
  const trackIds = [...winner.trackIds];
  for (const id of loser.trackIds) {
    if (!winnerTracks.has(id)) {
      trackIds.push(id);
      winnerTracks.add(id);
    }
  }
  const versionById = new Map((winner.versionFolders ?? []).map((folder) => [folder.id, folder]));
  for (const folder of loser.versionFolders ?? []) {
    if (!versionById.has(folder.id)) {
      versionById.set(folder.id, folder);
    }
  }
  const versionFolders = [...versionById.values()];
  const docByKey = new Map(
    (winner.documents ?? []).map((document) => [document.driveFileId || document.id, document]),
  );
  for (const document of loser.documents ?? []) {
    const key = document.driveFileId || document.id;
    if (!docByKey.has(key)) {
      docByKey.set(key, document);
    }
  }
  const documents = [...docByKey.values()];
  return {
    ...winner,
    trackIds,
    versionFolders: versionFolders.length > 0 ? versionFolders : undefined,
    documents: documents.length > 0 ? documents : undefined,
    name: winner.name.trim() || loser.name,
    artist: winner.artist || loser.artist,
    notes: winner.notes?.trim() ? winner.notes : loser.notes,
    notesUpdatedAt: Math.max(winner.notesUpdatedAt ?? 0, loser.notesUpdatedAt ?? 0) || undefined,
    artworkUri: winner.artworkUri || loser.artworkUri,
    driveFolderName: winner.driveFolderName || loser.driveFolderName,
    driveSharedDriveId: winner.driveSharedDriveId || loser.driveSharedDriveId,
    driveRecursive: winner.driveRecursive ?? loser.driveRecursive,
    driveRole: winner.driveRole ?? loser.driveRole,
    lastSyncedAt: Math.max(winner.lastSyncedAt ?? 0, loser.lastSyncedAt ?? 0) || undefined,
    orderUpdatedAt: Math.max(winner.orderUpdatedAt ?? 0, loser.orderUpdatedAt ?? 0) || undefined,
    memberColors: { ...loser.memberColors, ...winner.memberColors },
    memberEmails: { ...loser.memberEmails, ...winner.memberEmails },
    memberNames: { ...loser.memberNames, ...winner.memberNames },
    memberPushTokens: { ...loser.memberPushTokens, ...winner.memberPushTokens },
    membersUpdatedAt: Math.max(winner.membersUpdatedAt ?? 0, loser.membersUpdatedAt ?? 0) || undefined,
    origin: winner.origin === 'drive' || loser.origin === 'drive' ? 'drive' : winner.origin,
  };
}

export type DedupeAlbumsByDriveFolderResult = {
  albums: Album[];
  /** Loser album ids — safe to tombstone; do NOT tombstone the shared driveFolderId. */
  removedDuplicateIds: string[];
};

/**
 * One live album per Google Drive folder. Local albums without driveFolderId stay as-is.
 * Keeps the richest row and merges tracks/docs/notes from duplicates.
 */
export function dedupeAlbumsByDriveFolder(albums: Album[]): DedupeAlbumsByDriveFolderResult {
  const kept: Album[] = [];
  const byFolder = new Map<string, Album>();
  const removedDuplicateIds: string[] = [];

  for (const album of albums) {
    const key = albumDriveFolderKey(album);
    if (!key) {
      kept.push(album);
      continue;
    }
    const existing = byFolder.get(key);
    if (!existing) {
      byFolder.set(key, album);
      continue;
    }
    const winner = preferAlbum(existing, album);
    const loser = winner.id === existing.id ? album : existing;
    byFolder.set(key, mergeSameDriveFolder(winner, loser));
    removedDuplicateIds.push(loser.id);
  }

  for (const album of byFolder.values()) {
    kept.push(album);
  }

  return { albums: kept, removedDuplicateIds };
}

/** First album already linked to this Drive folder, if any. */
export function findAlbumByDriveFolderId(
  albums: Album[],
  folderId: string | undefined,
): Album | undefined {
  const key = folderId?.trim() ?? '';
  if (!key) {
    return undefined;
  }
  return albums.find((album) => albumDriveFolderKey(album) === key);
}
