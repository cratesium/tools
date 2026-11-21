/**
 * Unified archive reader. ZIP uses zip.js, TAR/TGZ/GZ use the in-house parsers, and everything else
 * (7z, RAR 4/5, tar.bz2, tar.xz, CAB, ISO …) is delegated to libarchive.js (WebAssembly, in a worker).
 */

import { detectArchiveFormat, formatFromName, type ArchiveFormat } from "./detect";
import { looksLikeTar, parseTar } from "./tar";
import { gunzipMembers, gunzipOutputName } from "./gzip";
import { crc32 } from "./crc32";
import { loadZip, mapZipError, PasswordRequiredError, WrongPasswordError } from "./zipio";

export { PasswordRequiredError, WrongPasswordError };

export interface ArchiveItem {
  /** Normalised path: "/" separators, no leading "./" or "/". Directories end with "/". */
  path: string;
  size: number;
  compressedSize?: number;
  directory: boolean;
  encrypted?: boolean;
  /** Milliseconds since epoch. */
  mtime?: number;
  /** CRC-32 stored in the archive (ZIP, GZIP), when available. */
  crc32?: number;
  /** Extracts the entry. Verifies CRC/authentication where the format provides it. */
  read(): Promise<Uint8Array>;
}

export interface OpenedArchive {
  format: ArchiveFormat;
  items: ArchiveItem[];
  /** True if at least one entry is encrypted (null = unknown). */
  encrypted: boolean | null;
  /** Extra information shown to the user (e.g. integrity notes). */
  notes: string[];
  close(): Promise<void>;
}

/** Minimal surface of libarchive.js' Archive class that we use (injectable for tests/node). */
export interface LibarchiveArchive {
  open(file: File): Promise<LibarchiveReader>;
}
export interface LibarchiveReader {
  hasEncryptedData(): Promise<boolean | null>;
  usePassword(pw: string): Promise<void>;
  getFilesArray(): Promise<{ file: { name: string; size: number; lastModified: number; extract(): Promise<File> }; path: string }[]>;
  extractFiles(cb?: (e: { file: File; path: string }) => void): Promise<unknown>;
  close(): Promise<void>;
}

export interface OpenOptions {
  password?: string;
  /** Provide the libarchive Archive class (browser: loadLibarchive()). */
  libarchive?: () => Promise<LibarchiveArchive>;
  /** Force a format instead of sniffing. */
  format?: ArchiveFormat;
}

export function normalisePath(p: string): string {
  return p.replace(/\\/g, "/").replace(/^(\.\/)+/, "").replace(/^\/+/, "");
}

async function head(file: Blob, n: number): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(0, n).arrayBuffer());
}

export async function sniffFormat(file: Blob & { name?: string }): Promise<ArchiveFormat | null> {
  const h = await head(file, 0x8006);
  return detectArchiveFormat(h) ?? (file.name ? formatFromName(file.name) : null);
}

export async function openArchive(file: File, opts: OpenOptions = {}): Promise<OpenedArchive> {
  const fmt = opts.format ?? (await sniffFormat(file));
  if (!fmt) throw new Error("Unrecognised archive format. Supported: ZIP, TAR, GZIP/TGZ, 7Z, RAR, TAR.BZ2, TAR.XZ.");
  switch (fmt) {
    case "zip":
      return openZip(file, opts.password);
    case "tar":
      return openTarBytes(new Uint8Array(await file.arrayBuffer()), "tar");
    case "gzip":
    case "tgz":
      return openGzip(file);
    default:
      if (!opts.libarchive) throw new Error(`${fmt.toUpperCase()} archives need the libarchive engine, which is not available here.`);
      return openWithLibarchive(file, fmt, await opts.libarchive(), opts.password);
  }
}

