import { createId, isSeparatorId, isVersionFolderId, type Album, type AlbumVersionFolder } from './library';
import type { Track } from './models';

export function versionFolderById(
  album: Album,
  folderId: string,
): AlbumVersionFolder | undefined {
  return (album.versionFolders ?? []).find((folder) => folder.id === folderId);
}

export function albumContainsTrackId(album: Album, trackId: string): boolean {
  if (album.trackIds.includes(trackId)) {
    return true;
  }
  return (album.versionFolders ?? []).some((folder) => folder.trackIds.includes(trackId));
}

export function flattenAlbumTrackIds(album: Album): string[] {
  const ids: string[] = [];
  for (const itemId of album.trackIds) {
    const folder = versionFolderById(album, itemId);
    if (folder) {
      ids.push(...folder.trackIds);
      continue;
    }
    if (!isSeparatorId(itemId) && !isVersionFolderId(itemId)) {
      ids.push(itemId);
    }
  }
  return ids;
}

export function playableAlbumTrackIds(album: Album): string[] {
  const ids: string[] = [];
  for (const itemId of album.trackIds) {
    const folder = versionFolderById(album, itemId);
    if (folder) {
      ids.push(folder.chosenId);
      continue;
    }
    if (!isSeparatorId(itemId) && !isVersionFolderId(itemId)) {
      ids.push(itemId);
    }
  }
  return ids;
}

function cleanTitle(title: string): string {
  return title
    .replace(/^\s*\d+\.\s*/, '')
    .replace(/\s*[\(\[]\d{2,4}[\)\]]\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function versionFolderName(titles: string[]): string {
  const cleaned = titles.map(cleanTitle).filter(Boolean);
  if (cleaned.length === 0) {
    return 'Versioni';
  }
  let prefix = cleaned[0] ?? '';
  for (const title of cleaned.slice(1)) {
    let i = 0;
    const max = Math.min(prefix.length, title.length);
    while (i < max && prefix[i]?.toLowerCase() === title[i]?.toLowerCase()) {
      i += 1;
    }
    prefix = prefix.slice(0, i).replace(/[\s\-–_:]+$/u, '').trim();
    if (prefix.length < 3) {
      return cleaned[0] ?? 'Versioni';
    }
  }
  return prefix || cleaned[0] || 'Versioni';
}

function uniqueTrackIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    next.push(id);
  }
  return next;
}

function pruneFolders(folders: AlbumVersionFolder[], topIds: string[]): AlbumVersionFolder[] {
  return folders
    .map((folder) => {
      const trackIds = uniqueTrackIds(folder.trackIds);
      const chosenId = trackIds.includes(folder.chosenId) ? folder.chosenId : (trackIds[0] ?? folder.chosenId);
      return { ...folder, trackIds, chosenId };
    })
    .filter((folder) => folder.trackIds.length >= 2 && topIds.includes(folder.id));
}

function dissolveTinyFolders(album: Album): Album {
  const leftover: string[] = [];
  const keep: AlbumVersionFolder[] = [];
  for (const folder of album.versionFolders ?? []) {
    if (folder.trackIds.length >= 2) {
      keep.push(folder);
      continue;
    }
    leftover.push(...folder.trackIds);
  }
  const trackIds = album.trackIds.flatMap((id) => {
    if (keep.some((folder) => folder.id === id)) {
      return [id];
    }
    if (isVersionFolderId(id)) {
      const folder = (album.versionFolders ?? []).find((item) => item.id === id);
      return folder?.trackIds ?? [];
    }
    return [id];
  });
  const extra = leftover.filter((id) => !trackIds.includes(id));
  return {
    ...album,
    trackIds: [...trackIds, ...extra],
    versionFolders: keep.length ? keep : undefined,
  };
}

