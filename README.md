# UtilityHub

UtilityHub is a website with **304 free online tools** in 13 categories: PDF, image, video, audio, archive, text, developer, spreadsheet/data, security, QR/barcode, calculators, file management and web. It is a static-first Next.js site deployed on Cloudflare Pages. Almost every tool processes files **locally in the browser** with WebAssembly, Web Workers, Canvas, Web Audio and Web Crypto. A small set of web tools uses Cloudflare Pages Functions.

- Live status of every tool: [`docs/TOOL-STATUS.md`](docs/TOOL-STATUS.md). Currently **263 full, 26 partial, 15 API/server, 0 planned**.
- How to add or implement a tool: [`docs/ADDING-TOOLS.md`](docs/ADDING-TOOLS.md)
- Server-side endpoints: [`docs/FUNCTIONS.md`](docs/FUNCTIONS.md)

## Technology stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router) with `output: "export"` (fully static) |
| UI | React 19, TypeScript, Tailwind CSS v4, Geist font, lucide-react icons |
| Hosting | Cloudflare Pages (static `out/`), plus Cloudflare Pages Functions (`functions/`) only where a server is unavoidable |
| PDF | pdf-lib, @cantoo/pdf-lib (encryption), PDF.js, Tesseract.js (OCR), docx, mammoth, pptxgenjs |
| Images | Canvas API, exifr, heic2any, imagetracerjs, Transformers.js (background removal) |
| Video / audio | FFmpeg.wasm (single-thread core, self-hosted under `/vendor/ffmpeg`), Web Audio API, MediaRecorder, Speech Synthesis, Transformers.js Whisper |
| Archives | fflate, JSZip, zip.js (AES ZIP), libarchive.js (RAR / 7Z / TAR) |
| Data | SheetJS (xlsx), fast-xml-parser, js-yaml |
| Developer | Prettier (standalone), Terser, CSSO, sql-formatter, node-sql-parser, marked, turndown, DOMPurify, jsdiff |
| Security | Web Crypto API, hash-wasm |
| QR / barcode | qrcode, jsQR, JsBarcode, ZXing, BarcodeDetector API |
| Tests | Vitest (unit), Playwright (e2e: desktop and mobile) |

No Docker, no VPS, no database and no separate backend server.

## Getting started

Requirements: Node.js 22 or newer, npm.

```bash
npm install
npm run dev          # http://localhost:3000  (copies vendor assets first)
```

Pages Functions (web tools such as the header checker or WHOIS) do not run under `next dev`. Those tools show a clear notice locally. To run the full stack locally:

```bash
npm run build
npm run pages:dev    # wrangler pages dev out → http://localhost:8788
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Next.js dev server |
| `npm run build` | Static export to `out/` (all 304 tool pages, 13 category pages, sitemap, robots, search index) |
| `npm start` | Serve `out/` locally with Cloudflare-style clean URLs on :4173 |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Vitest unit tests (registry integrity, search, processors) |
| `npm run test:e2e` | Playwright against the built site (run `npm run build` first) |
| `npm run status` | Regenerate `docs/TOOL-STATUS.md` from the registry |
| `npm run pages:dev` | Run `out/` + `functions/` locally with Wrangler |
| `npm run pages:deploy` | Manual deploy with Wrangler (normally Git integration deploys) |

## Project structure

```
app/                     Routes (App Router)
  page.tsx               Homepage
  tools/page.tsx         All tools (search and category filter)
  tools/[slug]/page.tsx  One statically generated page per tool (304)
  category/[slug]/       One page per category (13)
  about, contact, privacy, terms
  sitemap.ts, robots.ts, search-index.json/route.ts (static)
components/
  layout/                Header, footer, breadcrumbs, theme toggle
  search/                ⌘K command palette, inline search, tools explorer
  tools/                 ToolRunner, shared tool building blocks, per-category UIs
    <category>/index.ts  processor id → component map (lazy-loaded per category)
  upload/                Dropzone and file list with validation
  ui/                    Buttons, fields, alerts, badges, icons
