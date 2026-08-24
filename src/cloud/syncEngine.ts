import { File } from 'expo-file-system';

import { shouldSkipCloudSync } from '../auth/demoAccount';
import {
  ORDER_FILE_NAME,
  buildAlbumOrder,
  isOrderManifestName,
  parseAlbumOrder,
  sortTracksByOrder,
} from '../domain/albumOrder';
import { isAudioName, playableUri } from '../domain/audioFormats';
import { createId } from '../domain/library';
import type { Marker, Track } from '../domain/models';
import { userHasUsage } from '../domain/session';
import {
  audioBasename,
  isSidecarName,
  parseSidecar,
  sidecarAuthorSlug,
  sidecarNameForAudio,
  titleFromFileName,
} from '../domain/sidecar';
import { copyToDownloads, inboxDirectory } from '../files/downloads';
import { writeSidecarToLibrary } from '../files/libraryFiles';
import { useLibraryStore } from '../store/libraryStore';
import { usePlayerStore } from '../store/playerStore';
import { useSessionStore } from '../store/sessionStore';
import { useSyncStore, type AudioUpdate } from '../store/syncStore';
import { runDeviceSync } from './deviceSync/runDeviceSync';
import {
  downloadDriveFile,
  findChildByName,
  findFolderByName,
  getDriveFileParentId,
  hasDriveToken,
  listFolderChildren,
  renameDriveFile,
  updateDriveFileMedia,
  uploadDriveFile,
  type DriveFile,
} from './driveApi';
import { mergeMarkers } from './mergeNotes';

function remoteChanged(track: Track, remote: DriveFile): boolean {
  if (remote.md5Checksum && track.remoteHash && remote.md5Checksum !== track.remoteHash) {
    return true;
  }
  if (remote.modifiedTime && track.remoteModifiedAt) {
    return Date.parse(remote.modifiedTime) > Date.parse(track.remoteModifiedAt);
  }
  if (remote.size && track.remoteSize && Number(remote.size) !== track.remoteSize) {
    return true;
  }
  return Boolean(remote.modifiedTime && !track.remoteModifiedAt);
}

function metaFrom(remote: DriveFile): Pick<Track, 'driveFileId' | 'remoteModifiedAt' | 'remoteSize' | 'remoteHash'> {
  return {
    driveFileId: remote.id,
    remoteModifiedAt: remote.modifiedTime,
    remoteSize: remote.size ? Number(remote.size) : undefined,
    remoteHash: remote.md5Checksum,
  };
}

async function saveAudio(remote: DriveFile, trackId: string, _downloaded: boolean): Promise<string> {
  const dest = new File(inboxDirectory(), `sync-${trackId}-${remote.name.replace(/[/\\?%*:|"<>]/g, '-')}`);
  const uri = await downloadDriveFile(remote.id, dest.uri);
  const stored = await copyToDownloads(uri, trackId, remote.name);
  try {
    dest.delete();
  } catch {
    // temp file already gone
  }
  return stored;
}