async function openZip(file: Blob, password?: string): Promise<OpenedArchive> {
  const zip = await loadZip();
  const reader = new zip.ZipReader(new zip.BlobReader(file));
  let entries;
  try {
    entries = await reader.getEntries();
  } catch (e) {
    throw mapZipError(e, zip);
  }
  const items: ArchiveItem[] = entries.map((e) => ({
    path: normalisePath(e.filename),
    size: e.uncompressedSize,
    compressedSize: e.compressedSize,
    directory: e.directory,
    encrypted: e.encrypted,
    mtime: e.lastModDate?.getTime(),
    crc32: e.encrypted && !e.zipCrypto ? undefined : e.signature,
    read: async () => {
      if (e.directory) return new Uint8Array(0);
      if (e.encrypted && !password) throw new PasswordRequiredError();
      try {
        return await e.getData!(new zip.Uint8ArrayWriter(), { password: password || undefined, checkSignature: true });
      } catch (err) {
        throw mapZipError(err, zip);
      }
    },
  }));
  return {
    format: "zip",
    items,
    encrypted: entries.some((e) => e.encrypted),
    notes: [],
    close: async () => {
      await reader.close();
    },
  };
}

export function openTarBytes(bytes: Uint8Array, format: ArchiveFormat): OpenedArchive {
  const entries = parseTar(bytes);
  const bad = entries.filter((e) => !e.checksumOk).length;
  return {
    format,
    items: entries
      .filter((e) => e.type === "file" || e.type === "directory")
      .map((e) => ({
        path: normalisePath(e.type === "directory" && !e.name.endsWith("/") ? `${e.name}/` : e.name),
        size: e.size,
        directory: e.type === "directory",
        mtime: e.mtime || undefined,
        read: async () => {
          if (!e.checksumOk) throw new Error("TAR header checksum mismatch: entry may be corrupt.");
          return e.data;
        },
      })),
    encrypted: false,
    notes: bad ? [`${bad} TAR header(s) failed checksum verification.`] : [],
    close: async () => {},
  };
}

async function openGzip(file: File): Promise<OpenedArchive> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const members = gunzipMembers(bytes);
  if (!members.length) throw new Error("Empty GZIP file.");
  const crcOk = members.every((m) => m.crcOk && m.sizeOk);
  const total = members.reduce((s, m) => s + m.data.length, 0);
  const data = members.length === 1 ? members[0].data : concat(members.map((m) => m.data));
  if (looksLikeTar(data)) {
    const tar = openTarBytes(data, "tgz");
    if (!crcOk) {
      tar.notes.push("GZIP CRC-32 check failed: the archive is corrupt; extracted data may be wrong.");
      tar.items = tar.items.map((it) => ({ ...it, read: async () => Promise.reject(new Error("GZIP CRC-32 mismatch: archive is corrupt.")) }));
    }
    return tar;
  }
  const header = members[0].header;
  return {
    format: "gzip",
    items: [
      {
        path: gunzipOutputName(file.name, header),
        size: total,
        compressedSize: file.size,
        directory: false,
        mtime: header.mtime ?? undefined,
        crc32: members.length === 1 ? members[0].storedCrc : crc32(data),
        read: async () => {
          if (!crcOk) throw new Error("GZIP CRC-32 mismatch: the file is corrupt or truncated.");
          return data;
        },
      },
    ],
    encrypted: false,
    notes: members.length > 1 ? [`Multi-member GZIP: ${members.length} members concatenated.`] : [],
    close: async () => {},
  };
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function libarchiveError(e: unknown, fmt: ArchiveFormat): Error {
  const msg = e instanceof Error ? e.message : String(e);
  if (/passphrase|password|encrypt/i.test(msg)) return new WrongPasswordError(`Decryption failed: ${msg}. Check the password.`);
  if (/unrecognized archive format/i.test(msg) && (fmt === "bzip2" || fmt === "xz"))
    return new Error(
      `This ${fmt === "bzip2" ? ".bz2" : ".xz"} file is a single compressed file, not a TAR archive. Only .tar.${fmt === "bzip2" ? "bz2" : "xz"} archives can be extracted here.`,
    );
  return new Error(msg || "The archive could not be read.");
}

