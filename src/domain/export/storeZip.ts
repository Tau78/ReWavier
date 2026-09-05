import { encodeUtf8 } from './common';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function u16le(n: number): number[] {
  return [n & 0xff, (n >> 8) & 0xff];
}

function u32le(n: number): number[] {
  return [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];
}

export type ZipEntry = {
  name: string;
  data: Uint8Array;
};

export function packStoreZip(entries: ZipEntry[]): Uint8Array {
  const locals: number[] = [];
  const centrals: number[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encodeUtf8(entry.name.replace(/[/\\]/g, '-'));
    const data = entry.data;
    const crc = crc32(data);
    const local = [
      ...u32le(0x04034b50),
      ...u16le(20),
      ...u16le(0),
      ...u16le(0),
      ...u16le(0),
      ...u16le(0),
      ...u32le(crc),
      ...u32le(data.length),
      ...u32le(data.length),
      ...u16le(name.length),
      ...u16le(0),
      ...name,
      ...data,
    ];
    locals.push(...local);
    centrals.push(
      ...u32le(0x02014b50),
      ...u16le(20),
      ...u16le(20),
      ...u16le(0),
      ...u16le(0),
      ...u16le(0),
      ...u16le(0),
      ...u32le(crc),
      ...u32le(data.length),
      ...u32le(data.length),
      ...u16le(name.length),
      ...u16le(0),
      ...u16le(0),
      ...u16le(0),
      ...u16le(0),
      ...u32le(0),
      ...u32le(offset),
      ...name,
    );
    offset += local.length;
  }

  const centralOffset = offset;
  const eocd = [
    ...u32le(0x06054b50),
    ...u16le(0),
    ...u16le(0),
    ...u16le(entries.length),
    ...u16le(entries.length),
    ...u32le(centrals.length),
    ...u32le(centralOffset),
    ...u16le(0),
  ];
  return Uint8Array.from([...locals, ...centrals, ...eocd]);
}