export function applyAlbumVersionDrop(
  album: Album,
  sourceId: string,
  targetId: string,
  tracks: Track[] = [],
): Album | null {
  if (!sourceId || !targetId || sourceId === targetId) {
    return null;
  }
  if (isSeparatorId(sourceId) || isSeparatorId(targetId)) {
    return null;
  }

  const sourceOwner = (album.versionFolders ?? []).find((folder) => folder.trackIds.includes(sourceId));
  const targetOwner = (album.versionFolders ?? []).find((folder) => folder.trackIds.includes(targetId));
  if (sourceOwner && targetOwner && sourceOwner.id === targetOwner.id) {
    return null;
  }
  if (targetOwner && !versionFolderById(album, targetId)) {
    return applyAlbumVersionDrop(album, sourceId, targetOwner.id, tracks);
  }

  let working = peelTrackToTopLevel(album, sourceId);
  const sourceFolder = versionFolderById(working, sourceId);
  const targetFolder = versionFolderById(working, targetId);
  const top = [...working.trackIds];
  const folders = [...(working.versionFolders ?? [])];

  const removeFromTop = (id: string) => {
    const index = top.indexOf(id);
    if (index >= 0) {
      top.splice(index, 1);
    }
  };

  if (sourceFolder && targetFolder) {
    const mergedIds = uniqueTrackIds([...targetFolder.trackIds, ...sourceFolder.trackIds]);
    const nextTarget = { ...targetFolder, trackIds: mergedIds };
    const nextFolders = folders
      .filter((folder) => folder.id !== sourceFolder.id)
      .map((folder) => (folder.id === targetFolder.id ? nextTarget : folder));
    removeFromTop(sourceId);
    return dissolveTinyFolders({
      ...working,
      trackIds: top,
      versionFolders: pruneFolders(nextFolders, top),
    });
  }

  if (sourceFolder && !targetFolder) {
    if (sourceFolder.trackIds.includes(targetId)) {
      return null;
    }
    const nextSource = {
      ...sourceFolder,
      trackIds: uniqueTrackIds([...sourceFolder.trackIds, targetId]),
    };
    removeFromTop(targetId);
    const nextFolders = folders.map((folder) => (folder.id === sourceFolder.id ? nextSource : folder));
    return dissolveTinyFolders({
      ...working,
      trackIds: top,
      versionFolders: pruneFolders(nextFolders, top),
    });
  }

  if (!sourceFolder && targetFolder) {
    if (targetFolder.trackIds.includes(sourceId)) {
      return null;
    }
    const nextTarget = {
      ...targetFolder,
      trackIds: uniqueTrackIds([...targetFolder.trackIds, sourceId]),
    };
    removeFromTop(sourceId);
    const nextFolders = folders.map((folder) => (folder.id === targetFolder.id ? nextTarget : folder));
    return dissolveTinyFolders({
      ...working,
      trackIds: top,
      versionFolders: pruneFolders(nextFolders, top),
    });
  }

  const targetIndex = top.indexOf(targetId);
  if (targetIndex < 0 || !top.includes(sourceId)) {
    return null;
  }
  const folderId = createId('ver');
  const trackIds = uniqueTrackIds([targetId, sourceId]);
  const folder: AlbumVersionFolder = {
    id: folderId,
    name: versionFolderName(
      trackIds.map((id) => tracks.find((track) => track.id === id)?.title ?? id),
    ),
    trackIds,
    chosenId: targetId,
  };
  removeFromTop(sourceId);
  removeFromTop(targetId);
  const insertAt = Math.min(targetIndex, top.length);
  top.splice(insertAt, 0, folderId);
  return {
    ...working,
    trackIds: top,
    versionFolders: [...folders, folder],
    orderUpdatedAt: Date.now(),
  };
}

export function versionFolderNameFromTracks(tracks: Track[]): string {
  return versionFolderName(tracks.map((track) => track.title));
}

export function unpackVersionFolder(album: Album, folderId: string): Album | null {
  const folder = versionFolderById(album, folderId);
  if (!folder) {
    return null;
  }
  const index = album.trackIds.indexOf(folderId);
  const trackIds = [...album.trackIds];
  if (index >= 0) {
    trackIds.splice(index, 1, ...folder.trackIds);
  } else {
    trackIds.push(...folder.trackIds);
  }
  const versionFolders = (album.versionFolders ?? []).filter((item) => item.id !== folderId);
  return {
    ...album,
    trackIds,
    versionFolders: versionFolders.length ? versionFolders : undefined,
    orderUpdatedAt: Date.now(),
  };
}

export function removeTrackFromVersionFolders(album: Album, trackId: string): Album {
  const versionFolders = (album.versionFolders ?? []).map((folder) => {
    if (!folder.trackIds.includes(trackId)) {
      return folder;
    }
    const trackIds = folder.trackIds.filter((id) => id !== trackId);
    return {
      ...folder,
      trackIds,
      chosenId: folder.chosenId === trackId ? (trackIds[0] ?? folder.chosenId) : folder.chosenId,
    };
  });
  return dissolveTinyFolders({ ...album, versionFolders });
}

/** Peel a track out of any version folder and insert it at a top-level index. Dissolves folders with <2 tracks. */
export function extractTrackFromVersionFolder(
  album: Album,
  trackId: string,
  insertAt: number,
): Album {
  const owner = (album.versionFolders ?? []).find((folder) => folder.trackIds.includes(trackId));
  if (!owner) {
    return album;
  }
  const without = removeTrackFromVersionFolders(album, trackId);
  const trackIds = without.trackIds.filter((id) => id !== trackId);
  const at = Math.max(0, Math.min(insertAt, trackIds.length));
  trackIds.splice(at, 0, trackId);
  return {
    ...without,
    trackIds,
    orderUpdatedAt: Date.now(),
  };
}

