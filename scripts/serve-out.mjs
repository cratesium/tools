// Minimal static server for the `out/` directory that mimics Cloudflare Pages
// clean URLs (/tools/foo → /tools/foo.html). Used by Playwright e2e tests and `npm start`.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const root = join(process.cwd(), "out");
const port = Number(process.env.PORT || 4173);
const types = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon",
  ".xml": "application/xml", ".txt": "text/plain", ".wasm": "application/wasm", ".woff2": "font/woff2",
  ".bcmap": "application/octet-stream", ".pfb": "application/octet-stream", ".ttf": "font/ttf",
};

async function resolve(pathname) {
  const clean = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  const candidates = [clean, `${clean}.html`, join(clean, "index.html")];
  for (const c of candidates) {
    const p = join(root, c);
    if (!p.startsWith(root)) continue;
    try {
      if ((await stat(p)).isFile()) return p;
    } catch {}
  }
  return null;
}

createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const file = await resolve(url.pathname);
  if (!file) {
    const nf = await readFile(join(root, "404.html")).catch(() => "Not found");
    res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
    return res.end(nf);
  }
  res.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream" });
  res.end(await readFile(file));
}).listen(port, () => console.log(`Serving out/ on http://localhost:${port}`));
