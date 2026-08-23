import { File } from 'expo-file-system';

function readFourCC(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}

export function sliceWavBuffer(
  buffer: ArrayBuffer,
  startMs: number,
  durationMs: number,
): Uint8Array | null {
  if (buffer.byteLength < 44) {
    return null;
  }
  const view = new DataView(buffer);
  if (readFourCC(view, 0) !== 'RIFF' || readFourCC(view, 8) !== 'WAVE') {
    return null;
  }

  let offset = 12;
  let fmtOffset = -1;
  let fmtSize = 0;
  let dataOffset = -1;
  let dataSize = 0;
  let sampleRate = 44100;
  let blockAlign = 2;

  while (offset + 8 <= view.byteLength) {
    const id = readFourCC(view, offset);
    const size = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (id === 'fmt ' && size >= 16) {
      fmtOffset = start;
      fmtSize = size;
      sampleRate = view.getUint32(start + 4, true);
      blockAlign = view.getUint16(start + 12, true);
      if (blockAlign < 1) {
        const channels = Math.max(1, view.getUint16(start + 2, true));
        const bits = view.getUint16(start + 14, true);
        blockAlign = channels * Math.max(1, Math.ceil(bits / 8));
      }
    } else if (id === 'data') {
      dataOffset = start;
      dataSize = size;
      break;
    }
    offset = start + size + (size % 2);
  }

  if (fmtOffset < 0 || dataOffset < 0 || sampleRate < 1 || blockAlign < 1) {
    return null;
  }

  const totalFrames = Math.floor(dataSize / blockAlign);
  if (totalFrames < 1) {
    return null;
  }

  const startFrame = Math.max(0, Math.floor((Math.max(0, startMs) / 1000) * sampleRate));
  if (startFrame >= totalFrames) {
    return null;
  }
  const wantFrames = Math.max(1, Math.round((Math.max(0, durationMs) / 1000) * sampleRate));
  const frameCount = Math.min(wantFrames, totalFrames - startFrame);
  const sliceBytes = frameCount * blockAlign;
  const sliceStart = dataOffset + startFrame * blockAlign;
  if (sliceStart + sliceBytes > view.byteLength) {
    return null;
  }

  const fmtBytes = Math.max(16, fmtSize);
  const fmtPad = fmtBytes % 2;
  const headerSize = 12 + 8 + fmtBytes + fmtPad + 8;
  const out = new Uint8Array(headerSize + sliceBytes);
  const outView = new DataView(out.buffer);

  const writeStr = (at: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) {
      out[at + i] = text.charCodeAt(i);
    }
  };

  writeStr(0, 'RIFF');
  outView.setUint32(4, headerSize + sliceBytes - 8, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  outView.setUint32(16, fmtBytes, true);
  out.set(new Uint8Array(buffer, fmtOffset, fmtBytes), 20);
  const dataAt = 20 + fmtBytes + fmtPad;
  writeStr(dataAt, 'data');
  outView.setUint32(dataAt + 4, sliceBytes, true);
  out.set(new Uint8Array(buffer, sliceStart, sliceBytes), dataAt + 8);
  return out;
}

export async function sliceLocalWavFile(
  fileUri: string,
  startMs: number,
  durationMs: number,
): Promise<Uint8Array | null> {
  try {
    if (fileUri.startsWith('http://') || fileUri.startsWith('https://')) {
      return null;
    }
    const path = (fileUri.split('?')[0] ?? fileUri).toLowerCase();
    if (!path.endsWith('.wav') && !path.endsWith('.wave')) {
      return null;
    }
    const file = new File(fileUri);
    if (!file.exists) {
      return null;
    }
    const bytes = await file.bytes();
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    return sliceWavBuffer(buffer, startMs, durationMs);
  } catch {
    return null;
  }
}
