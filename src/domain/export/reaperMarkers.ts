import type { Marker, Track } from '../models';
import { markerExportName, markersForExport } from './common';

function csvField(value: string): string {
  const flat = value.replace(/\r?\n/g, ' ').trim();
  if (/[",]/.test(flat)) {
    return `"${flat.replace(/"/g, '""')}"`;
  }
  return flat;
}

export function markerStartSeconds(timestampMs: number): string {
  return (Math.max(0, timestampMs) / 1000).toFixed(3);
}

export function buildReaperMarkerCsv(_track: Track, markers: Marker[]): string {
  const rows = ['# ,Name,Start'];
  markersForExport(markers).forEach((marker, index) => {
    rows.push(`M${index + 1},${csvField(markerExportName(marker))},${markerStartSeconds(marker.timestampMs)}`);
  });
  return `${rows.join('\n')}\n`;
}
