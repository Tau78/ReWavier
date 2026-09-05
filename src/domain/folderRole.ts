export type FolderRole = 'owner' | 'editor' | 'viewer';

export type DriveFolderCapabilities = {
  ownedByMe?: boolean;
  capabilities?: {
    canEdit?: boolean;
    canComment?: boolean;
  };
};

export function roleFromDriveCapabilities(data: DriveFolderCapabilities): FolderRole {
  if (data.ownedByMe === true) {
    return 'owner';
  }
  if (data.capabilities?.canEdit === true) {
    return 'editor';
  }
  return 'viewer';
}

export function canWriteWithRole(role: FolderRole): boolean {
  return role !== 'viewer';
}

export function folderRoleLabel(role: FolderRole): string {
  if (role === 'owner') {
    return 'Proprietario';
  }
  if (role === 'editor') {
    return 'Può scrivere';
  }
  return 'Solo lettura';
}

/** Short line under a Drive album title. Everyday Italian, one idea. */
export function folderRoleLine(role: FolderRole): string {
  if (role === 'owner') {
    return 'Sei il proprietario';
  }
  return folderRoleLabel(role);
}

export function roleOfAlbum(album?: {
  driveFolderId?: string;
  driveRole?: FolderRole;
} | null): FolderRole {
  if (!album?.driveFolderId) {
    return 'owner';
  }
  return album.driveRole ?? 'owner';
}

export const FOLDER_READ_ONLY_MESSAGE = 'Questa cartella è solo lettura.';
