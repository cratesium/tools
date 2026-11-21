/**
 * ZIP reading/writing on top of @zip.js/zip.js (streaming, ZIP64, AES-256 and ZipCrypto).
 * The library is imported lazily so that it only loads when a ZIP is actually processed.
 */

export class PasswordRequiredError extends Error {
  constructor(message = "This archive is encrypted. Enter its password.") {
    super(message);
    this.name = "PasswordRequiredError";
  }
}

export class WrongPasswordError extends Error {
  constructor(message = "The password is incorrect.") {
    super(message);
    this.name = "WrongPasswordError";
  }
}

type ZipModule = typeof import("@zip.js/zip.js");

let configured = false;
export async function loadZip(): Promise<ZipModule> {
  const zip = await import("@zip.js/zip.js");
  if (!configured) {
    // Run codecs on the calling thread: avoids spawning blob-URL workers (CSP-friendly) and
    // native CompressionStream is used for DEFLATE when the browser provides it.
    zip.configure({ useWebWorkers: false });
    configured = true;
  }
  return zip;
}

export function mapZipError(e: unknown, zip?: ZipModule): Error {
  const msg = e instanceof Error ? e.message : String(e);
  if (zip) {
    // Constant names differ between zip.js releases, so read them defensively.
    const E = zip as unknown as Record<string, string | undefined>;
    const is = (...names: string[]) => names.some((n) => E[n] !== undefined && msg === E[n]);
    if (is("ERR_INVALID_PASSWORD")) return new WrongPasswordError();
    if (is("ERR_ENCRYPTED")) return new PasswordRequiredError();
    if (is("ERR_INVALID_CRC", "ERR_INVALID_CRC32", "ERR_INVALID_SIGNATURE")) return new Error("CRC-32 mismatch: the entry data is corrupt.");
    if (is("ERR_INVALID_AUTHENTICATION_CODE")) return new Error("AES authentication failed: the entry was modified or is corrupt.");
    if (is("ERR_INVALID_UNCOMPRESSED_SIZE", "ERR_INVALID_COMPRESSED_DATA")) return new Error("The entry's compressed data is corrupt or truncated.");
    if (is("ERR_UNSUPPORTED_COMPRESSION")) return new Error("This entry uses a compression method that is not supported (e.g. Deflate64, LZMA or PPMd inside ZIP).");
    if (is("ERR_EOCDR_NOT_FOUND", "ERR_BAD_FORMAT", "ERR_CENTRAL_DIRECTORY_NOT_FOUND")) return new Error("This is not a valid ZIP file (or it is truncated).");
  }
  if (/invalid password/i.test(msg)) return new WrongPasswordError();
  if (/encrypted/i.test(msg)) return new PasswordRequiredError();
  return e instanceof Error ? e : new Error(msg);
}

export interface ZipInputFile {
  /** Path inside the archive, using "/" separators. Directories end with "/". */
  path: string;
  data?: Blob | Uint8Array;
  lastModified?: number;
}

export interface CreateZipOptions {
  /** 0 (store) to 9 (max). */
  level?: number;
  password?: string;
  /** "aes256" (default when a password is set) or legacy "zipcrypto" (weak, widest compatibility). */
  encryption?: "aes256" | "zipcrypto";
  comment?: string;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

/** Creates a ZIP archive. Progress is reported per byte of input processed. */
export async function createZip(files: ZipInputFile[], opts: CreateZipOptions = {}): Promise<Blob> {
  const zip = await loadZip();
  const writer = new zip.ZipWriter(new zip.BlobWriter("application/zip"), {
    level: opts.level ?? 6,
    password: opts.password || undefined,
    encryptionStrength: opts.password && opts.encryption !== "zipcrypto" ? 3 : undefined,
    zipCrypto: opts.password ? opts.encryption === "zipcrypto" : undefined,
    signal: opts.signal,
  });
  const total = files.reduce((s, f) => s + (f.data ? sizeOf(f.data) : 0), 0) || 1;
  let done = 0;
  for (const f of files) {
    if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const isDir = f.path.endsWith("/");
    const lastModDate = f.lastModified ? new Date(f.lastModified) : undefined;
    if (isDir) {
      await writer.add(f.path, undefined, { directory: true, lastModDate });
      continue;
    }
    const data = f.data ?? new Uint8Array(0);
    const reader = data instanceof Uint8Array ? new zip.Uint8ArrayReader(data) : new zip.BlobReader(data);
    const size = sizeOf(data);
    const base = done;
    await writer.add(f.path, reader, {
      lastModDate,
      onprogress: async (p: number) => {
        opts.onProgress?.(Math.min(1, (base + p) / total));
        return undefined;
      },
    });
    done += size;
    opts.onProgress?.(Math.min(1, done / total));
  }
  return writer.close(opts.comment ? new TextEncoder().encode(opts.comment) : undefined);
}

function sizeOf(d: Blob | Uint8Array): number {
  return d instanceof Uint8Array ? d.byteLength : d.size;
}
