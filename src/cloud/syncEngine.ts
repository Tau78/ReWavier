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
import {
  findAlbumCoverFile,
  findTrackCoverFile,
  isPdfName,
} from '../domain/driveMedia';
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
import { saveArtworkFromUri } from '../files/albumArtwork';
import { saveDocumentFromUri } from '../files/albumDocuments';
import { copyToDownloads, inboxDirectory } from '../files/downloads';
import { writeSidecarToLibrary } from '../files/libraryFiles';
import { useLibraryStore } from '../store/libraryStore';
import { refreshPlayingArtwork, usePlayerStore } from '../store/playerStore';
import { useSessionStore } from '../store/sessionStore';
import { isSyncInFlight, SYNC_STALE_MS, useSyncStore } from '../store/syncStore';
import { runDeviceSync } from './deviceSync/runDeviceSync';
import {
  downloadDriveFile,
  findChildByName,
  findFolderByName,
  getDriveFileParentId,
  hasDriveToken,
  isDriveFolder,
  listDriveFolderTree,
  listFolderChildren,
  renameDriveFile,
  updateDriveFileMedia,
  uploadDriveFile,
  type DriveFile,
} from './driveApi';
import { mergeMarkers } from './mergeNotes';
import {
  remoteAudioChanged,
  trackMatchesRemote,
  trackPresentRemotely,
} from './remoteAudioChange';

function archiveAllMarkers(markers: Marker[]): Marker[] {
  const now = Date.now();
  return markers.map((marker) =>
    marker.hidden === true ? marker : { ...marker, hidden: true, updatedAt: now },
  );
}

