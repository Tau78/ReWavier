import { isAudioName as isAudioFileName } from './audioFormats';
import { normalizeMarker } from './markers';
import type { Marker, Track } from './models';

export const SIDECAR_SUFFIX = '.rewavier.json';
export const SIDECAR_VERSION = 2;

export type SidecarFile = {
  version: number;
  app: 'rewavier';
  audioFileName: string;
  title: string;
  artist: string;
  durationMs: number;
  markers: Marker[];
  startMs?: number;
  endMs?: number;
  exerciseOpenId?: string;
  exerciseCloseId?: string;
  practiceHoleId?: string;
};

export function audioBasename(fileName: string): string {
  if (fileName.toLowerCase().endsWith(SIDECAR_SUFFIX)) {
    const without = fileName.slice(0, -SIDECAR_SUFFIX.length);
    const parts = without.split('.');
    if (parts.length >= 2 && /^[a-z0-9_-]+$/i.test(parts[parts.length - 1] ?? '')) {
      return parts.slice(0, -1).join('.');
    }
    return without;
  }
  const dot = fileName.lastIndexOf('.');
  return dot > 0 ? fileName.slice(0, dot) : fileName;
}

/** Drive / iOS may percent-encode the same name more than once. NFC so é matches é. */
export function decodeFileNameForMatch(fileName: string): string {
  let current = fileName.trim();
  for (let i = 0; i < 5; i += 1) {
    try {
      const next = decodeURIComponent(current.replace(/\+/g, ' '));
      if (next === current) {
        break;
      }
      current = next;
    } catch {
      break;
    }
  }
  try {
    return current.normalize('NFC');
  } catch {
    return current;
  }
}

/** Compare local ↔ remote audio names (encoding and unicode must not create a second row). */
export function audioMatchKey(fileName: string): string {
  const decoded = decodeFileNameForMatch(fileName);
  const lower = decoded.toLowerCase();
  const hasAudioExt = isAudioFileName(decoded) || lower.endsWith(SIDECAR_SUFFIX) || lower.endsWith('.json');
  return (hasAudioExt ? audioBasename(decoded) : decoded).toLowerCase();
}

export function isSidecarName(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  if (lower === 'rewavier.order.json') {
    return false;
  }
  return lower.endsWith(SIDECAR_SUFFIX) || lower.endsWith('.json');
}

export function sidecarAuthorSlug(fileName: string): string | undefined {
  if (!fileName.toLowerCase().endsWith(SIDECAR_SUFFIX)) {
    return undefined;
  }
  const without = fileName.slice(0, -SIDECAR_SUFFIX.length);
  const parts = without.split('.');
  if (parts.length >= 2 && /^[a-z0-9_-]+$/i.test(parts[parts.length - 1] ?? '')) {
    return parts[parts.length - 1];
  }
  return undefined;
}

export function isAudioName(fileName: string): boolean {
  return isAudioFileName(fileName);
}

export function extensionOfAudioName(fileName?: string): string {
  if (!fileName) {
    return '.m4a';
  }
  const lower = fileName.toLowerCase();
  if (lower.endsWith(SIDECAR_SUFFIX) || lower.endsWith('.json')) {
    return '.m4a';
  }
  const base = audioBasename(fileName);
  const ext = fileName.slice(base.length);
  return ext.startsWith('.') ? ext : '.m4a';
}

export function sourceFileNameFromTitle(title: string, previous?: string): string {
  const ext = extensionOfAudioName(previous);
  const trimmed = title.trim();
  const withoutExt = trimmed.toLowerCase().endsWith(ext.toLowerCase())
    ? trimmed.slice(0, -ext.length)
    : trimmed;
  const safe = withoutExt.replace(/[/\\?%*:|"<>]/g, '-').trim() || 'traccia';
  return `${safe}${ext}`;
}

export function sidecarNameForAudio(fileName: string, authorSlug?: string): string {
  const base = audioBasename(fileName);
  if (authorSlug) {
    return `${base}.${authorSlug}${SIDECAR_SUFFIX}`;
  }
  return `${base}${SIDECAR_SUFFIX}`;
}

export function buildSidecar(track: Track, markers: Marker[]): SidecarFile {
  return {
    version: SIDECAR_VERSION,
    app: 'rewavier',
    audioFileName: track.sourceFileName ?? `${track.title}.mp3`,
    title: track.title,
    artist: track.artist,
    durationMs: track.durationMs,
    markers,
    startMs: track.startMs,
    endMs: track.endMs,
    exerciseOpenId: track.exerciseOpenId,
    exerciseCloseId: track.exerciseCloseId,
    practiceHoleId: track.practiceHoleId,
  };
}

export function parseSidecar(raw: string): SidecarFile | null {
  try {
    const data = JSON.parse(raw) as Partial<SidecarFile> & { markers?: Marker[] };
    if (!Array.isArray(data.markers)) {
      return null;
    }
    return {
      version: typeof data.version === 'number' ? data.version : 1,
      app: 'rewavier',
      audioFileName: data.audioFileName ?? '',
      title: data.title ?? '',
      artist: data.artist ?? '',
      durationMs: data.durationMs ?? 0,
      startMs: typeof data.startMs === 'number' ? data.startMs : undefined,
      endMs: typeof data.endMs === 'number' ? data.endMs : undefined,
      exerciseOpenId: typeof data.exerciseOpenId === 'string' ? data.exerciseOpenId : undefined,
      exerciseCloseId: typeof data.exerciseCloseId === 'string' ? data.exerciseCloseId : undefined,
      practiceHoleId: typeof data.practiceHoleId === 'string' ? data.practiceHoleId : undefined,
      markers: data.markers.map((marker) =>
        normalizeMarker({
          id: marker.id,
          timestampMs: marker.timestampMs,
          text: marker.text,
          createdAt: marker.createdAt,
          updatedAt: marker.updatedAt,
          hidden: marker.hidden,
          authorId: marker.authorId,
          authorName: marker.authorName,
          color: marker.color,
          editableByOthers: marker.editableByOthers,
        }),
      ),
    };
  } catch {
    return null;
  }
}

export function titleFromFileName(fileName: string): string {
  return audioBasename(fileName).replace(/[_-]+/g, ' ').trim() || fileName;
}