export async function runCloudSync(): Promise<void> {
  const sync = useSyncStore.getState();
  if (sync.status === 'syncing') {
    return;
  }
  const user = useSessionStore.getState().user;
  if (!user?.onboarded || shouldSkipCloudSync(user)) {
    return;
  }
  const albums = useLibraryStore.getState().albums.filter((album) => album.origin === 'drive');

  sync.start();
  let deviceMessage = '';
  try {
    deviceMessage = (await runDeviceSync()).message;
  } catch {
    deviceMessage = '';
  }

  if (shouldSkipCloudSync(useSessionStore.getState().user)) {
    sync.finish({ lastSyncedAt: Date.now(), message: null });
    return;
  }

  if (albums.length === 0) {
    sync.finish({
      lastSyncedAt: Date.now(),
      message: deviceMessage || null,
    });
    return;
  }

  const google = await hasDriveToken();
  if (!google) {
    sync.finish({
      lastSyncedAt: Date.now(),
      needsFileRefresh: albums.length > 0,
      message:
        deviceMessage ||
        (albums.length > 0
          ? 'Collega Google oppure aggiorna i file da Drive (File).'
          : null),
    });
    return;
  }

  const selfSlug = user.authorSlug;
  const reviews: AudioUpdate[] = [];
  let notesPulled = 0;
  let needsFolderLink = false;

  try {
    const store = useLibraryStore.getState();
    for (const album of albums) {
      let folderId = album.driveFolderId;
      if (!folderId) {
        const found = await findFolderByName(album.driveFolderName || album.name);
        if (found) {
          folderId = found.id;
          store.linkAlbumDrive(album.id, found.id, found.name);
        }
      }
      if (!folderId) {
        needsFolderLink = true;
        continue;
      }

      const children = await listFolderChildren(folderId);
      const audios = children.filter((file) => isAudioName(file.name));
      const sidecars = children.filter((file) => isSidecarName(file.name));

      for (const remote of audios) {
        const existing = store
          .tracksIn('album', album.id)
          .find(
            (track) =>
              track.driveFileId === remote.id ||
              (track.sourceFileName &&
                audioBasename(track.sourceFileName).toLowerCase() ===
                  audioBasename(remote.name).toLowerCase()),
          );

        if (!existing) {
          const id = createId('track');
          const inboxUri = await saveAudio(remote, id, false);
          store.importBundles(
            [
              {
                track: {
                  id,
                  title: titleFromFileName(remote.name),
                  artist: album.name,
                  durationMs: 0,
                  inboxUri,
                  sourceFileName: remote.name,
                  downloaded: false,
                  ...metaFrom(remote),
                },
                markers: [],
              },
            ],
            { albumId: album.id },
          );
          continue;
        }

        store.updateTrackRemote(existing.id, metaFrom(remote));
        if (!remoteChanged(existing, remote)) {
          continue;
        }
        const destUri = await saveAudio(remote, existing.id, existing.downloaded === true);
        if (existing.downloaded) {
          store.replaceTrackFile(
            existing.id,
            destUri,
            (store.markersByTrackId[existing.id] ?? []).map((marker) => marker.id),
          );
        } else {
          store.setTrackInbox(existing.id, destUri);
        }
        store.updateTrackRemote(existing.id, metaFrom(remote));
        reloadIfPlaying(existing.id);
        const markers = store.markersByTrackId[existing.id] ?? [];
        if (markers.length > 0) {
          reviews.push({
            trackId: existing.id,
            title: existing.title,
            fileName: remote.name,
            markers,
          });
        }
      }

      for (const remote of sidecars) {
        const slug = sidecarAuthorSlug(remote.name);
        if (slug && slug === selfSlug) {
          continue;
        }
        const dest = new File(inboxDirectory(), `sync-${remote.id}.json`);
        await downloadDriveFile(remote.id, dest.uri);
        const parsed = parseSidecar(await dest.text());
        if (dest.exists) {
          dest.delete();
        }
        if (!parsed) {
          continue;
        }
        const track = store
          .tracksIn('album', album.id)
          .find(
            (item) =>
              audioBasename(item.sourceFileName ?? item.title).toLowerCase() ===
              audioBasename(parsed.audioFileName || remote.name).toLowerCase(),
          );
        if (!track) {
          continue;
        }
        const before = store.markersByTrackId[track.id] ?? [];
        const merged = mergeMarkers(before, parsed.markers);
        const added = merged.filter((marker) => !before.some((item) => item.id === marker.id)).length;
        if (added > 0 || merged.some((marker, i) => marker.updatedAt !== before[i]?.updatedAt)) {
          notesPulled += added;
          store.setTrackMarkers(track.id, merged);
          reloadIfPlaying(track.id);
        }
      }

      const orderRemote = children.find((file) => isOrderManifestName(file.name));
      if (orderRemote) {
        const dest = new File(inboxDirectory(), `sync-order-${album.id}.json`);
        await downloadDriveFile(orderRemote.id, dest.uri);
        const parsed = parseAlbumOrder(await dest.text());
        if (dest.exists) {
          dest.delete();
        }
        const localStamp = useLibraryStore.getState().albums.find((item) => item.id === album.id)
          ?.orderUpdatedAt ?? 0;
        if (parsed && parsed.updatedAt > localStamp) {
          const ordered = sortTracksByOrder(
            useLibraryStore.getState().tracksIn('album', album.id),
            parsed.files,
          );
          store.setCollectionOrder(
            'album',
            album.id,
            ordered.map((track) => track.id),
            { updatedAt: parsed.updatedAt, fromCloud: true },
          );
        } else if (localStamp > (parsed?.updatedAt ?? 0)) {
          await pushAlbumOrder(album.id);
        }
      } else if ((useLibraryStore.getState().albums.find((item) => item.id === album.id)?.orderUpdatedAt ?? 0) > 0) {
        await pushAlbumOrder(album.id);
      }

      store.touchAlbumSync(album.id);
    }

    sync.finish({
      lastSyncedAt: Date.now(),
      pendingReviews: reviews,
      notesPulled,
      needsFolderLink,
      needsFileRefresh: false,
      message:
        reviews.length > 0
          ? `${reviews.length} file audio aggiornati sulla cartella Drive.`
          : notesPulled > 0
            ? `${notesPulled} note nuove dai compagni.`
            : deviceMessage || 'Album Drive allineati.',
    });
  } catch (error) {
    sync.fail(error instanceof Error ? error.message : 'Sync Drive non riuscita');
  }
}

