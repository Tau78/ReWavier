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

function localNameKey(track: LocalRemoteTrack): string {
  const raw = track.sourceFileName || track.title || '';
  return raw ? audioMatchKey(raw) : '';
}

export function trackMatchesRemote(track: LocalRemoteTrack, remote: RemoteAudioMeta): boolean {
  if (track.driveFileId && track.driveFileId === remote.id) {
    return true;
  }
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
  return tracks.filter((track) => trackMatchesRemote(track, remote));
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
  if (claimed.ids.has(remote.id)) {
    return true;
  }
  const name = audioMatchKey(remote.name);
  return Boolean(name) && claimed.names.has(name);
}

export function claimRemote(claimed: RemoteClaimSet, remote: RemoteAudioMeta): void {
  claimed.ids.add(remote.id);
  const name = audioMatchKey(remote.name);
  if (name) {
    claimed.names.add(name);
  }
}

/**
 * Locals that should leave the album: missing on Drive, or extras for a remote
 * that already has a better local (downloaded / fileUri wins).
 */
export function surplusLocalTracks<T extends LocalRemoteTrack & { id: string }>(
  tracks: T[],
  remotes: RemoteAudioMeta[],
): T[] {
  const claimedTrackIds = new Set<string>();
  const claimed = createRemoteClaimSet();
  for (const remote of uniqueRemotes(remotes)) {
    if (remoteIsClaimed(claimed, remote)) {
      continue;
    }
    const candidates = tracks.filter(
      (track) => !claimedTrackIds.has(track.id) && trackMatchesRemote(track, remote),
    );
    const best = preferDownloadedTrack(candidates);
    if (!best) {
      continue;
    }
    claimedTrackIds.add(best.id);
    claimRemote(claimed, remote);
    if (best.driveFileId) {
      claimed.ids.add(best.driveFileId);
    }
    const name = localNameKey(best);
    if (name) {
      claimed.names.add(name);
    }
  }
  return tracks.filter((track) => !claimedTrackIds.has(track.id));
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
