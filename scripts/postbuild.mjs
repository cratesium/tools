// Runs after `next build`. Cloudflare Pages rejects any file over 25 MiB.
//
// Turbopack emits onnxruntime-web's wasm binaries (via `new URL(..., import.meta.url)` inside
// @huggingface/transformers) into out/_next/static/media. They are never fetched at runtime:
// transformers.js sets `env.backends.onnx.wasm.wasmPaths` to jsDelivr's onnxruntime-web build,
// the same way models are fetched from the Hugging Face Hub. So oversized ORT wasm files are
// deleted here; any other oversized file fails the build so it gets handled explicitly.
import { readdirSync, statSync, rmSync } from "node:fs";
import { join, relative } from "node:path";

const OUT = join(process.cwd(), "out");
const LIMIT = 25 * 1024 * 1024;
const removable = /^ort-wasm.*\.wasm$/;

const tooBig = [];
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (statSync(p).size > LIMIT) {
      if (removable.test(entry.name)) {
        rmSync(p);
        console.log(`[postbuild] removed ${relative(OUT, p)} (loaded from CDN at runtime)`);
      } else tooBig.push(relative(OUT, p));
    }
  }
}

walk(OUT);
if (tooBig.length) {
  console.error(`[postbuild] files over Cloudflare Pages' 25 MiB limit:\n  ${tooBig.join("\n  ")}`);
  process.exit(1);
}
console.log("[postbuild] done");
