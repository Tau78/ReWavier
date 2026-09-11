/** Pure helpers: detect Drive audio version changes and match local ↔ remote. */

import { audioMatchKey } from '../domain/sidecar';

export type RemoteAudioMeta = {
  id: string;
  name: string;
  md5Checksum?: string;
  size?: string;
  modifiedTime?: string;
};

export type LocalRemoteTrack = {
  id?: string;
  driveFileId?: string;
  sourceFileName?: string;
  title?: string;
  fileUri?: string;
  downloaded?: boolean;
  durationMs?: number;
  remoteHash?: string;
  remoteSize?: number;
  remoteModifiedAt?: string;
};

export function uniqueRemotes<T extends { id: string }>(remotes: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const remote of remotes) {
    if (seen.has(remote.id)) {
      continue;
    }
    seen.add(remote.id);
    out.push(remote);
  }
  return out;
}

export function trackNameMatchesRemote(track: LocalRemoteTrack, remote: RemoteAudioMeta): boolean {
  const remoteKey = audioMatchKey(remote.name);
  if (!remoteKey) {
    return false;
  }
  if (track.sourceFileName && audioMatchKey(track.sourceFileName) === remoteKey) {
    return true;
  }
  if (track.title && audioMatchKey(track.title) === remoteKey) {
    return true;
  }
  return false;
}

export function trackMatchesRemote(track: LocalRemoteTrack, remote: RemoteAudioMeta): boolean {
  if (track.driveFileId && track.driveFileId === remote.id) {
    return true;
  }
  return trackNameMatchesRemote(track, remote);
}

export function trackPresentRemotely(
  track: LocalRemoteTrack,
  remotes: RemoteAudioMeta[],
): boolean {
  return remotes.some((remote) => trackMatchesRemote(track, remote));
}

export function localTrackQuality(track: LocalRemoteTrack): number {
  return (track.fileUri ? 4 : 0) + (track.downloaded ? 2 : 0) + ((track.durationMs ?? 0) > 0 ? 1 : 0);
}

/** Keep the copy already on the phone when two locals point at the same remote. */
export function preferDownloadedTrack<T extends LocalRemoteTrack>(tracks: T[]): T | undefined {
  if (tracks.length === 0) {
    return undefined;
  }
  return tracks.reduce((best, track) =>
    localTrackQuality(track) > localTrackQuality(best) ? track : best,
  );
}

export function findLocalsMatchingRemote<T extends LocalRemoteTrack>(
  tracks: T[],
  remote: RemoteAudioMeta,
): T[] {
  const byId = tracks.filter((track) => track.driveFileId === remote.id);
  if (byId.length > 0) {
    return byId;
  }
  // Name match only when the row is not already another Drive file (01 / 02 / 03).
  return tracks.filter((track) => !track.driveFileId && trackNameMatchesRemote(track, remote));
}

export function findBestLocalForRemote<T extends LocalRemoteTrack>(
  tracks: T[],
  remote: RemoteAudioMeta,
): T | undefined {
  return preferDownloadedTrack(findLocalsMatchingRemote(tracks, remote));
}

export type RemoteClaimSet = {
  ids: Set<string>;
  names: Set<string>;
};

export function createRemoteClaimSet(): RemoteClaimSet {
  return { ids: new Set(), names: new Set() };
}

export function remoteIsClaimed(claimed: RemoteClaimSet, remote: RemoteAudioMeta): boolean {
  return claimed.ids.has(remote.id);
}

export function claimRemote(claimed: RemoteClaimSet, remote: RemoteAudioMeta): void {
  claimed.ids.add(remote.id);
}

/**
 * Locals that should leave the album: missing on Drive, or extras for a remote
 * that already has a better local (downloaded / fileUri wins).
 * Two Drive ids (Song 01 / Song 02) are two rows — never surplus of each other.
 */
export function surplusLocalTracks<T extends LocalRemoteTrack & { id: string }>(
  tracks: T[],
  remotes: RemoteAudioMeta[],
): T[] {
  const claimedTrackIds = new Set<string>();
  const claimed = createRemoteClaimSet();
  const remoteIds = new Set(uniqueRemotes(remotes).map((remote) => remote.id));
  for (const remote of uniqueRemotes(remotes)) {
    if (remoteIsClaimed(claimed, remote)) {
      continue;
    }
    const candidates = tracks.filter(
      (track) => !claimedTrackIds.has(track.id) && findLocalsMatchingRemote([track], remote).length > 0,
    );
    const best = preferDownloadedTrack(candidates);
    if (!best) {
      continue;
    }
    claimedTrackIds.add(best.id);
    claimRemote(claimed, remote);
  }
  return tracks.filter((track) => {
    if (claimedTrackIds.has(track.id)) {
      return false;
    }
    // A row that still points at a live Drive file is a version, not leftover junk.
    if (track.driveFileId && remoteIds.has(track.driveFileId)) {
      return false;
    }
    return true;
  });
}

/**
 * Prefer content hash, then size. Mtime only when hash/size are unavailable.
 * Same bytes with a newer mtime must not count as a new version.
 */
export function remoteAudioChanged(track: LocalRemoteTrack, remote: RemoteAudioMeta): boolean {
  if (remote.md5Checksum && track.remoteHash) {
    return remote.md5Checksum !== track.remoteHash;
  }
  if (remote.size != null && remote.size !== '' && track.remoteSize != null) {
    return Number(remote.size) !== track.remoteSize;
  }
  if (remote.modifiedTime && track.remoteModifiedAt) {
    return Date.parse(remote.modifiedTime) > Date.parse(track.remoteModifiedAt);
  }
  return Boolean(remote.modifiedTime && !track.remoteModifiedAt);
}

/**
 * Delete+reupload on Drive keeps the same file name but creates a new file id.
 * Version folders keep both ids in the tree — those must not count as a replace.
 */
export function remoteReplacesLocalTrack(
  track: LocalRemoteTrack,
  remote: RemoteAudioMeta,
  remotes: readonly RemoteAudioMeta[],
): boolean {
  if (!track.driveFileId || track.driveFileId === remote.id) {
    return false;
  }
  if (!trackNameMatchesRemote(track, remote)) {
    return false;
  }
  return !remotes.some((item) => item.id === track.driveFileId);
}