function syncAlbumMessage(input: {
  added: number;
  removed: number;
  versioned: number;
  notesArchived: number;
  notesPulled: number;
  deviceMessage: string;
}): string | null {
  const parts: string[] = [];
  if (input.added > 0) {
    parts.push(input.added === 1 ? '1 brano nuovo' : `${input.added} brani nuovi`);
  }
  if (input.removed > 0) {
    parts.push(input.removed === 1 ? '1 tolto' : `${input.removed} tolti`);
  }
  if (input.versioned > 0) {
    parts.push(
      input.notesArchived > 0
        ? input.versioned === 1
          ? '1 nuova versione (appunti in archivio)'
          : `${input.versioned} nuove versioni (appunti in archivio)`
        : input.versioned === 1
          ? '1 nuova versione'
          : `${input.versioned} nuove versioni`,
    );
  }
  if (parts.length > 0) {
    return `Album aggiornato da Drive: ${parts.join(', ')}.`;
  }
  if (input.notesPulled > 0) {
    return `${input.notesPulled} appunti nuovi dai compagni.`;
  }
  return input.deviceMessage || null;
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

let cloudSyncJob: Promise<void> | null = null;

/** One Drive pass at a time. A second caller waits for the one already running. */
export function runCloudSync(): Promise<void> {
  if (cloudSyncJob) {
    return cloudSyncJob;
  }
  cloudSyncJob = runCloudSyncBody().finally(() => {
    cloudSyncJob = null;
  });
  return cloudSyncJob;
}

async function runCloudSyncBody(): Promise<void> {
  const sync = useSyncStore.getState();
  if (isSyncInFlight(sync)) {
    return;
  }
  const user = useSessionStore.getState().user;
  if (!user?.onboarded || shouldSkipCloudSync(user)) {
    if (sync.status === 'syncing') {
      sync.finish({ lastSyncedAt: Date.now(), message: null });
    }
    return;
  }
  const albums = useLibraryStore.getState().albums.filter((album) => album.origin === 'drive');

  sync.start();
  const startedAt = useSyncStore.getState().startedAt;
  const watchdog = setTimeout(() => {
    const current = useSyncStore.getState();
    if (current.status === 'syncing' && current.startedAt === startedAt) {
      current.finish({ lastSyncedAt: Date.now(), message: null });
    }
  }, SYNC_STALE_MS);

  try {
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
            ? 'Collega Google per aggiornare gli album da Drive.'
            : null),
      });
      return;
    }

  const selfSlug = user.authorSlug;
  let notesPulled = 0;
  let needsFolderLink = false;
  let added = 0;
  let removed = 0;
  let versioned = 0;
  let notesArchived = 0;

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

      const tree = await listDriveFolderTree(
        folderId,
        album.driveFolderName || album.name,
        album.driveRecursive ? 8 : 0,
      );
      const children = tree[0]?.children ?? [];
      const audios = tree.flatMap((node) => node.children.filter((file) => isAudioName(file.name)));
      const sidecars = tree.flatMap((node) => node.children.filter((file) => isSidecarName(file.name)));

      for (const remote of audios) {
        const existing = store
          .tracksIn('album', album.id)
          .find((track) => trackMatchesRemote(track, remote));

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
          added += 1;
          continue;
        }

        if (!remoteAudioChanged(existing, remote)) {
          store.updateTrackRemote(existing.id, metaFrom(remote));
          continue;
        }
        const beforeMarkers = store.markersByTrackId[existing.id] ?? [];
        const visibleBefore = beforeMarkers.filter((marker) => marker.hidden !== true).length;
        const destUri = await saveAudio(remote, existing.id, existing.downloaded === true);
        // New remote version: archive current notes automatically and clear waveform.
        if (existing.downloaded) {
          store.replaceTrackFile(existing.id, destUri, []);
        } else {
          store.setTrackInbox(existing.id, destUri);
          store.setTrackMarkers(existing.id, archiveAllMarkers(beforeMarkers));
        }
        store.updateTrackRemote(existing.id, metaFrom(remote));
        const afterMarkers = useLibraryStore.getState().markersByTrackId[existing.id] ?? [];
        refreshMarkersIfPlaying(existing.id, afterMarkers);
        reloadIfPlaying(existing.id);
        versioned += 1;
        notesArchived += visibleBefore;
      }

      const localTracks = useLibraryStore.getState().tracksIn('album', album.id);
      for (const track of localTracks) {
        if (trackPresentRemotely(track, audios)) {
          continue;
        }
        await useLibraryStore.getState().deleteTrack(track.id, { deleteFromDevice: true });
        removed += 1;
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
        const markersChanged =
          added > 0 || merged.some((marker, i) => marker.updatedAt !== before[i]?.updatedAt);
        const boundsChanged =
          (parsed.startMs !== undefined && parsed.startMs !== track.startMs) ||
          (parsed.endMs !== undefined && parsed.endMs !== track.endMs);
        const practiceChanged =
          parsed.exerciseOpenId !== track.exerciseOpenId ||
          parsed.exerciseCloseId !== track.exerciseCloseId ||
          parsed.practiceHoleId !== track.practiceHoleId;

        if (!markersChanged && !boundsChanged && !practiceChanged) {
          continue;
        }

        if (markersChanged) {
          notesPulled += added;
          store.setTrackMarkers(track.id, merged);
          refreshMarkersIfPlaying(track.id, merged);
        }

        if (boundsChanged) {
          store.setTrackBounds(
            track.id,
            parsed.startMs ?? track.startMs ?? 0,
            parsed.endMs ?? track.endMs ?? track.durationMs,
          );
        }

        if (practiceChanged) {
          store.setTrackPractice(track.id, {
            exerciseOpenId: parsed.exerciseOpenId,
            exerciseCloseId: parsed.exerciseCloseId,
            practiceHoleId: parsed.practiceHoleId,
          });
        }

        if (boundsChanged || practiceChanged) {
          refreshTrackFieldsIfPlaying(track.id);
        }
      }

      await applyDriveMediaTree(album.id, tree);

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
        pendingReviews: [],
        notesPulled,
        needsFolderLink,
        needsFileRefresh: false,
        message: syncAlbumMessage({
          added,
          removed,
          versioned,
          notesArchived,
          notesPulled,
          deviceMessage,
        }),
      });
    } catch {
      sync.fail('Allineamento non riuscito. Riprova tra un attimo.');
    }
  } finally {
    clearTimeout(watchdog);
  }
}

function refreshMarkersIfPlaying(trackId: string, markers: Marker[]) {
  const player = usePlayerStore.getState();
  if (player.track.id !== trackId) {
    return;
  }
  usePlayerStore.setState({ markers });
}

