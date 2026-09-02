import { File } from 'expo-file-system';
import * as LegacyFS from 'expo-file-system/legacy';

import { createId } from '../domain/library';
import { isAudioName } from '../domain/audioFormats';
import { parseSidecar, sidecarNameForAudio, titleFromFileName } from '../domain/sidecar';
import type { Marker, Track } from '../domain/models';
import { uniqueAudioFileName } from './downloads';
import { decodeOverEncodedName } from './fileNames';
import { audioRelativePrefix } from './libraryOwner';
import { ensureDirAsync, pathExistsAsync } from './fsSafe';
import { audioDirectory, downloadsDirectory, inboxDirectory, libraryDirectory } from './libraryPaths';
import { persistLibraryUri, resolveLibraryUri } from './libraryUris';

export type ImportedBundle = {
  track: Track;
  markers: Marker[];
};

const README_NAME = 'Come usare questa cartella.txt';
const README_TEXT = `Questa è la cartella dei brani di ReWavier.

Ogni audio ha accanto un file degli appunti, con lo stesso nome.

Due iPhone, stesso ID Apple: all’apertura ReWavier allinea anche iCloud Drive → ReWavier.

iPhone e Android, o due Android: collega Google. ReWavier usa la cartella ReWavier su Drive.

Puoi ancora copiare questa cartella a mano (AirDrop o un cavo).
`;

function basename(uri: string): string {
  const clean = uri.split('?')[0] ?? uri;
  const parts = clean.replace(/\/$/, '').split('/');
  return decodeOverEncodedName(parts[parts.length - 1] ?? '');
}

function stripLegacyPrefix(name: string, trackId?: string): string {
  if (trackId && name.startsWith(`${trackId}-`)) {
    return name.slice(trackId.length + 1);
  }
  const match = name.match(/^(track|file)-[a-z0-9]+-(.+)$/i);
  return match?.[2] ?? name;
}

async function writeReadme(): Promise<void> {
  try {
    const dir = audioDirectory();
    await ensureDirAsync(dir.uri);
    const dest = `${dir.uri}/${README_NAME}`;
    if (await pathExistsAsync(dest)) {
      return;
    }
    await LegacyFS.writeAsStringAsync(dest, README_TEXT);
  } catch {
    // iCloud può non essere pronto: non bloccare libreria o sync
  }
}

async function moveIntoAudio(fromStored: string, preferredName: string): Promise<string | undefined> {
  const from = resolveLibraryUri(fromStored);
  if (!from) {
    return undefined;
  }
  const already = persistLibraryUri(from);
  if (already?.startsWith('Audio/') && new File(from).exists) {
    return already;
  }
  const name = uniqueAudioFileName(preferredName);
  const dest = new File(audioDirectory(), name);
  try {
    const source = new File(from);
    if (!source.exists) {
      return already;
    }
    if (dest.exists) {
      dest.delete();
    }
    try {
      source.move(dest);
    } catch {
      source.copy(dest);
      source.delete();
    }
  } catch {
    return already;
  }
  return persistLibraryUri(dest.uri) ?? `${audioRelativePrefix()}/${name}`;
}

async function migrateLooseFiles(dir: ReturnType<typeof downloadsDirectory>, prefix: 'downloads' | 'inbox') {
  if (!dir.exists) {
    return;
  }
  try {
    for (const entry of dir.list()) {
      const name = basename(entry.uri);
      if (!name || !isAudioName(name)) {
        continue;
      }
      await moveIntoAudio(`${prefix}/${name}`, stripLegacyPrefix(name));
    }
  } catch {
    // folder unreadable
  }
}

