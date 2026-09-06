import * as LegacyFS from 'expo-file-system/legacy';

import { ensureDirAsync, pathExistsAsync, withTimeout } from './fsSafe';
import { libraryDirectory } from './libraryPaths';

export type HelpSnapshot = {
  tourDone: boolean;
  userId?: string;
  seenWhatsNewVersion?: string;
};

const FILE_NAME = 'help.json';

function helpFileUri(): string {
  return `${libraryDirectory().uri}/${FILE_NAME}`;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

async function readRawObject(): Promise<Record<string, unknown>> {
  const uri = helpFileUri();
  const exists = await withTimeout(pathExistsAsync(uri), 2000, false);
  if (!exists) {
    return {};
  }
  try {
    const raw = await withTimeout(LegacyFS.readAsStringAsync(uri), 3000, '');
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function loadHelpSnapshot(): Promise<HelpSnapshot> {
  const parsed = await readRawObject();
  if (Object.keys(parsed).length === 0) {
    return { tourDone: false };
  }
  const userId = optionalString(parsed.userId);
  const seenWhatsNewVersion = optionalString(parsed.seenWhatsNewVersion);
  return {
    tourDone: parsed.tourDone === true,
    ...(userId !== undefined ? { userId } : {}),
    ...(seenWhatsNewVersion !== undefined ? { seenWhatsNewVersion } : {}),
  };
}

export async function saveHelpSnapshot(snapshot: HelpSnapshot): Promise<void> {
  await ensureDirAsync(libraryDirectory().uri);
  const previous = await readRawObject();
  const next: Record<string, unknown> = {
    ...previous,
    tourDone: snapshot.tourDone === true,
  };
  if (snapshot.userId !== undefined) {
    next.userId = snapshot.userId;
  }
  if (snapshot.seenWhatsNewVersion !== undefined) {
    next.seenWhatsNewVersion = snapshot.seenWhatsNewVersion;
  }
  await LegacyFS.writeAsStringAsync(helpFileUri(), JSON.stringify(next));
}