function refreshTrackFieldsIfPlaying(trackId: string) {
  const player = usePlayerStore.getState();
  if (player.track.id !== trackId) {
    return;
  }
  const next = useLibraryStore.getState().getTrack(trackId);
  if (!next) {
    return;
  }
  usePlayerStore.setState({
    track: {
      ...player.track,
      startMs: next.startMs,
      endMs: next.endMs,
      exerciseOpenId: next.exerciseOpenId,
      exerciseCloseId: next.exerciseCloseId,
      practiceHoleId: next.practiceHoleId,
    },
  });
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

function safeRemoteName(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, '-');
}

async function downloadDriveTemp(remote: DriveFile, prefix: string): Promise<string | null> {
  const dest = new File(inboxDirectory(), `${prefix}-${remote.id}-${safeRemoteName(remote.name)}`);
  try {
    await downloadDriveFile(remote.id, dest.uri);
    return dest.uri;
  } catch {
    if (dest.exists) {
      dest.delete();
    }
    return null;
  }
}

async function applyTrackCover(
  trackId: string,
  audioName: string,
  children: DriveFile[],
): Promise<void> {
  const cover = findTrackCoverFile(audioName, children);
  if (!cover) {
    return;
  }
  const temp = await downloadDriveTemp(cover, 'art');
  if (!temp) {
    return;
  }
  try {
    const uri = await saveArtworkFromUri(trackId, temp, cover.name, cover.mimeType);
    useLibraryStore.getState().setTrackArtwork(trackId, uri);
    refreshPlayingArtwork(trackId);
  } finally {
    const file = new File(temp);
    if (file.exists) {
      file.delete();
    }
  }
}

async function applyAlbumCoverFromFiles(albumId: string, children: DriveFile[]): Promise<void> {
  const cover = findAlbumCoverFile(children);
  if (!cover) {
    return;
  }
  const temp = await downloadDriveTemp(cover, 'cover');
  if (!temp) {
    return;
  }
  try {
    const uri = await saveArtworkFromUri(albumId, temp, cover.name, cover.mimeType);
    useLibraryStore.getState().setAlbumArtwork(albumId, uri);
  } finally {
    const file = new File(temp);
    if (file.exists) {
      file.delete();
    }
  }
}

function albumDocumentUnchanged(
  existing:
    | { remoteHash?: string; remoteModifiedAt?: string }
    | undefined,
  remote: DriveFile,
): boolean {
  if (!existing) {
    return false;
  }
  if (remote.md5Checksum && existing.remoteHash) {
    return existing.remoteHash === remote.md5Checksum;
  }
  if (remote.modifiedTime && existing.remoteModifiedAt) {
    return existing.remoteModifiedAt === remote.modifiedTime;
  }
  return false;
}

async function applyPdfsFromFiles(
  albumId: string,
  children: DriveFile[],
  folderPath?: string,
): Promise<void> {
  for (const pdf of children.filter((file) => isPdfName(file.name))) {
    const album = useLibraryStore.getState().albums.find((item) => item.id === albumId);
    const existing = album?.documents?.find((item) => item.driveFileId === pdf.id);
    if (albumDocumentUnchanged(existing, pdf)) {
      if (existing && existing.folderPath !== folderPath) {
        useLibraryStore.getState().upsertAlbumDocument(albumId, { ...existing, folderPath });
      }
      continue;
    }
    const temp = await downloadDriveTemp(pdf, 'pdf');
    if (!temp) {
      continue;
    }
    try {
      const fileUri = await saveDocumentFromUri(albumId, temp, pdf.name);
      useLibraryStore.getState().upsertAlbumDocument(albumId, {
        id: existing?.id ?? createId('doc'),
        name: pdf.name,
        fileUri,
        folderPath,
        driveFileId: pdf.id,
        remoteModifiedAt: pdf.modifiedTime,
        remoteHash: pdf.md5Checksum,
      });
    } finally {
      const file = new File(temp);
      if (file.exists) {
        file.delete();
      }
    }
  }
}

