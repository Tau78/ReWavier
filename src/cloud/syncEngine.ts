import { File } from 'expo-file-system';

import { shouldSkipCloudSync } from '../auth/demoAccount';
import {
  ORDER_FILE_NAME,
  ORDER_FILE_NAME_LEGACY,
  buildAlbumOrderFile,
  isOrderManifestName,
  parseAlbumOrder,
  shouldApplyRemoteAlbumOrder,
  shouldPushLocalAlbumOrder,
  type AlbumOrderFile,
} from '../domain/albumOrder';
import {
  ALBUM_NOTES_FILE_NAME,
  albumNotesFromRemote,
  isAlbumNotesFileName,
} from '../domain/albumNotes';
import {
  MEMBERS_FILE_NAME,
  buildAlbumMembersFile,
  isAlbumMembersFileName,
  memberColorMapFromFile,
  memberEmailMapFromFile,
  memberNameMapFromFile,
  parseAlbumMembersFile,
  shouldApplyRemoteMembers,
} from '../domain/albumMembers';
import { albumMentionCandidates } from '../domain/albumPeople';
import { normalizeDisplayName } from '../domain/displayNames';
import { isDriveAudio, isDownloaded, playableUri } from '../domain/audioFormats';
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
import { awaitJobOrTimeout, ALBUM_REFRESH_WAIT_SAME_ALBUM_MS } from '../domain/albumRefresh';
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
  getDriveFile,
  getDriveFileParentId,
  hasDriveToken,
  isDriveFolder,
  listDriveFolderTree,
  listFolderChildren,
  listFolderPermissionPeople,
  renameDriveFile,
  updateDriveFileMedia,
  uploadDriveFile,
  type DriveFile,
} from './driveApi';
import { applyKeepFlags, mergeMarkers } from './mergeNotes';
import {
  claimRemote,
  createRemoteClaimSet,
  findBestLocalForRemote,
  keepMarkerIdsAfterRemoteReplace,
  remoteAudioChanged,
  remoteIsClaimed,
  remoteReplacesLocalTrack,
  surplusLocalTracks,
  trackNameMatchesRemote,
  uniqueRemotes,
} from './remoteAudioChange';

/** Shared Drive id from a Drive file/folder metadata (`driveId` field). */
function sharedDriveIdFromFile(file: Pick<DriveFile, 'driveId'> | null | undefined): string | undefined {
  const id = file?.driveId?.trim();
  return id || undefined;
}

/** Persist folder link and keep Shared Drive id when Drive returns it. */
function linkAlbumDriveFolder(
  albumId: string,
  folderId: string,
  folderName: string,
  extras?: { driveRecursive?: boolean; driveSharedDriveId?: string },
): void {
  useLibraryStore.getState().linkAlbumDrive(albumId, folderId, folderName, {
    driveRecursive: extras?.driveRecursive,
    driveSharedDriveId: extras?.driveSharedDriveId,
  });
}

/**
 * Heal missing driveSharedDriveId so Shared Drive listings work after resume.
 * Returns the id to use for the next listDriveFolderTree call.
 */
async function ensureAlbumSharedDriveId(album: {
  id: string;
  driveFolderId?: string;
  driveFolderName?: string;
  name: string;
  driveSharedDriveId?: string;
  driveRecursive?: boolean;
}): Promise<string | undefined> {
  const existing = album.driveSharedDriveId?.trim();
  if (existing) {
    return existing;
  }
  const folderId = album.driveFolderId?.trim();
  if (!folderId) {
    return undefined;
  }
  const meta = await getDriveFile(folderId);
  const sharedDriveId = sharedDriveIdFromFile(meta);
  if (!sharedDriveId) {
    return undefined;
  }
  linkAlbumDriveFolder(album.id, folderId, album.driveFolderName || meta?.name || album.name, {
    driveRecursive: album.driveRecursive,
    driveSharedDriveId: sharedDriveId,
  });
  return sharedDriveId;
}

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

function albumTrackIdSet(albumId: string): Set<string> {
  return new Set(useLibraryStore.getState().tracksIn('album', albumId).map((track) => track.id));
}

