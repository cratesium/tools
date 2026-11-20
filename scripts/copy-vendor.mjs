// Copies browser runtime assets (workers, wasm) from node_modules into public/vendor
// so they are served same-origin from Cloudflare Pages. Runs automatically before dev/build.
import { cpSync, mkdirSync, existsSync } from "node:fs";
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
console.log("[copy-vendor] done");
