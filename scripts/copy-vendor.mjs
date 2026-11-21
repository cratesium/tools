// Copies browser runtime assets (workers, wasm) from node_modules into public/vendor
// so they are served same-origin from Cloudflare Pages. Runs automatically before dev/build.
import { cpSync, mkdirSync, existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";

const root = process.cwd();
const assets = [
  ["node_modules/pdfjs-dist/build/pdf.worker.min.mjs", "public/vendor/pdfjs/pdf.worker.min.mjs"],
  ["node_modules/pdfjs-dist/cmaps", "public/vendor/pdfjs/cmaps"],
  ["node_modules/pdfjs-dist/standard_fonts", "public/vendor/pdfjs/standard_fonts"],
  ["node_modules/libarchive.js/dist/worker-bundle.js", "public/vendor/libarchive/worker-bundle.js"],
  ["node_modules/libarchive.js/dist/libarchive.wasm", "public/vendor/libarchive/libarchive.wasm"],
];

for (const [from, to] of assets) {
  const src = join(root, from);
  if (!existsSync(src)) {
    console.warn(`[copy-vendor] missing ${from} (skipped)`);
    continue;
  }
  mkdirSync(dirname(join(root, to)), { recursive: true });
  cpSync(src, join(root, to), { recursive: true });
}
// FFmpeg.wasm core, self-hosted. Cloudflare Pages limits files to 25 MiB and the wasm is ~31 MB,
// so it is split into 20 MB parts plus a manifest; the browser fetches and joins them.
const coreDir = join(root, "node_modules/@ffmpeg/core/dist/esm");
const outDir = join(root, "public/vendor/ffmpeg");
if (existsSync(join(coreDir, "ffmpeg-core.wasm"))) {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  cpSync(join(coreDir, "ffmpeg-core.js"), join(outDir, "ffmpeg-core.js"));
  const wasm = readFileSync(join(coreDir, "ffmpeg-core.wasm"));
  const PART = 20 * 1024 * 1024;
  const parts = [];
  for (let i = 0, n = 0; i < wasm.length; i += PART, n++) {
    const name = `ffmpeg-core.wasm.part${n}`;
    writeFileSync(join(outDir, name), wasm.subarray(i, i + PART));
    parts.push(name);
  }
  const version = JSON.parse(readFileSync(join(root, "node_modules/@ffmpeg/core/package.json"), "utf8")).version;
  writeFileSync(join(outDir, "manifest.json"), JSON.stringify({ version, size: wasm.length, parts }, null, 2));
  // @ffmpeg/ffmpeg's ESM classes + worker, loaded at runtime (not bundled) so its module worker
  // and dynamic core import run natively from this origin.
  cpSync(join(root, "node_modules/@ffmpeg/ffmpeg/dist/esm"), join(outDir, "lib"), { recursive: true, filter: (f) => !f.endsWith(".d.ts") && !f.endsWith(".map") });
} else {
  console.warn("[copy-vendor] @ffmpeg/core not installed (skipped)");
}
console.log("[copy-vendor] done");
