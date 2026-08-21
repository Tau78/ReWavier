import { File } from 'expo-file-system';

import { peakCountForDuration, peaksFromFrames } from './pcmPeaks';

export type DecodedPeaks = {
  peaks: number[];
  durationMs: number;
};

function readFourCC(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}

function readExtended80(view: DataView, offset: number): number {
  const exp = view.getUint16(offset, false);
  const hi = view.getUint32(offset + 2, false);
  const lo = view.getUint32(offset + 6, false);
  const sign = exp & 0x8000 ? -1 : 1;
  const exponent = (exp & 0x7fff) - 16383;
  const mantissa = hi / 0x80000000 + lo / 0x80000000 / 0x100000000;
  return sign * mantissa * 2 ** exponent;
}

function getInt24(view: DataView, offset: number, littleEndian: boolean): number {
  const b0 = view.getUint8(offset);
  const b1 = view.getUint8(offset + 1);
  const b2 = view.getUint8(offset + 2);
  let value = littleEndian ? b0 | (b1 << 8) | (b2 << 16) : b2 | (b1 << 8) | (b0 << 16);
  if (value & 0x800000) {
    value |= ~0xffffff;
  }
  return value;
}

function sampleReader(
  view: DataView,
  dataOffset: number,
  channels: number,
  bits: number,
  littleEndian: boolean,
  float: boolean,
): (frame: number) => number {
  const bytes = Math.ceil(bits / 8);
  const step = channels * bytes;
  return (frame: number) => {
    const base = dataOffset + frame * step;
    let sum = 0;
    for (let c = 0; c < channels; c++) {
      const offset = base + c * bytes;
      if (float && bits === 32) {
        sum += view.getFloat32(offset, littleEndian);
      } else if (bits === 8) {
        sum += (view.getUint8(offset) - 128) / 128;
      } else if (bits === 16) {
        sum += view.getInt16(offset, littleEndian) / 32768;
      } else if (bits === 24) {
        sum += getInt24(view, offset, littleEndian) / 8388608;
      } else if (bits === 32) {
        sum += view.getInt32(offset, littleEndian) / 2147483648;
      }
    }
    return sum / channels;
  };
}

function decodeWav(buffer: ArrayBuffer): DecodedPeaks | null {
  if (buffer.byteLength < 44) {
    return null;
  }
  const view = new DataView(buffer);
  if (readFourCC(view, 0) !== 'RIFF' || readFourCC(view, 8) !== 'WAVE') {
    return null;
  }

  let offset = 12;
  let audioFormat = 1;
  let channels = 1;
  let sampleRate = 44100;
  let bits = 16;
  let dataOffset = -1;
  let dataSize = 0;

  while (offset + 8 <= view.byteLength) {
    const id = readFourCC(view, offset);
    const size = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (id === 'fmt ' && size >= 16) {
      audioFormat = view.getUint16(start, true);
      channels = Math.max(1, view.getUint16(start + 2, true));
      sampleRate = view.getUint32(start + 4, true);
      bits = view.getUint16(start + 14, true);
    } else if (id === 'data') {
      dataOffset = start;
      dataSize = size;
      break;
    }
    offset = start + size + (size % 2);
  }

  if (dataOffset < 0 || channels < 1 || sampleRate < 1) {
    return null;
  }

  const float = audioFormat === 3;
  const pcm = audioFormat === 1 || audioFormat === 0xfffe || float;
  if (!pcm) {
    return null;
  }

  const bytes = Math.ceil(bits / 8);
  const frameCount = Math.floor(dataSize / (channels * bytes));
  if (frameCount < 1) {
    return null;
  }

  const durationMs = Math.round((frameCount / sampleRate) * 1000);
  const peaks = peaksFromFrames(
    frameCount,
    peakCountForDuration(durationMs),
    sampleReader(view, dataOffset, channels, bits, true, float),
  );
  return { peaks, durationMs };
}

function decodeAiff(buffer: ArrayBuffer): DecodedPeaks | null {
  if (buffer.byteLength < 54) {
    return null;
  }
  const view = new DataView(buffer);
  if (readFourCC(view, 0) !== 'FORM') {
    return null;
  }
  const formType = readFourCC(view, 8);
  if (formType !== 'AIFF') {
    return null;
  }

  let offset = 12;
  let channels = 1;
  let frameCount = 0;
  let bits = 16;
  let sampleRate = 44100;
  let dataOffset = -1;

  while (offset + 8 <= view.byteLength) {
    const id = readFourCC(view, offset);
    const size = view.getUint32(offset + 4, false);
    const start = offset + 8;
    if (id === 'COMM' && size >= 18) {
      channels = Math.max(1, view.getInt16(start, false));
      frameCount = view.getUint32(start + 2, false);
      bits = view.getInt16(start + 6, false);
      sampleRate = readExtended80(view, start + 8);
    } else if (id === 'SSND' && size >= 8) {
      const ssndOffset = view.getUint32(start, false);
      dataOffset = start + 8 + ssndOffset;
      break;
    }
    offset = start + size + (size % 2);
  }

  if (dataOffset < 0 || frameCount < 1 || channels < 1) {
    return null;
  }
  if (!Number.isFinite(sampleRate) || sampleRate < 1) {
    sampleRate = 44100;
  }

  const durationMs = Math.round((frameCount / sampleRate) * 1000);
  const peaks = peaksFromFrames(
    frameCount,
    peakCountForDuration(durationMs),
    sampleReader(view, dataOffset, channels, bits, false, false),
  );
  return { peaks, durationMs };
}

export async function decodePcmPeaks(uri: string): Promise<DecodedPeaks | null> {
  try {
    const file = new File(uri);
    if (!file.exists) {
      return null;
    }
    const bytes = await file.bytes();
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    return decodeWav(buffer) ?? decodeAiff(buffer);
  } catch {
    return null;
  }
}
