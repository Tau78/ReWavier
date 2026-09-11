import { File } from 'expo-file-system';

import { shouldSkipCloudSync } from '../auth/demoAccount';
import {
  ORDER_FILE_NAME,
  buildAlbumOrder,
  isOrderManifestName,
  parseAlbumOrder,
  sortTracksByOrder,
} from '../domain/albumOrder';
import {
  ALBUM_NOTES_FILE_NAME,
  albumNotesFromRemote,
  isAlbumNotesFileName,
} from '../domain/albumNotes';
import { isAudioName, playableUri } from '../domain/audioFormats';
import {
  findAlbumCoverFile,
  findTrackCoverFile,
  isAlbumCoverName,
  isImageName,
  isPdfName,
} from '../domain/driveMedia';
import { canWriteWithRole, roleOfAlbum } from '../domain/folderRole';
import { createId, type Album } from '../domain/library';
import { mergeLyricAnnotations, type LyricAnnotation } from '../domain/lyrics';
import type { Marker, Track } from '../domain/models';
import { userHasUsage } from '../domain/session';
import {
  audioBasename,
  audioMatchKey,
  isSidecarName,
  parseSidecar,
  sidecarAuthorSlug,
  sidecarNameForAudio,
  titleFromFileName,
} from '../domain/sidecar';
import { saveArtworkFromUri } from '../files/albumArtwork';
import { saveDocumentFromUri } from '../files/albumDocuments';
import { copyToDownloads, ensureInboxDirectory, inboxDirectory } from '../files/downloads';
import { safeTempFileName } from '../files/fileNames';
import { writeSidecarToLibrary } from '../files/libraryFiles';
import { drivePeekNewsCount, isDownloadPausedError } from '../domain/collectionDownloadVisual';
import { throwIfDownloadPaused, useDownloadProgressStore } from '../store/downloadProgressStore';
import { flushLibraryPersist, useLibraryStore } from '../store/libraryStore';
import { refreshPlayingArtwork, usePlayerStore } from '../store/playerStore';
import { useSessionStore } from '../store/sessionStore';
import { isSyncInFlight, SYNC_STALE_MS, useSyncStore } from '../store/syncStore';
import { runDeviceSync } from './deviceSync/runDeviceSync';
import {
  downloadDriveFile,
  fetchFolderRole,
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
  claimRemote,
  createRemoteClaimSet,
  findBestLocalForRemote,
  remoteAudioChanged,
  remoteIsClaimed,
  remoteReplacesLocalTrack,
  surplusLocalTracks,
  uniqueRemotes,
} from './remoteAudioChange';