async function openWithLibarchive(file: File, fmt: ArchiveFormat, Archive: LibarchiveArchive, password?: string): Promise<OpenedArchive> {
  let reader: LibarchiveReader;
  try {
    reader = await Archive.open(file);
  } catch (e) {
    throw libarchiveError(e, fmt);
  }
  let encrypted: boolean | null = null;
  try {
    encrypted = await reader.hasEncryptedData();
  } catch {
    encrypted = null;
  }
  if (password) await reader.usePassword(password);
  let list;
  try {
    list = await reader.getFilesArray();
  } catch (e) {
    await reader.close().catch(() => {});
    const err = libarchiveError(e, fmt);
    if (encrypted && !password) throw new PasswordRequiredError();
    throw err;
  }
  if (encrypted && !password) {
    await reader.close().catch(() => {});
    throw new PasswordRequiredError();
  }
  const items: ArchiveItem[] = list.map(({ file: cf, path }) => ({
    path: normalisePath(`${path}${cf.name}`),
    size: cf.size,
    directory: false,
    encrypted: encrypted ?? undefined,
    // libarchive.js exposes archive_entry_mtime_nsec (only the sub-second part) as lastModified,
    // so it is not a usable timestamp. Leave mtime unknown rather than show a wrong date.
    mtime: undefined,
    read: async () => {
      try {
        return new Uint8Array(await (await cf.extract()).arrayBuffer());
      } catch (e) {
        throw libarchiveError(e, fmt);
      }
    },
  }));
  return {
    format: fmt,
    items,
    encrypted,
    notes: [],
    close: async () => {
      await reader.close().catch(() => {});
    },
  };
}

/** Builds a nested tree from flat archive paths (implicit parent folders are created). */
export interface TreeNode {
  name: string;
  path: string;
  directory: boolean;
  size: number;
  item?: ArchiveItem;
  children: TreeNode[];
}

export function buildTree<T extends { path: string; directory: boolean; size: number }>(
  items: T[],
): TreeNode & { children: TreeNode[] } {
  const root: TreeNode = { name: "", path: "", directory: true, size: 0, children: [] };
  const dirs = new Map<string, TreeNode>([["", root]]);
  const ensureDir = (path: string): TreeNode => {
    const key = path.replace(/\/$/, "");
    const existing = dirs.get(key);
    if (existing) return existing;
    const idx = key.lastIndexOf("/");
    const parent = ensureDir(idx >= 0 ? key.slice(0, idx) : "");
    const node: TreeNode = { name: key.slice(idx + 1), path: `${key}/`, directory: true, size: 0, children: [] };
    parent.children.push(node);
    dirs.set(key, node);
    return node;
  };
  for (const it of items) {
    if (it.directory) {
      const n = ensureDir(it.path);
      n.item = it as unknown as ArchiveItem;
      continue;
    }
    const idx = it.path.lastIndexOf("/");
    const parent = ensureDir(idx >= 0 ? it.path.slice(0, idx) : "");
    parent.children.push({ name: it.path.slice(idx + 1), path: it.path, directory: false, size: it.size, item: it as unknown as ArchiveItem, children: [] });
  }
  const finalise = (n: TreeNode): number => {
    if (!n.directory) return n.size;
    n.children.sort((a, b) => (a.directory === b.directory ? a.name.localeCompare(b.name) : a.directory ? -1 : 1));
    n.size = n.children.reduce((s, c) => s + finalise(c), 0);
    return n.size;
  };
  finalise(root);
  return root;
}

/** Rejects archive paths that would escape the extraction root ("zip slip"). */
export function isSafePath(path: string): boolean {
  const p = normalisePath(path);
  return !p.split("/").some((seg) => seg === "..") && !/^[a-zA-Z]:/.test(p);
}
