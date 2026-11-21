/**
 * WAV (RIFF PCM) encoder/decoder. Pure; works on Float32 channel data as produced by
 * AudioBuffer.getChannelData().
 */

export type WavBitDepth = 16 | 24 | 32;

/** Encodes planar float channels (−1…1) into a WAV file. 32 = IEEE float. */
export function encodeWav(channels: Float32Array[], sampleRate: number, bitDepth: WavBitDepth = 16): Uint8Array {
  if (!channels.length) throw new Error("No audio channels.");
  const numCh = channels.length;
  const len = channels[0].length;
  for (const c of channels) if (c.length !== len) throw new Error("Channels must have equal length.");
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numCh * bytesPerSample;
  const dataSize = len * blockAlign;
  if (dataSize > 0xffffffff - 44) throw new Error("Audio is too long for a WAV file (4 GB limit).");
  const buf = new ArrayBuffer(44 + dataSize);
  const v = new DataView(buf);
  const isFloat = bitDepth === 32;
  writeStr(v, 0, "RIFF");
  v.setUint32(4, 36 + dataSize, true);
  writeStr(v, 8, "WAVE");
  writeStr(v, 12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, isFloat ? 3 : 1, true);
  v.setUint16(22, numCh, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * blockAlign, true);
  v.setUint16(32, blockAlign, true);
  v.setUint16(34, bitDepth, true);
  writeStr(v, 36, "data");
  v.setUint32(40, dataSize, true);

  let o = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < numCh; c++) {
      let s = channels[c][i];
      if (Number.isNaN(s)) s = 0;
      if (isFloat) {
        v.setFloat32(o, s, true);
      } else {
        s = s < -1 ? -1 : s > 1 ? 1 : s;
        if (bitDepth === 16) {
          v.setInt16(o, s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff), true);
        } else {
          const x = s < 0 ? Math.round(s * 0x800000) : Math.round(s * 0x7fffff);
          v.setUint8(o, x & 0xff);
          v.setUint8(o + 1, (x >> 8) & 0xff);
          v.setUint8(o + 2, (x >> 16) & 0xff);
        }
      }
      o += bytesPerSample;
    }
  }
  return new Uint8Array(buf);
}

export interface DecodedWav {
  sampleRate: number;
  bitDepth: number;
  channels: Float32Array[];
}

/** Decodes 8/16/24/32-bit PCM and 32-bit float WAV files. */
export function decodeWav(bytes: Uint8Array): DecodedWav {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (readStr(v, 0, 4) !== "RIFF" || readStr(v, 8, 4) !== "WAVE") throw new Error("Not a WAV file.");
  let off = 12;
  let fmt: { format: number; channels: number; sampleRate: number; bitDepth: number } | null = null;
  while (off + 8 <= v.byteLength) {
    const id = readStr(v, off, 4);
    const size = v.getUint32(off + 4, true);
    const body = off + 8;
    if (id === "fmt ") {
      let format = v.getUint16(body, true);
      if (format === 0xfffe && size >= 26) format = v.getUint16(body + 24, true); // WAVE_FORMAT_EXTENSIBLE
      fmt = { format, channels: v.getUint16(body + 2, true), sampleRate: v.getUint32(body + 4, true), bitDepth: v.getUint16(body + 14, true) };
    } else if (id === "data") {
      if (!fmt) throw new Error("WAV data chunk before fmt chunk.");
      const bps = fmt.bitDepth / 8;
      const avail = Math.min(size, v.byteLength - body);
      const frames = Math.floor(avail / (bps * fmt.channels));
      const ch = Array.from({ length: fmt.channels }, () => new Float32Array(frames));
      let p = body;
      for (let i = 0; i < frames; i++) {
        for (let c = 0; c < fmt.channels; c++) {
          let s: number;
          if (fmt.format === 3 && fmt.bitDepth === 32) s = v.getFloat32(p, true);
          else if (fmt.bitDepth === 8) s = (v.getUint8(p) - 128) / 128;
          else if (fmt.bitDepth === 16) s = v.getInt16(p, true) / 0x8000;
          else if (fmt.bitDepth === 24) {
            let x = v.getUint8(p) | (v.getUint8(p + 1) << 8) | (v.getUint8(p + 2) << 16);
            if (x & 0x800000) x -= 0x1000000;
            s = x / 0x800000;
          } else if (fmt.bitDepth === 32) s = v.getInt32(p, true) / 0x80000000;
          else throw new Error(`Unsupported WAV bit depth: ${fmt.bitDepth}`);
          ch[c][i] = s;
          p += bps;
        }
      }
      return { sampleRate: fmt.sampleRate, bitDepth: fmt.bitDepth, channels: ch };
    }
    off = body + size + (size & 1);
  }
  throw new Error("WAV file has no data chunk.");
}

/** Size in bytes of a WAV with the given parameters. */
export function wavSize(frames: number, channels: number, bitDepth: WavBitDepth): number {
  return 44 + frames * channels * (bitDepth / 8);
}

function writeStr(v: DataView, o: number, s: string) {
  for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
}

function readStr(v: DataView, o: number, n: number): string {
  let s = "";
  for (let i = 0; i < n && o + i < v.byteLength; i++) s += String.fromCharCode(v.getUint8(o + i));
  return s;
}