function syncAlbumMessage(input: {
  added: number;
  removed: number;
  versioned: number;
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
      input.versioned === 1 ? '1 brano da aggiornare' : `${input.versioned} brani da aggiornare`,
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

function reportDriveFraction(fraction: number) {
  useDownloadProgressStore.getState().setFileFraction(fraction);
}

/** Best-effort Drive capabilities → album.driveRole. Never throws. */
export async function refreshAlbumDriveRole(albumId: string): Promise<void> {
  try {
    const album = useLibraryStore.getState().albums.find((item) => item.id === albumId);
    if (!album?.driveFolderId) {
      return;
    }
    const role = await fetchFolderRole(album.driveFolderId);
    useLibraryStore.getState().setAlbumDriveRole(albumId, role);
  } catch {
    const album = useLibraryStore.getState().albums.find((item) => item.id === albumId);
    if (album?.driveFolderId && album.driveRole == null) {
      useLibraryStore.getState().setAlbumDriveRole(albumId, 'editor');
    }
  }
}

function finishDriveItem() {
  useDownloadProgressStore.getState().advance();
}

function uniqueTracksById(tracks: Track[]): Track[] {
  const seen = new Set<string>();
  const out: Track[] = [];
  for (const track of tracks) {
    if (seen.has(track.id)) {
      continue;
    }
    seen.add(track.id);
    out.push(track);
  }
  return out;
}

/** Album rows plus tracks that only live in Drive version folders. */
function albumLocalTracks(albumId: string, treeFolderIds?: ReadonlySet<string>): Track[] {
  const store = useLibraryStore.getState();
  const out = [...store.tracksIn('album', albumId)];
  if (!treeFolderIds || treeFolderIds.size === 0) {
    return uniqueTracksById(out);
  }
  for (const folder of store.folders) {
    if (folder.driveFolderId && treeFolderIds.has(folder.driveFolderId)) {
      out.push(...store.tracksIn('folder', folder.id));
    }
  }
  return uniqueTracksById(out);
}

export type DriveAlbumPeek = {
  newRemoteCount: number;
  changedTrackIds: string[];
};

/** Elenca Drive senza scaricare: brani nuovi o versioni cambiate. */
export async function peekDriveAlbum(albumId: string): Promise<DriveAlbumPeek> {
  const empty: DriveAlbumPeek = { newRemoteCount: 0, changedTrackIds: [] };
  const album = useLibraryStore.getState().albums.find((item) => item.id === albumId);
  if (!album || album.origin !== 'drive') {
    useDownloadProgressStore.getState().setDriveNews(albumId, 0);
    return empty;
  }
  if (!(await hasDriveToken())) {
    useDownloadProgressStore.getState().setDriveNews(albumId, 0);
    return empty;
  }
  let folderId = album.driveFolderId;
  if (!folderId) {
    const found = await findFolderByName(album.driveFolderName || album.name);
    if (found) {
      folderId = found.id;
      useLibraryStore.getState().linkAlbumDrive(album.id, found.id, found.name);
      await refreshAlbumDriveRole(album.id);
    }
  }
  if (!folderId) {
    useDownloadProgressStore.getState().setDriveNews(albumId, 0);
    return empty;
  }

  const { nodes: tree } = await listDriveFolderTree(
    folderId,
    album.driveFolderName || album.name,
    album.driveRecursive ? 8 : 0,
    album.driveSharedDriveId ? { sharedDriveId: album.driveSharedDriveId } : undefined,
  );
  const treeFolderIds = new Set(tree.map((node) => node.id));
  const audios = uniqueRemotes(
    tree.flatMap((node) => node.children.filter((file) => isAudioName(file.name))),
  );
  const locals = albumLocalTracks(album.id, treeFolderIds);
  const claimed = createRemoteClaimSet();
  let newRemoteCount = 0;
  const changedTrackIds: string[] = [];

  for (const remote of audios) {
    if (remoteIsClaimed(claimed, remote)) {
      continue;
    }
    const existing = findBestLocalForRemote(locals, remote);
    if (!existing) {
      newRemoteCount += 1;
      continue;
    }
    claimRemote(claimed, remote);
    if (existing.driveFileId && existing.driveFileId !== remote.id) {
      // Same name, new Drive id, old id gone → delete+reupload. Keep twins in version folders.
      if (remoteReplacesLocalTrack(existing, remote, audios)) {
        useLibraryStore.getState().markTrackNeedsUpdate(existing.id, metaFrom(remote));
        changedTrackIds.push(existing.id);
      }
      continue;
    }
    if (remoteAudioChanged(existing, remote)) {
      useLibraryStore.getState().markTrackNeedsUpdate(existing.id, metaFrom(remote));
      changedTrackIds.push(existing.id);
    }
  }

  useDownloadProgressStore.getState().setDriveNews(albumId, drivePeekNewsCount({
    newRemoteCount,
    changedTrackIds,
  }));
  await flushLibraryPersist();
  return { newRemoteCount, changedTrackIds };
}

function countDriveImportJobs(
  tree: { children: DriveFile[] }[],
): number {
  let total = 0;
  const root = tree[0];
  if (root && findAlbumCoverFile(root.children)) {
    total += 1;
  }
  for (const node of tree) {
    const audios = node.children.filter((file) => isAudioName(file.name));
    total += audios.length;
    total += node.children.filter((file) => isPdfName(file.name)).length;
    for (const audio of audios) {
      if (findTrackCoverFile(audio.name, node.children)) {
        total += 1;
      }
    }
  }
  return total;
}

async function saveAudio(remote: DriveFile, trackId: string, _downloaded: boolean): Promise<string> {
  throwIfDownloadPaused();
  const dest = new File(inboxDirectory(), safeTempFileName('sync', trackId, remote.name));
  const uri = await downloadDriveFile(remote.id, dest.uri, reportDriveFraction);
  const stored = await copyToDownloads(uri, trackId, remote.name);
  try {
    dest.delete();
  } catch {
    // temp file already gone
  }
  return stored;
}

type CloudSyncJobKind = 'full' | 'album';

let cloudSyncJob: Promise<void> | null = null;
let cloudSyncJobKind: CloudSyncJobKind | null = null;

/** True while the same onboarded user that started this sync is still signed in. */
function isCloudSyncUserActive(expectedUserId: string): boolean {
  const current = useSessionStore.getState().user;
  return Boolean(
    current &&
      current.id === expectedUserId &&
      current.onboarded &&
      !shouldSkipCloudSync(current),
  );
}

/**
 * One Drive pass at a time. Album-only jobs are not a full sync: wait for them,
 * then run `runCloudSyncBody`. Concurrent full callers share the same full job.
 */
export function runCloudSync(): Promise<void> {
  if (cloudSyncJob && cloudSyncJobKind === 'full') {
    return cloudSyncJob;
  }
  const prev = cloudSyncJob;
  const job = (async () => {
    if (prev) {
      try {
        await prev;
      } catch {
        // previous pass failed — still run full sync
      }
    }
    await runCloudSyncBody();
  })().finally(() => {
    if (cloudSyncJob === job) {
      cloudSyncJob = null;
      cloudSyncJobKind = null;
    }
  });
  cloudSyncJob = job;
  cloudSyncJobKind = 'full';
  return job;
}

/** Await every in-flight Drive pass (full or album), including jobs chained after. */
export async function settleCloudSync(): Promise<void> {
  while (cloudSyncJob) {
    const job = cloudSyncJob;
    try {
      await job;
    } catch {
      // caller only needs the job to finish
    }
    if (cloudSyncJob === job) {
      // finally should have cleared; avoid spinning if not
      return;
    }
  }
}

type SyncOneDriveAlbumResult = {
  added: number;
  removed: number;
  versioned: number;
  notesPulled: number;
  needsFolderLink: boolean;
  aborted: boolean;
};

/**
 * Sync one Drive album: remotes, sidecars, media tree, order, notes.
 * On user/logout abort, finishes the sync store and returns `aborted: true`.
 */
async function syncOneDriveAlbum(
  album: Album,
  expectedUserId: string,
  selfSlug: string | undefined,
): Promise<SyncOneDriveAlbumResult> {
  const empty = {
    added: 0,
    removed: 0,
    versioned: 0,
    notesPulled: 0,
    needsFolderLink: false,
    aborted: false,
  };
  const sync = useSyncStore.getState();
  const store = useLibraryStore.getState();

  if (!isCloudSyncUserActive(expectedUserId)) {
    sync.finish({ lastSyncedAt: Date.now(), message: null });
    return { ...empty, aborted: true };
  }
  throwIfDownloadPaused();
  let folderId = album.driveFolderId;
  if (!folderId) {
    const found = await findFolderByName(album.driveFolderName || album.name);
    if (!isCloudSyncUserActive(expectedUserId)) {
      sync.finish({ lastSyncedAt: Date.now(), message: null });
      return { ...empty, aborted: true };
    }
    if (found) {
      folderId = found.id;
      store.linkAlbumDrive(album.id, found.id, found.name);
    }
  }
  if (!folderId) {
    return { ...empty, needsFolderLink: true };
  }

  await refreshAlbumDriveRole(album.id);
  if (!isCloudSyncUserActive(expectedUserId)) {
    sync.finish({ lastSyncedAt: Date.now(), message: null });
    return { ...empty, aborted: true };
  }

  const { nodes: tree, truncated: treeTruncated } = await listDriveFolderTree(
    folderId,
    album.driveFolderName || album.name,
    album.driveRecursive ? 8 : 0,
    album.driveSharedDriveId ? { sharedDriveId: album.driveSharedDriveId } : undefined,
  );
  if (!isCloudSyncUserActive(expectedUserId)) {
    sync.finish({ lastSyncedAt: Date.now(), message: null });
    return { ...empty, aborted: true };
  }
  const children = tree[0]?.children ?? [];
  const treeFolderIds = new Set(tree.map((node) => node.id));
  const audios = uniqueRemotes(
    tree.flatMap((node) => node.children.filter((file) => isAudioName(file.name))),
  );
  const sidecars = tree.flatMap((node) => node.children.filter((file) => isSidecarName(file.name)));
  const importedRemotes = createRemoteClaimSet();
  // One snapshot per album pass — refreshed after imports that add tracks.
  let locals = albumLocalTracks(album.id, treeFolderIds);

  let added = 0;
  let removed = 0;
  let versioned = 0;
  let notesPulled = 0;

  for (const remote of audios) {
    if (!isCloudSyncUserActive(expectedUserId)) {
      sync.finish({ lastSyncedAt: Date.now(), message: null });
      return { ...empty, added, removed, versioned, notesPulled, aborted: true };
    }
    throwIfDownloadPaused();
    if (remoteIsClaimed(importedRemotes, remote)) {
      continue;
    }
    const existing = findBestLocalForRemote(locals, remote);
    const onAlbum = new Set(
      useLibraryStore.getState().tracksIn('album', album.id).map((track) => track.id),
    );

    if (!existing) {
      const id = createId('track');
      const fileUri = await saveAudio(remote, id, false);
      if (!isCloudSyncUserActive(expectedUserId)) {
        sync.finish({ lastSyncedAt: Date.now(), message: null });
        return { ...empty, added, removed, versioned, notesPulled, aborted: true };
      }
      locals = albumLocalTracks(album.id, treeFolderIds);
      const appeared = findBestLocalForRemote(locals, remote);
      if (appeared) {
        if (!onAlbum.has(appeared.id)) {
          store.addTracksToAlbum(album.id, [appeared.id]);
          added += 1;
        }
        claimRemote(importedRemotes, remote);
        continue;
      }
      store.importBundles(
        [
          {
            track: {
              id,
              title: titleFromFileName(remote.name),
              artist: album.name,
              durationMs: 0,
              fileUri,
              sourceFileName: remote.name,
              downloaded: true,
              downloadedAt: Date.now(),
              ...metaFrom(remote),
            },
            markers: [],
          },
        ],
        { albumId: album.id },
      );
      locals = albumLocalTracks(album.id, treeFolderIds);
      added += 1;
      claimRemote(importedRemotes, remote);
      continue;
    }

    if (!onAlbum.has(existing.id)) {
      store.addTracksToAlbum(album.id, [existing.id]);
    }
    claimRemote(importedRemotes, remote);

    // Same name in a version folder: keep the local row, do not import another.
    // Delete+reupload (old Drive id gone) adopts the new file id instead.
    if (existing.driveFileId && existing.driveFileId !== remote.id) {
      if (remoteReplacesLocalTrack(existing, remote, audios)) {
        store.markTrackNeedsUpdate(existing.id, metaFrom(remote));
        versioned += 1;
      }
      continue;
    }

    if (!remoteAudioChanged(existing, remote)) {
      store.updateTrackRemote(existing.id, metaFrom(remote));
      continue;
    }
    // Keep the file on the phone until the user taps Aggiorna — replacing it
    // while it is playing can freeze the app.
    store.markTrackNeedsUpdate(existing.id, metaFrom(remote));
    versioned += 1;
  }

  // Incomplete Drive view (tree node cap or folder page cap): never surplus-delete.
  // A truncated listing would look like missing remotes and wipe local tracks.
  if (treeTruncated) {
    if (__DEV__) {
      console.warn(
        `[sync] skip surplus delete for album ${album.id}: Drive tree truncated`,
      );
    }
  } else {
    const extras = surplusLocalTracks(locals, audios);
    for (const track of extras) {
      if (!isCloudSyncUserActive(expectedUserId)) {
        sync.finish({ lastSyncedAt: Date.now(), message: null });
        return { ...empty, added, removed, versioned, notesPulled, aborted: true };
      }
      // Version-folder twins are a product feature — never hard-delete as surplus.
      const liveAlbum =
        useLibraryStore.getState().albums.find((item) => item.id === album.id) ?? album;
      if (
        (liveAlbum.versionFolders ?? []).some((folder) => folder.trackIds.includes(track.id))
      ) {
        continue;
      }
      await useLibraryStore.getState().deleteTrack(track.id, { deleteFromDevice: true });
      removed += 1;
    }
    // Sidecar apply must not revive deleted IDs via setTrackMarkers on a stale snapshot.
    locals = albumLocalTracks(album.id, treeFolderIds);
  }

  for (const remote of sidecars) {
    if (!isCloudSyncUserActive(expectedUserId)) {
      sync.finish({ lastSyncedAt: Date.now(), message: null });
      return { ...empty, added, removed, versioned, notesPulled, aborted: true };
    }
    const slug = sidecarAuthorSlug(remote.name);
    if (slug && slug === selfSlug) {
      continue;
    }
    const dest = new File(inboxDirectory(), `sync-${remote.id}.json`);
    await downloadDriveFile(remote.id, dest.uri);
    if (!isCloudSyncUserActive(expectedUserId)) {
      if (dest.exists) {
        dest.delete();
      }
      sync.finish({ lastSyncedAt: Date.now(), message: null });
      return { ...empty, added, removed, versioned, notesPulled, aborted: true };
    }
    const parsed = parseSidecar(await dest.text());
    if (dest.exists) {
      dest.delete();
    }
    if (!parsed) {
      continue;
    }
    const track = locals.find(
      (item) =>
        audioMatchKey(item.sourceFileName ?? item.title) ===
        audioMatchKey(parsed.audioFileName || remote.name),
    );
    if (!track) {
      continue;
    }
    const before = store.markersByTrackId[track.id] ?? [];
    const merged = mergeMarkers(before, parsed.markers);
    const addedMarkers = merged.filter((marker) => !before.some((item) => item.id === marker.id)).length;
    // Compare by marker id → updatedAt (mergeMarkers may reorder; index compare storms persist).
    const beforeUpdatedAt = new Map(before.map((marker) => [marker.id, marker.updatedAt]));
    const markersChanged =
      addedMarkers > 0 ||
      merged.length !== before.length ||
      merged.some((marker) => beforeUpdatedAt.get(marker.id) !== marker.updatedAt);
    const boundsChanged =
      (parsed.startMs !== undefined && parsed.startMs !== track.startMs) ||
      (parsed.endMs !== undefined && parsed.endMs !== track.endMs);
    const practiceChanged =
      parsed.exerciseOpenId !== track.exerciseOpenId ||
      parsed.exerciseCloseId !== track.exerciseCloseId ||
      parsed.practiceHoleId !== track.practiceHoleId;
    const scoreChanged =
      (parsed.lyrics !== undefined && parsed.lyrics !== track.lyrics) ||
      (parsed.chords !== undefined && parsed.chords !== track.chords);
    const annotationsMerged = mergeLyricAnnotations(
      track.lyricAnnotations ?? [],
      parsed.lyricAnnotations ?? [],
    );
    const annotationsChanged =
      annotationsMerged.length !== (track.lyricAnnotations ?? []).length ||
      annotationsMerged.some((item, i) => {
        const beforeAnn = (track.lyricAnnotations ?? [])[i];
        return !beforeAnn || item.id !== beforeAnn.id || item.updatedAt !== beforeAnn.updatedAt;
      });

    if (
      !markersChanged &&
      !boundsChanged &&
      !practiceChanged &&
      !scoreChanged &&
      !annotationsChanged
    ) {
      continue;
    }

    if (markersChanged) {
      notesPulled += addedMarkers;
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

    if (scoreChanged) {
      if (parsed.lyrics !== undefined && parsed.lyrics !== track.lyrics) {
        store.setTrackLyrics(track.id, parsed.lyrics);
      }
      if (parsed.chords !== undefined && parsed.chords !== track.chords) {
        store.setTrackChords(track.id, parsed.chords);
      }
    }

    if (annotationsChanged) {
      store.setTrackLyricAnnotations(track.id, annotationsMerged);
    }

    if (boundsChanged || practiceChanged) {
      refreshTrackFieldsIfPlaying(track.id);
    }
  }

  if (!isCloudSyncUserActive(expectedUserId)) {
    sync.finish({ lastSyncedAt: Date.now(), message: null });
    return { ...empty, added, removed, versioned, notesPulled, aborted: true };
  }
  await applyDriveMediaTree(album.id, tree, { skipSurplusDeletes: treeTruncated });
  if (!isCloudSyncUserActive(expectedUserId)) {
    sync.finish({ lastSyncedAt: Date.now(), message: null });
    return { ...empty, added, removed, versioned, notesPulled, aborted: true };
  }

  const orderRemote = children.find((file) => isOrderManifestName(file.name));
  if (orderRemote) {
    const dest = new File(inboxDirectory(), `sync-order-${album.id}.json`);
    await downloadDriveFile(orderRemote.id, dest.uri);
    if (!isCloudSyncUserActive(expectedUserId)) {
      if (dest.exists) {
        dest.delete();
      }
      sync.finish({ lastSyncedAt: Date.now(), message: null });
      return { ...empty, added, removed, versioned, notesPulled, aborted: true };
    }
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

  if (!isCloudSyncUserActive(expectedUserId)) {
    sync.finish({ lastSyncedAt: Date.now(), message: null });
    return { ...empty, added, removed, versioned, notesPulled, aborted: true };
  }
  await syncAlbumNotes(album.id, children);

  store.touchAlbumSync(album.id);
  await refreshAlbumDriveRole(album.id);

  return { added, removed, versioned, notesPulled, needsFolderLink: false, aborted: false };
}

/** Sync a single Drive album (Aggiorna). Skips device sync and other albums. */
export type SyncDriveAlbumResult = {
  added: number;
  removed: number;
  versioned: number;
  notesPulled: number;
  /** Why we did not sync (caller can show a clear message). */
  skipped?: 'no-album' | 'no-google' | 'demo';
};

/**
 * Align one Drive album: import new remotes, mark changed files, pull notes.
 * Queued on `cloudSyncJob` so Aggiorna waits for any in-flight Drive pass
 * instead of returning immediately with no UI feedback.
 */
export async function syncDriveAlbum(albumId: string): Promise<SyncDriveAlbumResult> {
  let outcome: SyncDriveAlbumResult = { added: 0, removed: 0, versioned: 0, notesPulled: 0 };
  const prev = cloudSyncJob;
  const job = (async () => {
    if (prev) {
      try {
        await prev;
      } catch {
        // previous pass failed — still try this album
      }
    }
    outcome = await runSyncDriveAlbumBody(albumId);
  })().finally(() => {
    if (cloudSyncJob === job) {
      cloudSyncJob = null;
      cloudSyncJobKind = null;
    }
  });
  cloudSyncJob = job;
  cloudSyncJobKind = 'album';
  await job;
  return outcome;
}

async function runSyncDriveAlbumBody(albumId: string): Promise<SyncDriveAlbumResult> {
  const empty: SyncDriveAlbumResult = { added: 0, removed: 0, versioned: 0, notesPulled: 0 };
  await flushLibraryPersist();

  const sync = useSyncStore.getState();
  const user = useSessionStore.getState().user;
  if (!user?.onboarded || shouldSkipCloudSync(user)) {
    if (sync.status === 'syncing') {
      sync.finish({ lastSyncedAt: Date.now(), message: null });
    }
    return { ...empty, skipped: 'demo' };
  }
  const expectedUserId = user.id;
  const album = useLibraryStore
    .getState()
    .albums.find((item) => item.id === albumId && item.origin === 'drive');
  if (!album) {
    return { ...empty, skipped: 'no-album' };
  }

  sync.start();
  const startedAt = useSyncStore.getState().startedAt;
  const watchdog = setTimeout(() => {
    const current = useSyncStore.getState();
    if (current.status === 'syncing' && current.startedAt === startedAt) {
      current.finish({ lastSyncedAt: Date.now(), message: null });
    }
  }, SYNC_STALE_MS);

  try {
    if (!isCloudSyncUserActive(expectedUserId)) {
      sync.finish({ lastSyncedAt: Date.now(), message: null });
      return empty;
    }

    const google = await hasDriveToken();
    if (!isCloudSyncUserActive(expectedUserId)) {
      sync.finish({ lastSyncedAt: Date.now(), message: null });
      return empty;
    }
    if (!google) {
      sync.finish({
        lastSyncedAt: Date.now(),
        needsFileRefresh: true,
        message: 'Collega Google per aggiornare gli album da Drive.',
      });
      return { ...empty, skipped: 'no-google' };
    }

    try {
      const result = await syncOneDriveAlbum(album, expectedUserId, user.authorSlug);
      if (result.aborted) {
        return empty;
      }
      if (!isCloudSyncUserActive(expectedUserId)) {
        sync.finish({ lastSyncedAt: Date.now(), message: null });
        return empty;
      }
      sync.finish({
        lastSyncedAt: Date.now(),
        pendingReviews: [],
        notesPulled: result.notesPulled,
        needsFolderLink: result.needsFolderLink,
        needsFileRefresh: false,
        message: syncAlbumMessage({
          added: result.added,
          removed: result.removed,
          versioned: result.versioned,
          notesPulled: result.notesPulled,
          deviceMessage: '',
        }),
      });
      return {
        added: result.added,
        removed: result.removed,
        versioned: result.versioned,
        notesPulled: result.notesPulled,
      };
    } catch (error) {
      if (isDownloadPausedError(error)) {
        sync.finish({ lastSyncedAt: Date.now(), message: null });
        return empty;
      }
      sync.fail('Allineamento non riuscito. Riprova tra un attimo.');
      throw error;
    }
  } finally {
    clearTimeout(watchdog);
  }
}

async function runCloudSyncBody(): Promise<void> {
  await flushLibraryPersist();
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
  const expectedUserId = user.id;
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

    if (!isCloudSyncUserActive(expectedUserId)) {
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
    if (!isCloudSyncUserActive(expectedUserId)) {
      sync.finish({ lastSyncedAt: Date.now(), message: null });
      return;
    }
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

    try {
      for (const album of albums) {
        const result = await syncOneDriveAlbum(album, expectedUserId, selfSlug);
        if (result.aborted) {
          return;
        }
        added += result.added;
        removed += result.removed;
        versioned += result.versioned;
        notesPulled += result.notesPulled;
        if (result.needsFolderLink) {
          needsFolderLink = true;
        }
      }

      if (!isCloudSyncUserActive(expectedUserId)) {
        sync.finish({ lastSyncedAt: Date.now(), message: null });
        return;
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
          notesPulled,
          deviceMessage,
        }),
      });
    } catch (error) {
      if (isDownloadPausedError(error)) {
        sync.finish({ lastSyncedAt: Date.now(), message: null });
        return;
      }
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

async function syncAlbumNotes(
  albumId: string,
  children: { id: string; name: string; modifiedTime?: string }[],
): Promise<void> {
  const album = useLibraryStore.getState().albums.find((item) => item.id === albumId);
  if (!album) {
    return;
  }
  const remote = children.find((file) => isAlbumNotesFileName(file.name));
  if (remote) {
    const dest = new File(inboxDirectory(), `sync-notes-${albumId}.txt`);
    await downloadDriveFile(remote.id, dest.uri);
    const remoteNotes = dest.exists ? await dest.text() : '';
    if (dest.exists) {
      dest.delete();
    }
    const remoteUpdatedAt = remote.modifiedTime ? Date.parse(remote.modifiedTime) || 0 : 0;
    const next = albumNotesFromRemote(
      album.notes,
      album.notesUpdatedAt ?? 0,
      remoteNotes,
      remoteUpdatedAt,
    );
    if (next) {
      useLibraryStore.getState().setAlbumNotes(albumId, next.notes, {
        updatedAt: next.updatedAt,
        fromCloud: true,
      });
      return;
    }
    if ((album.notes ?? '').trim() && (album.notesUpdatedAt ?? 0) >= remoteUpdatedAt) {
      await pushAlbumNotes(albumId);
    }
    return;
  }
  if ((album.notes ?? '').trim()) {
    await pushAlbumNotes(albumId);
  }
}

export async function pushAlbumNotes(albumId: string): Promise<void> {
  const album = sharedDriveAlbum(albumId);
  if (!album?.driveFolderId || !canWriteWithRole(roleOfAlbum(album))) {
    return;
  }
  const text = album.notes ?? '';
  if (!text.trim()) {
    return;
  }
  if (!(await hasDriveToken())) {
    return;
  }
  const dest = new File(inboxDirectory(), `notes-${albumId}.txt`);
  dest.write(text);
  const existing =
    (await findChildByName(album.driveFolderId, ALBUM_NOTES_FILE_NAME)) ??
    (await findChildByName(album.driveFolderId, 'rewavier.notes.txt'));
  if (existing) {
    await updateDriveFileMedia(existing.id, dest.uri, 'text/plain');
    return;
  }
  await uploadDriveFile({
    name: ALBUM_NOTES_FILE_NAME,
    folderId: album.driveFolderId,
    fileUri: dest.uri,
    mimeType: 'text/plain',
  });
}

export async function pushAlbumOrder(albumId: string): Promise<void> {
  const album = sharedDriveAlbum(albumId);
  if (!album?.driveFolderId || !canWriteWithRole(roleOfAlbum(album))) {
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
  if (audioMatchKey(oldSourceFileName) === audioMatchKey(newAudioName)) {
    return;
  }

  if (!folderId && track.driveFileId) {
    try {
      folderId = await getDriveFileParentId(track.driveFileId);
    } catch {
      folderId = undefined;
    }
  }

  const children = folderId ? (await listFolderChildren(folderId)).files : [];
  let audioId = track.driveFileId;
  if (!audioId && folderId) {
    const match = children.find(
      (file) =>
        isAudioName(file.name) &&
        (file.name.toLowerCase() === oldSourceFileName.toLowerCase() ||
          audioMatchKey(file.name) === audioMatchKey(oldSourceFileName)),
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
        audioMatchKey(file.name) === audioMatchKey(oldSourceFileName),
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
  if (!album?.driveFolderId || !track || !canWriteWithRole(roleOfAlbum(album))) {
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

async function downloadDriveTemp(remote: DriveFile, prefix: string): Promise<string | null> {
  const dest = new File(inboxDirectory(), safeTempFileName(prefix, remote.id, remote.name));
  try {
    await downloadDriveFile(remote.id, dest.uri, reportDriveFraction);
    return dest.uri;
  } catch {
    if (dest.exists) {
      dest.delete();
    }
    return null;
  }
}

async function applyTrackCover(trackId: string, cover: DriveFile): Promise<void> {
  const temp = await downloadDriveTemp(cover, 'art');
  if (!temp) {
    finishDriveItem();
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
    finishDriveItem();
  }
}

/** One cover image per audio basename across the tree (last folder wins). */
function buildTrackCoverByAudioBase(
  tree: { children: DriveFile[] }[],
): Map<string, DriveFile> {
  const coverByBase = new Map<string, DriveFile>();
  for (const node of tree) {
    for (const file of node.children) {
      if (!isImageName(file.name) || isAlbumCoverName(file.name)) {
        continue;
      }
      const base = audioBasename(file.name).toLowerCase();
      if (base) {
        coverByBase.set(base, file);
      }
    }
  }
  return coverByBase;
}

async function applyAlbumCoverFromFiles(albumId: string, children: DriveFile[]): Promise<void> {
  const cover = findAlbumCoverFile(children);
  if (!cover) {
    return;
  }
  const temp = await downloadDriveTemp(cover, 'cover');
  if (!temp) {
    finishDriveItem();
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
    finishDriveItem();
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
      finishDriveItem();
      continue;
    }
    const temp = await downloadDriveTemp(pdf, 'pdf');
    if (!temp) {
      finishDriveItem();
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
      finishDriveItem();
    }
  }
}

async function applyDriveMediaTree(
  albumId: string,
  tree: { id: string; parentId: string | null; name: string; children: DriveFile[] }[],
  options?: { skipSurplusDeletes?: boolean },
): Promise<void> {
  const root = tree[0];
  if (root) {
    await applyAlbumCoverFromFiles(albumId, root.children);
  }
  const tracks = useLibraryStore.getState().tracksIn('album', albumId);
  const coverByAudioBase = buildTrackCoverByAudioBase(tree);
  const keepPdfIds = new Set<string>();
  for (const node of tree) {
    const folderPath = node.parentId ? node.name : undefined;
    for (const pdf of node.children.filter((file) => isPdfName(file.name))) {
      keepPdfIds.add(pdf.id);
    }
    await applyPdfsFromFiles(albumId, node.children, folderPath);
  }
  // One download per track (not per tree node × track).
  for (const track of tracks) {
    const audioName = track.sourceFileName ?? `${track.title}.m4a`;
    const base = audioBasename(audioName).toLowerCase();
    const cover = base ? coverByAudioBase.get(base) : undefined;
    if (cover) {
      await applyTrackCover(track.id, cover);
    }
  }
  // Same rule as surplus tracks: never delete docs from an incomplete Drive view.
  if (options?.skipSurplusDeletes) {
    return;
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
  const audios = uniqueRemotes(
    children
      .filter((file) => isAudioName(file.name))
      .sort((left, right) =>
        left.name.localeCompare(right.name, 'it', { numeric: true, sensitivity: 'base' }),
      ),
  );
  const sidecars = children.filter((file) => isSidecarName(file.name));
  const importedRemotes = createRemoteClaimSet();

  for (const remote of audios) {
    if (remoteIsClaimed(importedRemotes, remote)) {
      finishDriveItem();
      continue;
    }
    const store = useLibraryStore.getState();
    const existing = findBestLocalForRemote(store.tracks, remote);
    if (existing) {
      if (appFolderId) {
        store.addTrackToFolder(existing.id, appFolderId);
      }
      store.addTracksToAlbum(albumId, [existing.id]);
      claimRemote(importedRemotes, remote);
      finishDriveItem();
      continue;
    }

    const id = createId('track');
    const fileUri = await saveAudio(remote, id, false);
    finishDriveItem();
    const afterDownload = useLibraryStore.getState();
    const appeared = findBestLocalForRemote(afterDownload.tracks, remote);
    if (appeared) {
      if (appFolderId) {
        afterDownload.addTrackToFolder(appeared.id, appFolderId);
      }
      afterDownload.addTracksToAlbum(albumId, [appeared.id]);
      claimRemote(importedRemotes, remote);
      continue;
    }
    let markers: Marker[] = [];
    let lyrics: string | undefined;
    let lyricAnnotations: LyricAnnotation[] | undefined;
    let chords: string | undefined;
    const sidecar = sidecars.find(
      (file) => audioMatchKey(file.name) === audioMatchKey(remote.name),
    );
    if (sidecar) {
      const dest = new File(inboxDirectory(), `import-${sidecar.id}.json`);
      try {
        await downloadDriveFile(sidecar.id, dest.uri);
        const parsed = parseSidecar(await dest.text());
        if (parsed?.markers) {
          markers = parsed.markers;
        }
        lyrics = parsed?.lyrics;
        lyricAnnotations = parsed?.lyricAnnotations;
        chords = parsed?.chords;
      } catch {
        // audio still imports; notes can arrive on the next sync
      }
      if (dest.exists) {
        dest.delete();
      }
    }

    const album = afterDownload.albums.find((item) => item.id === albumId);
    afterDownload.importBundles(
      [
        {
          track: {
            id,
            title: titleFromFileName(remote.name),
            artist: album?.name ?? 'Drive',
            durationMs: 0,
            fileUri,
            sourceFileName: remote.name,
            downloaded: true,
            downloadedAt: Date.now(),
            lyrics,
            lyricAnnotations,
            chords,
            ...metaFrom(remote),
          },
          markers,
        },
      ],
      { albumId, folderId: appFolderId ?? undefined },
    );
    claimRemote(importedRemotes, remote);
  }
}

export async function importDriveFolder(
  folderId: string,
  folderName: string,
  options?: { recursive?: boolean; albumId?: string; sharedDriveId?: string },
): Promise<string> {
  const store = useLibraryStore.getState();
  const recursive = options?.recursive === true;
  const sharedDriveId = options?.sharedDriveId;
  await ensureInboxDirectory();
  const albumId =
    options?.albumId ??
    store.createAlbum(folderName, {
      origin: 'drive',
      artist: 'Drive',
      driveFolderName: folderName,
      driveFolderId: folderId,
      driveSharedDriveId: sharedDriveId,
      driveRecursive: recursive,
    });
  if (options?.albumId) {
    store.linkAlbumDrive(albumId, folderId, folderName, {
      driveRecursive: recursive,
      driveSharedDriveId: sharedDriveId,
    });
  }
  await refreshAlbumDriveRole(albumId);

  const { nodes: tree, truncated: treeTruncated } = await listDriveFolderTree(
    folderId,
    folderName,
    recursive ? 8 : 0,
    sharedDriveId ? { sharedDriveId } : undefined,
  );
  const progress = useDownloadProgressStore.getState();
  progress.begin(countDriveImportJobs(tree));
  try {
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

    await applyDriveMediaTree(albumId, tree, { skipSurplusDeletes: treeTruncated });
    return albumId;
  } finally {
    progress.end();
  }
}
