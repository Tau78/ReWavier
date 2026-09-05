import { formatTimecode, type Marker, type Track } from '../models';
import { markerExportName, markersForExport } from './common';

function cell(value: string): string {
  return value.replace(/\t/g, ' ').replace(/\r?\n/g, ' ').trim();
}

export function buildLogicMarkerList(_track: Track, markers: Marker[]): string {
  const rows = ['Ora\tNome'];
  for (const marker of markersForExport(markers)) {
    rows.push(`${formatTimecode(marker.timestampMs)}\t${cell(markerExportName(marker))}`);
  }
  return `${rows.join('\n')}\n`;
}
