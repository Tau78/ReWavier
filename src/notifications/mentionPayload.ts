export type MentionNotificationPayload = {
  kind: 'mention';
  albumId: string;
  trackId: string;
  markerId: string;
  timestampMs: number;
};

export function mentionPayloadFromData(
  data: Record<string, unknown> | undefined,
): MentionNotificationPayload | null {
  if (!data || data.kind !== 'mention') {
    return null;
  }
  const albumId = typeof data.albumId === 'string' ? data.albumId.trim() : '';
  const trackId = typeof data.trackId === 'string' ? data.trackId.trim() : '';
  const markerId = typeof data.markerId === 'string' ? data.markerId.trim() : '';
  const timestampMs = Number(data.timestampMs);
  if (!albumId || !trackId || !markerId || !Number.isFinite(timestampMs)) {
    return null;
  }
  return {
    kind: 'mention',
    albumId,
    trackId,
    markerId,
    timestampMs: Math.round(timestampMs),
  };
}

export function mentionPayloadToData(payload: MentionNotificationPayload): Record<string, unknown> {
  return { ...payload };
}
