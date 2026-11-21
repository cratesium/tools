import { looksLikeTar } from "./tar";

export type ArchiveFormat = "zip" | "gzip" | "tgz" | "bzip2" | "xz" | "7z" | "rar" | "tar" | "zstd" | "lz4" | "cab" | "iso";

export const ARCHIVE_LABEL: Record<ArchiveFormat, string> = {
  zip: "ZIP",
  gzip: "GZIP",
  tgz: "TAR.GZ",
  bzip2: "BZIP2",
  xz: "XZ",
  "7z": "7-Zip",
  rar: "RAR",
  tar: "TAR",
  zstd: "Zstandard",
  lz4: "LZ4",
  cab: "Microsoft CAB",
  iso: "ISO 9660",
};

function startsWith(b: Uint8Array, sig: number[], offset = 0): boolean {
  if (b.length < offset + sig.length) return false;
  for (let i = 0; i < sig.length; i++) if (b[offset + i] !== sig[i]) return false;
  return true;
}

/**
 * Detects an archive/compression format from its first bytes (magic numbers).
 * Pass at least the first 512 bytes; for ISO detection pass 32 KiB + 6.
 * Note: "gzip" is returned for any gzip stream; use `isTarGz` on the decompressed head to refine.
 */
export function detectArchiveFormat(b: Uint8Array): ArchiveFormat | null {
  if (startsWith(b, [0x50, 0x4b, 0x03, 0x04]) || startsWith(b, [0x50, 0x4b, 0x05, 0x06]) || startsWith(b, [0x50, 0x4b, 0x07, 0x08]))
    return "zip";
  if (startsWith(b, [0x1f, 0x8b])) return "gzip";
  if (startsWith(b, [0x42, 0x5a, 0x68])) return "bzip2";
  if (startsWith(b, [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00])) return "xz";
  if (startsWith(b, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])) return "7z";
  if (startsWith(b, [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07])) return "rar";
  if (startsWith(b, [0x28, 0xb5, 0x2f, 0xfd])) return "zstd";
  if (startsWith(b, [0x04, 0x22, 0x4d, 0x18])) return "lz4";
  if (startsWith(b, [0x4d, 0x53, 0x43, 0x46])) return "cab";
  if (looksLikeTar(b)) return "tar";
  if (b.length >= 0x8006 && startsWith(b, [0x43, 0x44, 0x30, 0x30, 0x31], 0x8001)) return "iso";
  return null;
}

/** RAR version from the signature: 4 (RAR 1.5–4.x) or 5. */
export function rarVersion(b: Uint8Array): 4 | 5 | null {
  if (startsWith(b, [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00])) return 5;
  if (startsWith(b, [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00])) return 4;
  return null;
}

/** Guess from file name when magic bytes are inconclusive. */
export function formatFromName(name: string): ArchiveFormat | null {
  const n = name.toLowerCase();
  if (n.endsWith(".tar.gz") || n.endsWith(".tgz")) return "tgz";
  if (n.endsWith(".zip") || n.endsWith(".jar") || n.endsWith(".apk")) return "zip";
  if (n.endsWith(".gz")) return "gzip";
  if (n.endsWith(".bz2") || n.endsWith(".tbz2") || n.endsWith(".tbz")) return "bzip2";
  if (n.endsWith(".xz") || n.endsWith(".txz")) return "xz";
  if (n.endsWith(".7z")) return "7z";
  if (n.endsWith(".rar")) return "rar";
  if (n.endsWith(".tar")) return "tar";
  if (n.endsWith(".zst")) return "zstd";
  return null;
}
