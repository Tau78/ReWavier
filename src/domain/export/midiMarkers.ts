import type { Marker, Track } from '../models';
import { markerExportName, markersForExport } from './common';

export const MIDI_PPQ = 480;
export const MIDI_BPM = 120;

/** 120 BPM / 480 PPQ → 960 ticks per second. */
export function msToMidiTicks(
  timestampMs: number,
  ppq = MIDI_PPQ,
  bpm = MIDI_BPM,
): number {
  return Math.max(0, Math.round((Math.max(0, timestampMs) * ppq * bpm) / 60000));
}

export function writeVariableLength(value: number): number[] {
  let n = Math.max(0, Math.floor(value));
  const bytes = [n & 0x7f];
  n >>= 7;
  while (n > 0) {
    bytes.unshift((n & 0x7f) | 0x80);
    n >>= 7;
  }
  return bytes;
}

function u16(n: number): number[] {
  return [(n >> 8) & 0xff, n & 0xff];
}

function u32(n: number): number[] {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}

function metaTextBytes(text: string): number[] {
  const raw = new TextEncoder().encode(text.replace(/\0/g, ''));
  const clipped = raw.length > 255 ? raw.subarray(0, 255) : raw;
  return [...clipped];
}

function metaEvent(delta: number, type: number, data: number[]): number[] {
  return [...writeVariableLength(delta), 0xff, type, ...writeVariableLength(data.length), ...data];
}

export function buildMidiMarkers(track: Track, markers: Marker[]): Uint8Array {
  const exported = markersForExport(markers);
  const events: number[] = [];

  // Set Tempo: 500_000 µs per quarter = 120 BPM.
  events.push(...metaEvent(0, 0x51, [0x07, 0xa1, 0x20]));
  events.push(...metaEvent(0, 0x03, metaTextBytes(track.title.trim() || 'traccia')));

  let lastTick = 0;
  for (const marker of exported) {
    const tick = msToMidiTicks(marker.timestampMs);
    const delta = Math.max(0, tick - lastTick);
    events.push(...metaEvent(delta, 0x06, metaTextBytes(markerExportName(marker))));
    lastTick = tick;
  }

  events.push(...metaEvent(0, 0x2f, []));

  const header = [0x4d, 0x54, 0x68, 0x64, ...u32(6), ...u16(0), ...u16(1), ...u16(MIDI_PPQ)];
  const trackChunk = [0x4d, 0x54, 0x72, 0x6b, ...u32(events.length), ...events];
  return Uint8Array.from([...header, ...trackChunk]);
}
