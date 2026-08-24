import { isAudioName } from '../../domain/audioFormats';
import { isSidecarName } from '../../domain/sidecar';

/** File di sistema / help: non vanno sincronizzati su iCloud o Drive. */
export const SYNC_SKIP_NAMES = new Set([
  'Come usare questa cartella.txt',
  '.DS_Store',
  'library.json',
  'icloud-library.json',
  'icloud-telefoni.json',
]);

export function shouldSyncBagFile(name: string): boolean {
  if (!name || name.startsWith('.') || SYNC_SKIP_NAMES.has(name)) {
    return false;
  }
  return isAudioName(name) || isSidecarName(name);
}
