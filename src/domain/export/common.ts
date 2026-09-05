import { visibleMarkers } from '../markers';
import type { Marker } from '../models';

export function markersForExport(markers: Marker[]): Marker[] {
  return visibleMarkers(markers)
    .slice()
    .sort((a, b) => a.timestampMs - b.timestampMs || a.createdAt - b.createdAt);
}

export function markerExportName(marker: Marker): string {
  const flat = marker.text.replace(/\s+/g, ' ').trim();
  return flat || 'Appunto';
}

export function safeExportTitle(title: string): string {
  const cleaned = title.replace(/[/\\?%*:|"<>]/g, '-').replace(/\s+/g, ' ').trim();
  return cleaned.slice(0, 80) || 'traccia';
}

export function encodeUtf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}
