export type Track = {
  id: string;
  title: string;
  artist: string;
  durationMs: number;
  fileUri?: string;
  inboxUri?: string;
  remoteUri?: string;
  sourceFileName?: string;
  downloaded?: boolean;
  downloadedAt?: number;
  driveFileId?: string;
  remoteModifiedAt?: string;
  remoteSize?: number;
  remoteHash?: string;
};

export type Marker = {
  id: string;
  timestampMs: number;
  text: string;
  createdAt: number;
  updatedAt: number;
  hidden?: boolean;
  authorId?: string;
  authorName?: string;
  color?: string;
  editableByOthers?: boolean;
};

export type NoteBubbleState = {
  visible: boolean;
  timestampMs: number;
  markerId: string | null;
  draft: string;
};

export function formatTimecode(ms: number): string {
  const clamped = Math.max(0, Math.floor(ms));
  const minutes = Math.floor(clamped / 60000);
  const seconds = Math.floor((clamped % 60000) / 1000);
  const millis = clamped % 1000;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

export function clampTime(ms: number, durationMs: number): number {
  return Math.min(durationMs, Math.max(0, ms));
}