function reloadIfPlaying(trackId: string) {
  const player = usePlayerStore.getState();
  if (player.track.id !== trackId) {
    return;
  }
  const next = useLibraryStore.getState().getTrack(trackId);
  if (!next) {
    return;
  }
  player.loadTrack(next, useLibraryStore.getState().markersByTrackId[trackId] ?? [], player.queueIds);
}

export async function applyAudioReview(trackId: string, keepMarkerIds: string[]): Promise<void> {
  const store = useLibraryStore.getState();
  const track = store.getTrack(trackId);
  if (!track) {
    return;
  }
  const markers = applyKeep(store.markersByTrackId[trackId] ?? [], keepMarkerIds);
  store.setTrackMarkers(trackId, markers);
  useSyncStore.getState().dismissReview(trackId);
}

function sharedDriveAlbum(albumId?: string, trackId?: string) {
  const albums = useLibraryStore.getState().albums;
  if (albumId) {
    return albums.find((album) => album.id === albumId && album.driveFolderId);
  }
  if (trackId) {
    return albums.find((album) => album.driveFolderId && album.trackIds.includes(trackId));
  }
  return undefined;
}

export async function pushTrackToSharedAlbum(trackId: string, albumId?: string): Promise<boolean> {
  const album = sharedDriveAlbum(albumId, trackId);
  const track = useLibraryStore.getState().getTrack(trackId);
  const uri = track ? playableUri(track) : undefined;
  if (!album?.driveFolderId || !track || !uri) {
    return false;
  }
  if (!(await hasDriveToken())) {
    throw new Error('Ricollega Google per caricare sulla cartella Drive.');
  }
  const name = track.sourceFileName ?? `${track.title}.m4a`;
  const existing = await findChildByName(album.driveFolderId, name);
  const remote = existing
    ? await updateDriveFileMedia(existing.id, uri, 'audio/mp4')
    : await uploadDriveFile({
        name,
        folderId: album.driveFolderId,
        fileUri: uri,
        mimeType: 'audio/mp4',
      });
  useLibraryStore.getState().updateTrackRemote(trackId, metaFrom(remote));
  return true;
}

export async function pushAlbumOrder(albumId: string): Promise<void> {
  const album = sharedDriveAlbum(albumId);
  if (!album?.driveFolderId) {
    return;
  }
  if (!(await hasDriveToken())) {
    return;
  }
  const tracks = useLibraryStore.getState().tracksIn('album', albumId);
  const updatedAt =
    useLibraryStore.getState().albums.find((item) => item.id === albumId)?.orderUpdatedAt ??
    Date.now();
  const dest = new File(inboxDirectory(), `order-${albumId}.json`);
  dest.write(JSON.stringify(buildAlbumOrder(tracks, updatedAt), null, 2));
  const existing = await findChildByName(album.driveFolderId, ORDER_FILE_NAME);
  if (existing) {
    await updateDriveFileMedia(existing.id, dest.uri, 'application/json');
    return;
  }
  await uploadDriveFile({
    name: ORDER_FILE_NAME,
    folderId: album.driveFolderId,
    fileUri: dest.uri,
    mimeType: 'application/json',
  });
}