lib/
  tools/catalogue.ts     Canonical 304-entry list (id, name, slug, category)
  tools/categories.ts    13 categories
  tools/data/<cat>.ts    Registry entries (content, SEO, status) per category
  tools/registry.ts      Combines all entries; lookup, related, search index
  tools/search.ts        Ranked client-side search (pure)
  tools/metadata.ts      Per-tool metadata and JSON-LD
  processors/<cat>/      Pure processing logic (unit-tested)
  seo/, utils/
functions/               Cloudflare Pages Functions (/api/*, /s/:code)
public/_headers          Security and cache headers for Cloudflare Pages
scripts/                 copy-vendor (pdf.js worker, libarchive wasm), local static server
tests/                   Vitest unit tests;  tests/e2e = Playwright
types/tool.ts            ToolDefinition and related types
wrangler.jsonc           Cloudflare Pages config
```

## The tool registry

Every tool is one `ToolDefinition` object (see `types/tool.ts`) in `lib/tools/data/<category>.ts`:

- `id`, `name`, `slug` and `category` must match `lib/tools/catalogue.ts`; a test enforces this.
- `processor` is `<category>.<operation>`, and `processorOptions` lets sibling tools share a component (for example `image.convert` with `{ from: "jpg", to: "png" }`).
- SEO fields: `seoTitle`, `seoDescription`, `description`, `instructions` and `faqs` are unique per tool.
- `related` lists slugs for internal linking.
- `status` is `full | partial | api | planned`, with `statusNote` and `dependencies` explaining limitations and external services.

The registry drives the homepage, the `/tools` explorer, category pages, every tool page (`generateStaticParams`), the sitemap, the search index and related-tool links. Pages are never hard-coded per tool.

At runtime, `ToolRunner` lazily imports only the current category's component map (`components/tools/loaders.ts`), and each tool dynamically imports its heavy libraries when used. The homepage loads no processing libraries.

### Adding a tool

1. Add the row to `lib/tools/catalogue.ts` (next free id) and widen the category `range` in `lib/tools/categories.ts`.
2. Add a full `ToolDefinition` to `lib/tools/data/<category>.ts`.
3. Run `npm test`. The registry test checks uniqueness, content lengths, related links and processor registration.

### Adding a processor

1. Put pure logic in `lib/processors/<category>/<name>.ts` and unit-test it in `tests/`.
2. Build the UI in `components/tools/<category>/<name>.tsx` (`"use client"`, default export receiving `{ tool }`) from the shared blocks in `components/tools/shared.tsx`: `useTask` for real progress and errors, `FileResult` for preview and download, and `ActionBar` for run and reset.
3. Register it in `components/tools/<category>/index.ts` under the processor id.

Details and rules: [`docs/ADDING-TOOLS.md`](docs/ADDING-TOOLS.md).

## SEO

- Static HTML for every page; unique `<title>`, meta description, H1, canonical URL, Open Graph and Twitter tags per tool and category.
- JSON-LD: `WebApplication` + `BreadcrumbList` + `FAQPage` on tool pages, `CollectionPage`/`ItemList` on categories, `WebSite` + `SearchAction` on the homepage.
- `sitemap.xml` (planned tools are excluded and marked `noindex`), `robots.txt`, breadcrumbs, related-tool internal links and semantic headings.
- Guidelines for new content: write for the specific tool (formats, limits, privacy), keep titles ≤ 60–70 characters and descriptions 120–160 characters, and never duplicate copy between tools. No ranking is promised.

## Privacy model

- Tool state lives in React component state per tab. There is no global or shared storage, so visitors are isolated by construction (and covered by e2e tests).
- Object URLs are revoked on reset/unmount, and every tool has a Reset button.
- Files are never uploaded by browser-side tools. FFmpeg, pdf.js and libarchive are self-hosted from this site's `/vendor/` folder (copied from `node_modules` by `scripts/copy-vendor.mjs` at build time; the FFmpeg wasm is split into <25 MB parts to fit Cloudflare Pages' file limit). Only Tesseract language data and Transformers.js models (background removal, Whisper) are downloaded from a public CDN / the Hugging Face Hub on first use, and each tool lists this under "External dependencies".
- Pages Functions receive only URLs or domains (never files), validate them against SSRF, and store nothing except URL-shortener entries in KV.

## Deploying to Cloudflare Pages (via GitHub)

The repository is `github.com/cratesium/tools`, and the Next.js app sits at the repository root.

1. **Connect GitHub**: Cloudflare dashboard → *Workers & Pages* → *Create* → *Pages* → *Connect to Git* → choose `cratesium/tools`.
2. **Build settings**:
   - Framework preset: *None* (or *Next.js (Static HTML Export)*)
   - Build command: `npm run build`
   - Build output directory: `out`
   - Root directory: `/`
3. **Environment variables** (Settings → Variables and Secrets; set for Production and Preview):
   - `NODE_VERSION` = `22`
   - `NEXT_PUBLIC_SITE_URL` = `https://<your-domain>` (canonical URLs and sitemap)
   - Optional, for the Website Screenshot Tool: `CF_ACCOUNT_ID` and `CF_API_TOKEN` (as an **encrypted secret**; the token needs the *Browser Rendering – Edit* permission)
4. **Compatibility**: `wrangler.jsonc` sets `compatibility_date` and the `nodejs_compat` flag; Pages reads it automatically for Functions.
5. **Optional KV for the URL Shortener**: `npx wrangler kv namespace create SHORT_LINKS`, then either uncomment `kv_namespaces` in `wrangler.jsonc` with the id, or bind it in the dashboard (Settings → Bindings → KV namespace → variable name `SHORT_LINKS`).
6. **Deploy**: every push to `main` triggers a production build and deploy. Every push to another branch or PR gets a **preview deployment** at `https://<branch>.<project>.pages.dev`.
7. **Custom domain**: Pages project → *Custom domains* → *Set up a custom domain*. If the domain's DNS is on Cloudflare, records are created automatically; otherwise add the CNAME shown. Then update `NEXT_PUBLIC_SITE_URL` and redeploy.

Flow: `git push` → Cloudflare detects the commit → `npm run build` → `out/` and `functions/` deploy → production updates. GitHub Actions (`.github/workflows/ci.yml`) also runs typecheck, lint, unit, build and e2e on every push.

Manual deploy (optional): `npx wrangler login && npm run pages:deploy`.

## Environment variables

| Name | Where | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | build | Canonical base URL (default `https://utilityhub.pages.dev`) |
| `NODE_VERSION` | Cloudflare build | Use Node 22 |
| `CF_ACCOUNT_ID` | Functions | Browser Rendering screenshot API |
| `CF_API_TOKEN` (secret) | Functions | Browser Rendering screenshot API |
| `SHORT_LINKS` (KV binding) | Functions | URL Shortener storage |

See `.env.example`.

## Known limitations

See [`docs/TOOL-STATUS.md`](docs/TOOL-STATUS.md) for the per-tool list. In general:

- **Office conversions** (PDF↔Word/PowerPoint, Word/HTML→PDF) run in the browser and do not preserve complex layout. They are marked *Partial*.
- **Video/audio** processing uses single-threaded FFmpeg.wasm. It is slower than native, limited by browser memory (keep files under ~500 MB), and loads a ~31 MB self-hosted core on first use (cached afterwards). Video Reverse is limited to 60-second clips; burning subtitles into the picture and text rendering via drawtext are not available (text watermarks are rasterised in the browser instead).
- **AI features** (background removal, speech-to-text, OCR) download models or language data on first use and run on your device. Their speed depends on your hardware.
- **Web tools** that fetch other sites need the Cloudflare Functions. They do not work under plain `next dev`, and some sites block automated requests.
- **SSL Certificate Checker** reports Certificate Transparency data plus HTTPS reachability, not a raw TLS handshake (Workers cannot read peer certificates).
- **URL Shortener** and **Website Screenshot** need account configuration (KV namespace, Browser Rendering token) and report "not configured" until then.
- **Text to Speech** uses the browser's Web Speech voices: playback only, no audio download (browsers don't expose the audio). **Video thumbnails/screenshots** use the browser's decoder, so MKV/AVI must be converted to MP4 first.
- WebP encoding is unavailable in some Safari versions. The File System Access API (in-place renaming, writing folders) is Chromium-only, and other browsers fall back to ZIP downloads.
