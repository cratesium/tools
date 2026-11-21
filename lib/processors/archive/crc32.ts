/** Table-driven CRC-32 (IEEE 802.3, as used by ZIP and GZIP). Incremental: pass the previous value. */
let TABLE: Uint32Array | null = null;

function table(): Uint32Array {
  if (TABLE) return TABLE;
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  TABLE = t;
  return t;
}

export function crc32(data: Uint8Array, previous = 0): number {
  const t = table();
  let c = (previous ^ 0xffffffff) >>> 0;
  for (let i = 0; i < data.length; i++) c = t[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function crc32Hex(n: number): string {
  return (n >>> 0).toString(16).padStart(8, "0");
}