export async function followTrackRenameOnDrive(
  trackId: string,
  oldSourceFileName: string,
): Promise<void> {
  const store = useLibraryStore.getState();
  const track = store.getTrack(trackId);
  if (!track) {
    return;
  }
  if (!(await hasDriveToken())) {
    return;
  }
  const album = sharedDriveAlbum(undefined, trackId);
  let folderId = album?.driveFolderId;
  const newAudioName = track.sourceFileName ?? `${track.title}.m4a`;
  if (audioBasename(oldSourceFileName).toLowerCase() === audioBasename(newAudioName).toLowerCase()) {
    return;
  }

  if (!folderId && track.driveFileId) {
    try {
      folderId = await getDriveFileParentId(track.driveFileId);
    } catch {
      folderId = undefined;
    }
  }

  const children = folderId ? await listFolderChildren(folderId) : [];
  let audioId = track.driveFileId;
  if (!audioId && folderId) {
    const match = children.find(
      (file) =>
        isAudioName(file.name) &&
        (file.name.toLowerCase() === oldSourceFileName.toLowerCase() ||
          audioBasename(file.name).toLowerCase() === audioBasename(oldSourceFileName).toLowerCase()),
    );
    audioId = match?.id;
  }
  if (audioId) {
    try {
      const remote = await renameDriveFile(audioId, newAudioName);
      store.updateTrackRemote(trackId, metaFrom(remote));
    } catch {
      // Sidecar rename still keeps notes attached to the new name.
    }
  }

  if (folderId) {
    const sidecars = children.filter(
      (file) =>
        isSidecarName(file.name) &&
        audioBasename(file.name).toLowerCase() === audioBasename(oldSourceFileName).toLowerCase(),
    );
    for (const remote of sidecars) {
      const nextName = sidecarNameForAudio(newAudioName, sidecarAuthorSlug(remote.name));
      if (remote.name.toLowerCase() === nextName.toLowerCase()) {
        continue;
      }
      try {
        await renameDriveFile(remote.id, nextName);
      } catch {
        // pushSidecarIfShared below writes the notes under the new name
      }
    }
  }

  await pushSidecarIfShared(trackId);
}

export async function pushSidecarIfShared(trackId: string): Promise<void> {
  const album = sharedDriveAlbum(undefined, trackId);
  const store = useLibraryStore.getState();
  const track = store.getTrack(trackId);
  if (!album?.driveFolderId || !track) {
    return;
  }
  if (!(await hasDriveToken())) {
    return;
  }
  const user = useSessionStore.getState().user;
  const slug = userHasUsage(user, 'band') ? user?.authorSlug : undefined;
  const markers = store.markersByTrackId[trackId] ?? [];
  const uri = await writeSidecarToLibrary(track, markers, slug);
  const name = sidecarNameForAudio(track.sourceFileName ?? `${track.title}.m4a`, slug);
  const existing = await findChildByName(album.driveFolderId, name);
  if (existing) {
    await updateDriveFileMedia(existing.id, uri, 'application/json');
    return;
  }
  await uploadDriveFile({
    name,
    folderId: album.driveFolderId,
    fileUri: uri,
    mimeType: 'application/json',
  });
}

function applyKeep(markers: Marker[], keepIds: string[]): Marker[] {
  const keep = new Set(keepIds);
  const now = Date.now();
  return markers.map((marker) =>
    keep.has(marker.id) ? marker : { ...marker, hidden: true, updatedAt: now },
  );
}

export async function importDriveFolder(folderId: string, folderName: string): Promise<string> {
  const store = useLibraryStore.getState();
  const albumId = store.createAlbum(folderName, {
    origin: 'drive',
    artist: 'Drive',
    driveFolderName: folderName,
    driveFolderId: folderId,
  });
  await runCloudSync();
  return albumId;
}
