import type { LibarchiveArchive } from "./reader";

/** Same-origin worker + wasm copied by scripts/copy-vendor.mjs. The wasm is resolved next to the worker. */
export const LIBARCHIVE_WORKER_URL = "/vendor/libarchive/worker-bundle.js";

/**
 * Loads libarchive.js in the browser. Each Archive.open() spawns a module worker which downloads
 * the ~1 MB WebAssembly build on first use.
 */
export async function loadLibarchive(): Promise<LibarchiveArchive> {
  if (typeof Worker === "undefined") throw new Error("Web Workers are required to read this archive format.");
  const mod = await import("libarchive.js");
  mod.Archive.init({
    getWorker: () => new Worker(LIBARCHIVE_WORKER_URL, { type: "module" }),
  });
  return mod.Archive as unknown as LibarchiveArchive;
}

export type LibarchiveTarget = "7z" | "tar.bz2" | "tar.xz";

/** Minimal surface of Archive.write (injectable for tests). */
export interface LibarchiveWriter {
  write(opts: { files: { file: Blob; pathname: string }[]; outputFileName: string; compression: string; format: string; passphrase: string | null }): Promise<File>;
}

const TARGETS: Record<LibarchiveTarget, { format: string; compression: string }> = {
  "7z": { format: "7zip", compression: "lzma" },
  "tar.bz2": { format: "ustar", compression: "bzip2" },
  "tar.xz": { format: "ustar", compression: "xz" },
};

/** Writes .7z / .tar.bz2 / .tar.xz with libarchive (formats zip.js and fflate cannot produce). */
export async function writeWithLibarchive(
  writer: LibarchiveWriter,
  files: { file: Blob; pathname: string }[],
  target: LibarchiveTarget,
  outputFileName: string,
): Promise<File> {
  const t = TARGETS[target];
  return writer.write({ files, outputFileName, compression: t.compression, format: t.format, passphrase: null });
}

export async function loadLibarchiveWriter(): Promise<LibarchiveWriter> {
  return (await loadLibarchive()) as unknown as LibarchiveWriter;
}
