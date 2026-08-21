import type { Marker } from '../domain/models';

export function mergeMarkers(local: Marker[], incoming: Marker[]): Marker[] {
  const byId = new Map<string, Marker>();
  for (const marker of local) {
    byId.set(marker.id, marker);
  }
  for (const remote of incoming) {
    const existing = byId.get(remote.id);
    if (!existing) {
      byId.set(remote.id, remote);
      continue;
    }
    if ((remote.updatedAt ?? 0) >= (existing.updatedAt ?? 0)) {
      byId.set(remote.id, { ...existing, ...remote });
    }
  }
  return [...byId.values()].sort((a, b) => a.timestampMs - b.timestampMs);
}

export function applyKeepFlags(markers: Marker[], keepIds: string[]): Marker[] {
  const keep = new Set(keepIds);
  const now = Date.now();
  return markers.map((marker) =>
    keep.has(marker.id) ? marker : { ...marker, hidden: true, updatedAt: now },
  );
}