async function applyDriveMediaTree(
  albumId: string,
  tree: { id: string; parentId: string | null; name: string; children: DriveFile[] }[],
): Promise<void> {
  const root = tree[0];
  if (root) {
    await applyAlbumCoverFromFiles(albumId, root.children);
  }
  const tracks = useLibraryStore.getState().tracksIn('album', albumId);
  const keepPdfIds = new Set<string>();
  for (const node of tree) {
    const folderPath = node.parentId ? node.name : undefined;
    for (const pdf of node.children.filter((file) => isPdfName(file.name))) {
      keepPdfIds.add(pdf.id);
    }
    await applyPdfsFromFiles(albumId, node.children, folderPath);
    for (const track of tracks) {
      const audioName = track.sourceFileName ?? `${track.title}.m4a`;
      await applyTrackCover(track.id, audioName, node.children);
    }
  }
  const album = useLibraryStore.getState().albums.find((item) => item.id === albumId);
  for (const document of album?.documents ?? []) {
    if (document.driveFileId && !keepPdfIds.has(document.driveFileId)) {
      useLibraryStore.getState().deleteAlbumDocument(albumId, document.id);
    }
  }
}

async function importAudiosInFolder(
  albumId: string,
  appFolderId: string | null,
  children: DriveFile[],
): Promise<void> {
  const store = useLibraryStore.getState();
  const audios = children.filter((file) => isAudioName(file.name));
  const sidecars = children.filter((file) => isSidecarName(file.name));

  for (const remote of audios) {
    const existing = store.tracks.find(
      (track) =>
        track.driveFileId === remote.id ||
        (track.sourceFileName &&
          audioBasename(track.sourceFileName).toLowerCase() === audioBasename(remote.name).toLowerCase()),
    );
    if (existing) {
      if (appFolderId) {
        store.addTrackToFolder(existing.id, appFolderId);
      }
      store.addTracksToAlbum(albumId, [existing.id]);
      continue;
    }

    const id = createId('track');
    const inboxUri = await saveAudio(remote, id, false);
    let markers: Marker[] = [];
    const sidecar = sidecars.find(
      (file) => audioBasename(file.name).toLowerCase() === audioBasename(remote.name).toLowerCase(),
    );
    if (sidecar) {
      const dest = new File(inboxDirectory(), `import-${sidecar.id}.json`);
      try {
        await downloadDriveFile(sidecar.id, dest.uri);
        const parsed = parseSidecar(await dest.text());
        if (parsed?.markers) {
          markers = parsed.markers;
        }
      } catch {
        // audio still imports; notes can arrive on the next sync
      }
      if (dest.exists) {
        dest.delete();
      }
    }

    const album = store.albums.find((item) => item.id === albumId);
    store.importBundles(
      [
        {
          track: {
            id,
            title: titleFromFileName(remote.name),
            artist: album?.name ?? 'Drive',
            durationMs: 0,
            inboxUri,
            sourceFileName: remote.name,
            downloaded: false,
            ...metaFrom(remote),
          },
          markers,
        },
      ],
      { albumId, folderId: appFolderId ?? undefined },
    );
  }
}

export async function importDriveFolder(
  folderId: string,
  folderName: string,
  options?: { recursive?: boolean; albumId?: string },
): Promise<string> {
  const store = useLibraryStore.getState();
  const recursive = options?.recursive === true;
  const albumId =
    options?.albumId ??
    store.createAlbum(folderName, {
      origin: 'drive',
      artist: 'Drive',
      driveFolderName: folderName,
      driveFolderId: folderId,
      driveRecursive: recursive,
    });
  if (options?.albumId) {
    store.linkAlbumDrive(albumId, folderId, folderName, { driveRecursive: recursive });
  }

  const tree = await listDriveFolderTree(folderId, folderName, recursive ? 8 : 0);
  const driveToApp = new Map<string, string | null>();
  const rootAppId = recursive ? store.createFolder(folderName, null, { driveFolderId: folderId }) : null;
  driveToApp.set(folderId, rootAppId);

  for (const node of tree) {
    if (recursive) {
      for (const child of node.children.filter(isDriveFolder)) {
        if (driveToApp.has(child.id)) {
          continue;
        }
        const parentApp = driveToApp.get(node.id) ?? rootAppId;
        driveToApp.set(
          child.id,
          store.createFolder(child.name, parentApp, { driveFolderId: child.id }),
        );
      }
    }
    await importAudiosInFolder(albumId, driveToApp.get(node.id) ?? null, node.children);
  }

  await applyDriveMediaTree(albumId, tree);

  return albumId;
}