export type AlbumListReorderItem =
  | { id: string; kind: 'top' }
  | { id: string; kind: 'version-track'; folderId: string };

/** Flat-list reorder: version-tracks that leave their folder block become top-level; tiny folders dissolve. */
export function applyAlbumListReorder(album: Album, items: AlbumListReorderItem[]): Album {
  const newTopIds: string[] = [];
  const folderChildOrders = new Map<string, string[]>();
  const foldersWithExpandedChildren = new Set<string>();
  let currentFolder: string | null = null;

  for (const item of items) {
    if (item.kind === 'version-track') {
      if (currentFolder === item.folderId) {
        const list = folderChildOrders.get(currentFolder) ?? [];
        list.push(item.id);
        folderChildOrders.set(currentFolder, list);
        foldersWithExpandedChildren.add(currentFolder);
      } else {
        currentFolder = null;
        newTopIds.push(item.id);
      }
      continue;
    }
    if (versionFolderById(album, item.id) || isVersionFolderId(item.id)) {
      currentFolder = item.id;
      newTopIds.push(item.id);
      if (!folderChildOrders.has(item.id)) {
        folderChildOrders.set(item.id, []);
      }
      continue;
    }
    currentFolder = null;
    newTopIds.push(item.id);
  }

  const extractedTop = new Set(
    newTopIds.filter((id) => !isSeparatorId(id) && !isVersionFolderId(id) && !versionFolderById(album, id)),
  );

  const versionFolders = (album.versionFolders ?? []).map((folder) => {
    if (foldersWithExpandedChildren.has(folder.id)) {
      const trackIds = uniqueTrackIds(folderChildOrders.get(folder.id) ?? []);
      return {
        ...folder,
        trackIds,
        chosenId: trackIds.includes(folder.chosenId) ? folder.chosenId : (trackIds[0] ?? folder.chosenId),
      };
    }
    const trackIds = folder.trackIds.filter((id) => !extractedTop.has(id));
    return {
      ...folder,
      trackIds,
      chosenId: trackIds.includes(folder.chosenId) ? folder.chosenId : (trackIds[0] ?? folder.chosenId),
    };
  });

  return dissolveTinyFolders({
    ...album,
    trackIds: newTopIds,
    versionFolders,
    orderUpdatedAt: Date.now(),
  });
}

function peelTrackToTopLevel(album: Album, trackId: string): Album {
  if (
    isSeparatorId(trackId) ||
    isVersionFolderId(trackId) ||
    versionFolderById(album, trackId) ||
    !(album.versionFolders ?? []).some((folder) => folder.trackIds.includes(trackId))
  ) {
    return album;
  }
  const versionFolders = (album.versionFolders ?? []).map((folder) => {
    if (!folder.trackIds.includes(trackId)) {
      return folder;
    }
    const trackIds = folder.trackIds.filter((id) => id !== trackId);
    return {
      ...folder,
      trackIds,
      chosenId: trackIds.includes(folder.chosenId) ? folder.chosenId : (trackIds[0] ?? folder.chosenId),
    };
  });
  const trackIds = album.trackIds.includes(trackId) ? album.trackIds : [...album.trackIds, trackId];
  return dissolveTinyFolders({ ...album, trackIds, versionFolders });
}

export function setVersionFolderChosen(album: Album, folderId: string, trackId: string): Album | null {
  const folder = versionFolderById(album, folderId);
  if (!folder || !folder.trackIds.includes(trackId)) {
    return null;
  }
  return {
    ...album,
    versionFolders: (album.versionFolders ?? []).map((item) =>
      item.id === folderId ? { ...item, chosenId: trackId } : item,
    ),
  };
}

export function renameVersionFolder(album: Album, folderId: string, name: string): Album | null {
  const trimmed = name.trim();
  if (!trimmed || !versionFolderById(album, folderId)) {
    return null;
  }
  return {
    ...album,
    versionFolders: (album.versionFolders ?? []).map((item) =>
      item.id === folderId ? { ...item, name: trimmed } : item,
    ),
  };
}

export function withNamedVersionFolder(album: Album, folderId: string, tracks: Track[]): Album {
  return {
    ...album,
    versionFolders: (album.versionFolders ?? []).map((folder) => {
      if (folder.id !== folderId) {
        return folder;
      }
      const titles = folder.trackIds
        .map((id) => tracks.find((track) => track.id === id)?.title)
        .filter((title): title is string => Boolean(title));
      return { ...folder, name: versionFolderName(titles) };
    }),
  };
}