export type DriveAlbumPeek = {
  newRemoteCount: number;
  changedTrackIds: string[];
};

/** Newer Drive bytes: download in background. Skip the track currently playing. */
export async function applyPendingRemoteAudioUpdates(trackIds?: string[]): Promise<number> {
  const store = useLibraryStore.getState();
  const playingId = usePlayerStore.getState().track.id;
  const wanted = trackIds ? new Set(trackIds) : null;
  const candidates = store.tracks.filter((track) => {
    if (track.pendingRemoteUpdate !== true) {
      return false;
    }
    if (wanted && !wanted.has(track.id)) {
      return false;
    }
    if (track.id === playingId) {
      return false;
    }
    if (store.downloadingIds[track.id] != null) {
      return false;
    }
    return Boolean(track.driveFileId || track.remoteUri);
  });
  let applied = 0;
  for (const track of candidates) {
    try {
      await useLibraryStore.getState().downloadTrack(track.id, { replace: true, quiet: true });
      if (useLibraryStore.getState().getTrack(track.id)?.pendingRemoteUpdate !== true) {
        applied += 1;
      }
    } catch {
      // One file must not block the others.
    }
  }
  return applied;
}

/** Elenca Drive: brani nuovi restano da Aggiorna; i byte cambiati si scaricano in background. */
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
      linkAlbumDriveFolder(album.id, found.id, found.name, {
        driveSharedDriveId: sharedDriveIdFromFile(found),
      });
      await refreshAlbumDriveRole(album.id);
    }
  }
  if (!folderId) {
    useDownloadProgressStore.getState().setDriveNews(albumId, 0);
    return empty;
  }

  const sharedDriveId = await ensureAlbumSharedDriveId({
    ...album,
    driveFolderId: folderId,
  });
  const { nodes: tree } = await listDriveFolderTree(
    folderId,
    album.driveFolderName || album.name,
    album.driveRecursive ? 8 : 0,
    sharedDriveId ? { sharedDriveId } : undefined,
  );
  const treeFolderIds = new Set(tree.map((node) => node.id));
  const audios = uniqueRemotes(
    tree.flatMap((node) => node.children.filter((file) => isDriveAudio(file))),
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
  const pendingIds = [
    ...new Set([
      ...changedTrackIds,
      ...locals.filter((track) => track.pendingRemoteUpdate === true).map((track) => track.id),
    ]),
  ];
  if (pendingIds.length > 0) {
    void applyPendingRemoteAudioUpdates(pendingIds).then(() => {
      const stillPending = pendingIds.filter(
        (trackId) => useLibraryStore.getState().getTrack(trackId)?.pendingRemoteUpdate === true,
      );
      useDownloadProgressStore.getState().setDriveNews(
        albumId,
        drivePeekNewsCount({ newRemoteCount, changedTrackIds: stillPending }),
      );
    });
  }
  // Band layout (order + version folders) on every open — inherit, never wipe remote.
  await pullAlbumLayout(albumId).catch(() => undefined);
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
    const audios = node.children.filter((file) => isDriveAudio(file));
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

/** Serialize Drive work per album so Aggiorna does not wait for other albums. */
const albumWorkTails = new Map<string, Promise<unknown>>();

async function runExclusiveAlbumWork<T>(albumId: string, work: () => Promise<T>): Promise<T> {
  const prev = albumWorkTails.get(albumId);
  let settled!: T;
  const job = (async () => {
    if (prev) {
      await awaitJobOrTimeout(prev, ALBUM_REFRESH_WAIT_SAME_ALBUM_MS);
    }
    settled = await work();
  })();
  albumWorkTails.set(albumId, job);
  try {
    await job;
    return settled;
  } finally {
    if (albumWorkTails.get(albumId) === job) {
      albumWorkTails.delete(albumId);
    }
  }
}

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
type SyncOneDriveAlbumOptions = {
  /** Sidecars, covers, PDFs, album notes. Aggiorna listing skips these. */
  extras?: boolean;
};

async function syncOneDriveAlbum(
  album: Album,
  expectedUserId: string,
  selfSlug: string | undefined,
  options?: SyncOneDriveAlbumOptions,
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
      linkAlbumDriveFolder(album.id, found.id, found.name, {
        driveSharedDriveId: sharedDriveIdFromFile(found),
      });
    }
  }
  if (!folderId) {
    return { ...empty, needsFolderLink: true };
  }

  if (options?.extras !== false) {
    await refreshAlbumDriveRole(album.id);
    if (!isCloudSyncUserActive(expectedUserId)) {
      sync.finish({ lastSyncedAt: Date.now(), message: null });
      return { ...empty, aborted: true };
    }
  }

  const sharedDriveId = await ensureAlbumSharedDriveId({
    ...album,
    driveFolderId: folderId,
  });
  if (!isCloudSyncUserActive(expectedUserId)) {
    sync.finish({ lastSyncedAt: Date.now(), message: null });
    return { ...empty, aborted: true };
  }
  const { nodes: tree, truncated: treeTruncated } = await listDriveFolderTree(
    folderId,
    album.driveFolderName || album.name,
    album.driveRecursive ? 8 : 0,
    sharedDriveId ? { sharedDriveId } : undefined,
  );
  if (!isCloudSyncUserActive(expectedUserId)) {
    sync.finish({ lastSyncedAt: Date.now(), message: null });
    return { ...empty, aborted: true };
  }
  const children = tree[0]?.children ?? [];
  if (!sharedDriveId) {
    const fromChildren = children.map(sharedDriveIdFromFile).find(Boolean);
    if (fromChildren) {
      linkAlbumDriveFolder(album.id, folderId, album.driveFolderName || album.name, {
        driveSharedDriveId: fromChildren,
      });
    }
  }
  const treeFolderIds = new Set(tree.map((node) => node.id));
  const audios = uniqueRemotes(
    tree.flatMap((node) => node.children.filter((file) => isDriveAudio(file))),
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
    const onAlbum = albumTrackIdSet(album.id);

    if (!existing) {
      const namedTwin = locals.find(
        (track) =>
          Boolean(track.driveFileId) &&
          track.driveFileId !== remote.id &&
          trackNameMatchesRemote(track, remote),
      );
      if (namedTwin && remoteReplacesLocalTrack(namedTwin, remote, audios)) {
        store.markTrackNeedsUpdate(namedTwin.id, metaFrom(remote));
        versioned += 1;
        claimRemote(importedRemotes, remote);
        continue;
      }
      // New song or another version (01 / 02 / 03): own row, download after listing.
      const idsBefore = albumTrackIdSet(album.id);
      const id = createId('track');
      store.importBundles(
        [
          {
            track: {
              id,
              title: titleFromFileName(remote.name),
              artist: album.name,
              durationMs: 0,
              sourceFileName: remote.name,
              downloaded: false,
              ...metaFrom(remote),
            },
            markers: [],
          },
        ],
        { albumId: album.id },
      );
      locals = albumLocalTracks(album.id, treeFolderIds);
      const idsAfter = albumTrackIdSet(album.id);
      if ([...idsAfter].some((trackId) => !idsBefore.has(trackId))) {
        added += 1;
      }
      claimRemote(importedRemotes, remote);
      continue;
    }

    if (!onAlbum.has(existing.id)) {
      store.addTracksToAlbum(album.id, [existing.id]);
      added += 1;
    }
    claimRemote(importedRemotes, remote);

    if (!remoteAudioChanged(existing, remote)) {
      store.updateTrackRemote(existing.id, metaFrom(remote));
      continue;
    }
    // Mark, then download in background. Do not swap while this track is playing.
    store.markTrackNeedsUpdate(existing.id, metaFrom(remote));
    versioned += 1;
  }

  // Incomplete Drive view: never surplus-delete.
  // Truncated pages, OR empty remote list while locals exist (flaky Shared Drive /
  // Android resume listing) would otherwise wipe the album and force a re-link.
  const listingSuspectEmpty = audios.length === 0 && locals.length > 0;
  const skipSurplusDeletes = treeTruncated || listingSuspectEmpty;
  if (skipSurplusDeletes) {
    if (__DEV__) {
      console.warn(
        `[sync] skip surplus delete for album ${album.id}: ${
          treeTruncated ? 'Drive tree truncated' : 'empty remote list with local tracks'
        }`,
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

  if (options?.extras === false) {
    await reconcileAlbumOrderFromChildren(album.id, children);
    store.touchAlbumSync(album.id);
    await refreshAlbumDriveRole(album.id);
    void applyPendingRemoteAudioUpdates();
    return { added, removed, versioned, notesPulled, needsFolderLink: false, aborted: false };
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
      void import('../store/notificationStore').then(({ ingestMentionsForSavedTrack }) => {
        ingestMentionsForSavedTrack(track.id, merged);
      });
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
  await applyDriveMediaTree(album.id, tree, { skipSurplusDeletes });
  if (!isCloudSyncUserActive(expectedUserId)) {
    sync.finish({ lastSyncedAt: Date.now(), message: null });
    return { ...empty, added, removed, versioned, notesPulled, aborted: true };
  }

  await reconcileAlbumOrderFromChildren(album.id, children);

  if (!isCloudSyncUserActive(expectedUserId)) {
    sync.finish({ lastSyncedAt: Date.now(), message: null });
    return { ...empty, added, removed, versioned, notesPulled, aborted: true };
  }
  await syncAlbumNotes(album.id, children);

  store.touchAlbumSync(album.id);
  await refreshAlbumDriveRole(album.id);

  void applyPendingRemoteAudioUpdates();

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
 * Align one Drive album: import new remotes (as rows), mark changed files.
 * Does not wait for a full-library pass. Same album is serialized.
 */
export async function syncDriveAlbum(albumId: string): Promise<SyncDriveAlbumResult> {
  const empty: SyncDriveAlbumResult = { added: 0, removed: 0, versioned: 0, notesPulled: 0 };
  if (useDownloadProgressStore.getState().pauseRequested) {
    return empty;
  }
  const outcome = await runExclusiveAlbumWork(albumId, () => runSyncDriveAlbumBody(albumId));
  void runExclusiveAlbumWork(albumId, () => runSyncDriveAlbumExtras(albumId)).catch(() => {
    // extras (notes, PDF) can arrive on the next Aggiorna
  });
  return outcome;
}

async function runSyncDriveAlbumExtras(albumId: string): Promise<void> {
  if (useDownloadProgressStore.getState().pauseRequested) {
    return;
  }
  const user = useSessionStore.getState().user;
  if (!user?.onboarded || shouldSkipCloudSync(user)) {
    return;
  }
  if (!(await hasDriveToken())) {
    return;
  }
  const album = useLibraryStore
    .getState()
    .albums.find((item) => item.id === albumId && item.origin === 'drive');
  if (!album) {
    return;
  }
  await syncOneDriveAlbum(album, user.id, user.authorSlug, { extras: true });
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
      const result = await syncOneDriveAlbum(album, expectedUserId, user.authorSlug, {
        extras: false,
      });
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

    const library = useLibraryStore.getState();
    const removedAlbumIds = new Set(library.removedAlbumIds);
    const removedDriveFolderIds = new Set(library.removedDriveFolderIds);
    const albums = library.albums.filter((album) => {
      if (album.origin !== 'drive') {
        return false;
      }
      if (removedAlbumIds.has(album.id)) {
        return false;
      }
      const folderId = album.driveFolderId?.trim();
      if (folderId && removedDriveFolderIds.has(folderId)) {
        return false;
      }
      return true;
    });

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
        const live = useLibraryStore.getState();
        if (!live.albums.some((item) => item.id === album.id)) {
          continue;
        }
        if (live.removedAlbumIds.includes(album.id)) {
          continue;
        }
        const result = await runExclusiveAlbumWork(album.id, () =>
          syncOneDriveAlbum(album, expectedUserId, selfSlug, { extras: true }),
        );
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

export async function pushAlbumMembers(albumId: string): Promise<void> {
  const album = sharedDriveAlbum(albumId);
  if (!album?.driveFolderId || !canWriteWithRole(roleOfAlbum(album))) {
    return;
  }
  if (!(await hasDriveToken())) {
    return;
  }
  const people = albumMentionCandidates(
    album,
    useLibraryStore.getState().markersByTrackId,
    useSessionStore.getState().user,
  );
  const fallback = people.map((person) => ({
    key: person.key,
    name: person.name,
    email: album.memberEmails?.[person.key],
    color: album.memberColors?.[person.key],
  }));
  const body = buildAlbumMembersFile(album, fallback);
  if (body.members.length === 0) {
    return;
  }
  const dest = new File(inboxDirectory(), `members-${albumId}.json`);
  dest.write(JSON.stringify(body, null, 2));
  const existing = await findChildByName(album.driveFolderId, MEMBERS_FILE_NAME);
  if (existing) {
    await updateDriveFileMedia(existing.id, dest.uri, 'application/json');
    return;
  }
  await uploadDriveFile({
    name: MEMBERS_FILE_NAME,
    folderId: album.driveFolderId,
    fileUri: dest.uri,
    mimeType: 'application/json',
  });
}

export async function pullAlbumMembers(albumId: string): Promise<boolean> {
  const album = useLibraryStore.getState().albums.find((item) => item.id === albumId);
  if (!album?.driveFolderId) {
    return false;
  }
  if (!(await hasDriveToken())) {
    return false;
  }
  const remote = await findChildByName(album.driveFolderId, MEMBERS_FILE_NAME);
  if (!remote) {
    return false;
  }
  const dest = new File(inboxDirectory(), `pull-members-${albumId}.json`);
  try {
    await downloadDriveFile(remote.id, dest.uri);
    const parsed = parseAlbumMembersFile(await dest.text());
    if (!parsed || !shouldApplyRemoteMembers(album.membersUpdatedAt, parsed.updatedAt)) {
      return false;
    }
    useLibraryStore.getState().applyCloudAlbumMembers(albumId, {
      memberColors: memberColorMapFromFile(parsed),
      memberEmails: memberEmailMapFromFile(parsed),
      memberNames: memberNameMapFromFile(parsed),
      membersUpdatedAt: parsed.updatedAt,
    });
    await flushLibraryPersist();
    return true;
  } catch {
    return false;
  } finally {
    if (dest.exists) {
      dest.delete();
    }
  }
}

/** Refresh emails from Drive permissions (best-effort) and merge into album. */
export async function refreshAlbumMemberEmails(albumId: string): Promise<void> {
  const album = useLibraryStore.getState().albums.find((item) => item.id === albumId);
  if (!album?.driveFolderId || !(await hasDriveToken())) {
    return;
  }
  const people = await listFolderPermissionPeople(album.driveFolderId);
  if (people.length === 0) {
    return;
  }
  const candidates = albumMentionCandidates(
    album,
    useLibraryStore.getState().markersByTrackId,
    useSessionStore.getState().user,
  );
  const emails: Record<string, string> = {};
  const names: Record<string, string> = { ...(album.memberNames ?? {}) };
  for (const person of people) {
    if (!person.email) {
      continue;
    }
    const byName = person.displayName
      ? candidates.find((row) => row.name.toLowerCase() === person.displayName!.toLowerCase())
      : undefined;
    if (byName) {
      emails[byName.key] = person.email;
      names[byName.key] = byName.name;
      continue;
    }
    if (person.displayName?.trim()) {
      const displayName = normalizeDisplayName(person.displayName);
      const key = displayName.toLowerCase();
      emails[key] = person.email;
      names[key] = displayName;
    }
  }
  if (Object.keys(emails).length === 0) {
    return;
  }
  useLibraryStore.getState().applyCloudAlbumMembers(albumId, {
    memberColors: album.memberColors ?? {},
    memberEmails: { ...(album.memberEmails ?? {}), ...emails },
    memberNames: names,
    membersUpdatedAt: album.membersUpdatedAt ?? Date.now(),
  });
  await flushLibraryPersist();
}

export async function pushAlbumOrder(albumId: string): Promise<void> {
  const album = sharedDriveAlbum(albumId);
  if (!album?.driveFolderId || !canWriteWithRole(roleOfAlbum(album))) {
    return;
  }
  if (!(await hasDriveToken())) {
    return;
  }
  const existing = await findAlbumOrderRemote(album.driveFolderId);
  let remote: AlbumOrderFile | null = null;
  if (existing) {
    const dest = new File(inboxDirectory(), `push-order-check-${albumId}.json`);
    try {
      await downloadDriveFile(existing.id, dest.uri);
      remote = parseAlbumOrder(await dest.text());
    } catch {
      remote = null;
    } finally {
      if (dest.exists) {
        dest.delete();
      }
    }
  }
  const live = useLibraryStore.getState().albums.find((item) => item.id === albumId);
  if (!live) {
    return;
  }
  if (remote && shouldApplyRemoteAlbumOrder(live, remote)) {
    useLibraryStore.getState().applyCloudAlbumOrder(albumId, remote);
    return;
  }
  if (!shouldPushLocalAlbumOrder(live, remote)) {
    return;
  }
  const updatedAt = live.orderUpdatedAt ?? Date.now();
  const dest = new File(inboxDirectory(), `order-${albumId}.json`);
  dest.write(
    JSON.stringify(
      buildAlbumOrderFile(live, useLibraryStore.getState().tracks, updatedAt),
      null,
      2,
    ),
  );
  if (existing) {
    await updateDriveFileMedia(existing.id, dest.uri, 'application/json');
    // Prefer the hidden name going forward when only the legacy file exists.
    if (existing.name.trim().toLowerCase() === ORDER_FILE_NAME_LEGACY) {
      const dotted = await findChildByName(album.driveFolderId, ORDER_FILE_NAME);
      if (!dotted) {
        await uploadDriveFile({
          name: ORDER_FILE_NAME,
          folderId: album.driveFolderId,
          fileUri: dest.uri,
          mimeType: 'application/json',
        });
      }
    }
    return;
  }
  await uploadDriveFile({
    name: ORDER_FILE_NAME,
    folderId: album.driveFolderId,
    fileUri: dest.uri,
    mimeType: 'application/json',
  });
}

async function findAlbumOrderRemote(folderId: string): Promise<DriveFile | null> {
  return (
    (await findChildByName(folderId, ORDER_FILE_NAME)) ??
    (await findChildByName(folderId, ORDER_FILE_NAME_LEGACY))
  );
}

function pickOrderRemoteFromChildren(children: DriveFile[]): DriveFile | undefined {
  const dotted = children.find((file) => file.name.trim().toLowerCase() === ORDER_FILE_NAME);
  if (dotted) {
    return dotted;
  }
  return children.find((file) => isOrderManifestName(file.name));
}

async function downloadAlbumOrderParsed(remote: DriveFile, albumId: string): Promise<AlbumOrderFile | null> {
  const dest = new File(inboxDirectory(), `sync-order-${albumId}.json`);
  try {
    await downloadDriveFile(remote.id, dest.uri);
    return parseAlbumOrder(await dest.text());
  } catch {
    return null;
  } finally {
    if (dest.exists) {
      dest.delete();
    }
  }
}

/**
 * Download `.rewavier.order.json` (or legacy name), inherit for first open,
 * push only when local is intentionally newer and not emptier than remote.
 */
export async function pullAlbumLayout(albumId: string): Promise<boolean> {
  const album = useLibraryStore.getState().albums.find((item) => item.id === albumId);
  if (!album || album.origin !== 'drive' || !album.driveFolderId) {
    return false;
  }
  if (!(await hasDriveToken())) {
    return false;
  }
  void pullAlbumMembers(albumId).catch(() => undefined);
  void refreshAlbumMemberEmails(albumId).catch(() => undefined);
  const remoteFile = await findAlbumOrderRemote(album.driveFolderId);
  if (!remoteFile) {
    return false;
  }
  const parsed = await downloadAlbumOrderParsed(remoteFile, albumId);
  if (!parsed) {
    return false;
  }
  const live = useLibraryStore.getState().albums.find((item) => item.id === albumId);
  if (!live) {
    return false;
  }
  if (!shouldApplyRemoteAlbumOrder(live, parsed)) {
    return false;
  }
  useLibraryStore.getState().applyCloudAlbumOrder(albumId, parsed);
  await flushLibraryPersist();
  return true;
}

async function reconcileAlbumOrderFromChildren(albumId: string, children: DriveFile[]): Promise<void> {
  const orderRemote = pickOrderRemoteFromChildren(children);
  const live = useLibraryStore.getState().albums.find((item) => item.id === albumId);
  if (!live) {
    return;
  }
  if (orderRemote) {
    const parsed = await downloadAlbumOrderParsed(orderRemote, albumId);
    if (parsed && shouldApplyRemoteAlbumOrder(live, parsed)) {
      useLibraryStore.getState().applyCloudAlbumOrder(albumId, parsed);
      return;
    }
    if (shouldPushLocalAlbumOrder(live, parsed)) {
      await pushAlbumOrder(albumId);
    }
    return;
  }
  if (shouldPushLocalAlbumOrder(live, null)) {
    await pushAlbumOrder(albumId);
  }
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
        isDriveAudio(file) &&
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
  if (useLibraryStore.getState().getTrack(trackId)?.artworkUri) {
    finishDriveItem();
    return;
  }
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
  if (useLibraryStore.getState().albums.find((item) => item.id === albumId)?.artworkUri) {
    finishDriveItem();
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
      .filter((file) => isDriveAudio(file))
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
      // Stub from a previous sync/import with no file yet — fetch it now.
      // Also re-fetch when Aggiorna marked a newer remote copy.
      if (!isDownloaded(existing) || existing.pendingRemoteUpdate === true) {
        try {
          const fileUri = await saveAudio(remote, existing.id, false);
          const beforeMarkers = store.markersByTrackId[existing.id] ?? [];
          const markers =
            existing.pendingRemoteUpdate === true
              ? applyKeepFlags(
                  beforeMarkers,
                  keepMarkerIdsAfterRemoteReplace(beforeMarkers, existing.pendingHideMarkerIds),
                )
              : beforeMarkers;
          store.importBundles(
            [
              {
                track: {
                  ...existing,
                  fileUri,
                  downloaded: true,
                  downloadedAt: Date.now(),
                  pendingRemoteUpdate: undefined,
                  pendingHideMarkerIds: undefined,
                  ...metaFrom(remote),
                },
                markers,
              },
            ],
            { albumId, folderId: appFolderId ?? undefined },
          );
        } catch (error) {
          if (isDownloadPausedError(error)) {
            throw error;
          }
          // Keep going — other tracks in the folder still import.
        }
      }
      finishDriveItem();
      continue;
    }

    const id = createId('track');
    let fileUri: string;
    try {
      fileUri = await saveAudio(remote, id, false);
    } catch (error) {
      finishDriveItem();
      if (isDownloadPausedError(error)) {
        throw error;
      }
      // One bad name / 403 / large file must not abort the rest of the album.
      continue;
    }
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

  const { nodes: tree, truncated: treeTruncated } = await listDriveFolderTree(
    folderId,
    folderName,
    recursive ? 8 : 0,
    sharedDriveId ? { sharedDriveId } : undefined,
  );
  const audios = tree.flatMap((node) => node.children.filter((file) => isDriveAudio(file)));
  const rootFolders = (tree[0]?.children ?? []).filter(isDriveFolder);
  if (audios.length === 0) {
    if (rootFolders.length > 0 && !recursive) {
      throw new Error(
        'I brani sono nelle cartelle dentro. Tocca Scegli e poi «Anche le cartelle dentro».',
      );
    }
    throw new Error(
      'In questa cartella non ho trovato brani. Apri quella dove ci sono i file audio, la copertina e gli appunti.',
    );
  }

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
    // First import must inherit band folders/order — never start flat and overwrite Drive.
    await pullAlbumLayout(albumId).catch(() => undefined);
    return albumId;
  } finally {
    progress.end();
  }
}
