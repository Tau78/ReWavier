/** Pure helpers: detect Drive audio version changes and match local ↔ remote. */

import { audioBasename } from '../domain/sidecar';

export type RemoteAudioMeta = {
  id: string;
  name: string;
  md5Checksum?: string;
  size?: string;
  modifiedTime?: string;
};

export type LocalRemoteTrack = {
  driveFileId?: string;
  sourceFileName?: string;
  remoteHash?: string;
  remoteSize?: number;
  remoteModifiedAt?: string;
};

export function trackMatchesRemote(track: LocalRemoteTrack, remote: RemoteAudioMeta): boolean {
  if (track.driveFileId && track.driveFileId === remote.id) {
    return true;
  }
  if (!track.sourceFileName) {
    return false;
  }
  return (
    audioBasename(track.sourceFileName).toLowerCase() === audioBasename(remote.name).toLowerCase()
  );
}

export function trackPresentRemotely(
  track: LocalRemoteTrack,
  remotes: RemoteAudioMeta[],
): boolean {
  return remotes.some((remote) => trackMatchesRemote(track, remote));
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