export async function migrateTracksToAudioFolder(tracks: Track[]): Promise<Track[]> {
  await writeReadme();
  const next: Track[] = [];
  for (const track of tracks) {
    const source = track.fileUri || track.inboxUri;
    if (!source) {
      next.push(track);
      continue;
    }
    const preferred = stripLegacyPrefix(
      track.sourceFileName || basename(source) || `${track.title}.m4a`,
      track.id,
    );
    const fileUri = await moveIntoAudio(source, preferred);
    next.push({
      ...track,
      fileUri,
      inboxUri: fileUri ? undefined : track.inboxUri,
      downloaded: Boolean(fileUri) || track.downloaded,
      sourceFileName: fileUri ? basename(fileUri) : track.sourceFileName,
    });
  }
  await migrateLooseFiles(downloadsDirectory(), 'downloads');
  await migrateLooseFiles(inboxDirectory(), 'inbox');
  await migrateSidecars();
  return next;
}

async function migrateSidecars() {
  const lib = libraryDirectory();
  if (!lib.exists) {
    return;
  }
  try {
    for (const entry of lib.list()) {
      const name = basename(entry.uri);
      if (!name.toLowerCase().endsWith('.rewavier.json')) {
        continue;
      }
      const dest = new File(audioDirectory(), name);
      if (dest.exists) {
        continue;
      }
      const from = resolveLibraryUri(name) ?? entry.uri;
      try {
        await LegacyFS.moveAsync({ from, to: dest.uri });
      } catch {
        // leave the old note file where it is
      }
    }
  } catch {
    // folder unreadable
  }
}

export function audioFileNamesForTrack(track: Pick<Track, 'fileUri' | 'inboxUri' | 'sourceFileName'>): string[] {
  const names = new Set<string>();
  for (const stored of [track.fileUri, track.inboxUri, track.sourceFileName]) {
    if (stored) {
      names.add(basename(stored));
    }
  }
  return [...names];
}

function claimedNames(tracks: Track[], extra: string[] = []): Set<string> {
  const names = new Set<string>(extra.filter(Boolean));
  for (const track of tracks) {
    for (const name of audioFileNamesForTrack(track)) {
      names.add(name);
    }
  }
  return names;
}

export async function scanAudioFolder(
  tracks: Track[],
  extraClaimed: string[] = [],
): Promise<ImportedBundle[]> {
  await writeReadme();
  const dir = audioDirectory();
  const claimed = claimedNames(tracks, extraClaimed);
  const bundles: ImportedBundle[] = [];
  let names: string[] = [];
  try {
    names = dir.list().map((entry) => basename(entry.uri)).filter(Boolean);
  } catch {
    return [];
  }

  for (const name of names) {
    if (!isAudioName(name) || claimed.has(name)) {
      continue;
    }
    let markers: Marker[] = [];
    let title = titleFromFileName(name);
    let artist = 'Dalla cartella';
    let durationMs = 0;
    let startMs: number | undefined;
    let endMs: number | undefined;
    let exerciseOpenId: string | undefined;
    let exerciseCloseId: string | undefined;
    let practiceHoleId: string | undefined;
    const sidecarFile = new File(dir, sidecarNameForAudio(name));
    if (sidecarFile.exists) {
      try {
        const parsed = parseSidecar(await sidecarFile.text());
        if (parsed) {
          markers = parsed.markers;
          title = parsed.title || title;
          artist = parsed.artist || artist;
          durationMs = parsed.durationMs || 0;
          startMs = parsed.startMs;
          endMs = parsed.endMs;
          exerciseOpenId = parsed.exerciseOpenId;
          exerciseCloseId = parsed.exerciseCloseId;
          practiceHoleId = parsed.practiceHoleId;
        }
      } catch {
        // sidecar unreadable
      }
    }
    bundles.push({
      track: {
        id: createId('track'),
        title,
        artist,
        durationMs,
        fileUri: `${audioRelativePrefix()}/${name}`,
        sourceFileName: name,
        startMs,
        endMs,
        exerciseOpenId,
        exerciseCloseId,
        practiceHoleId,
        downloaded: true,
        downloadedAt: Date.now(),
      },
      markers,
    });
  }
  return bundles;
}

export function sidecarPathForTrack(track: Track, authorSlug?: string): string {
  const stored = persistLibraryUri(track.fileUri);
  const audioName = stored?.startsWith('Audio/')
    ? basename(stored)
    : track.sourceFileName ?? `${track.title}.m4a`;
  return sidecarNameForAudio(audioName, authorSlug);
}
