import { slugFromName } from './session';

const MOJIBAKE_HINT = /(?:Ã|Â|ï¿½|â€)/;

function applyCommonMojibakeFixes(value: string): string {
  return value
    .replace(/Ã\u00a0/g, 'à')
    .replace(/Ã¨/g, 'è')
    .replace(/Ã©/g, 'é')
    .replace(/Ã¬/g, 'ì')
    .replace(/Ã²/g, 'ò')
    .replace(/Ã¹/g, 'ù')
    .replace(/Ã /g, 'à ')
    .replace(/([a-zA-Z])Ã(?=\s|$|[^a-zA-Z])/g, '$1à');
}

/** UTF-8 read as Latin-1 (Fabio LaganÃ → Fabio Laganà). Safe no-op when already fine. */
export function repairUtf8Mojibake(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || !MOJIBAKE_HINT.test(trimmed)) {
    return value;
  }
  let out = applyCommonMojibakeFixes(trimmed);
  if (!MOJIBAKE_HINT.test(out)) {
    return out;
  }
  try {
    const bytes = Uint8Array.from([...trimmed].map((ch) => ch.charCodeAt(0) & 0xff));
    const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    if (decoded && decoded !== trimmed) {
      out = applyCommonMojibakeFixes(decoded);
      if (!MOJIBAKE_HINT.test(out)) {
        return out;
      }
    }
  } catch {
    // keep out
  }
  return out;
}

export function normalizeDisplayName(value: string | undefined | null): string {
  if (!value) {
    return '';
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  try {
    return repairUtf8Mojibake(trimmed).normalize('NFC');
  } catch {
    return repairUtf8Mojibake(trimmed);
  }
}

export function hasMojibake(value: string): boolean {
  return MOJIBAKE_HINT.test(value);
}

export function memberHandleFromName(name: string): string {
  return slugFromName(normalizeDisplayName(name));
}

/** Account id from login — not a display-name fallback key. */
export function looksLikeAuthorId(key: string): boolean {
  const k = key.trim();
  if (!k || k.includes('@') || /\s/.test(k)) {
    return false;
  }
  if (/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(k)) {
    return true;
  }
  if (/^\d{10,}$/.test(k)) {
    return true;
  }
  if (/^[A-Za-z0-9_-]{20,}$/.test(k) && /\d/.test(k)) {
    return true;
  }
  return false;
}

export function preferDisplayName(left: string, right: string): string {
  const a = normalizeDisplayName(left);
  const b = normalizeDisplayName(right);
  if (!a) {
    return b;
  }
  if (!b) {
    return a;
  }
  const aBad = hasMojibake(a);
  const bBad = hasMojibake(b);
  if (aBad !== bBad) {
    return bBad ? a : b;
  }
  return b.length > a.length ? b : a;
}
