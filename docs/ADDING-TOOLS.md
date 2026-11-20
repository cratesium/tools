# Adding and implementing tools

UtilityHub registers every tool in one registry, generates every page from it, and renders each tool's UI through a lazily loaded component per category.

## Files per category `<cat>`

| Purpose | Path |
| --- | --- |
| Registry entries (content + SEO + status) | `lib/tools/data/<cat>.ts` (exports `<cat>Tools: ToolDefinition[]`) |
| Pure processing logic (testable, no React) | `lib/processors/<cat>/*.ts` |
| UI components (client) | `components/tools/<cat>/*.tsx` |
| Processor id → component map | `components/tools/<cat>/index.ts` |
| Unit tests | `tests/<cat>*.test.ts` |
| Web Workers (if needed) | `workers/<cat>/*.ts` (or co-located `*.worker.ts`) |

The canonical id/name/slug/category list lives in `lib/tools/catalogue.ts`; `tests/registry.test.ts` fails if a data file deviates from it.

## Registry entry rules (`types/tool.ts`)

- `id`, `name`, `slug` and `category` must match `lib/tools/catalogue.ts` exactly.
- `processor`: `"<cat>.<operation>"`, e.g. `"image.convert"`. Several tools may share one processor component and differ through `processorOptions` (e.g. `{ from: "jpg", to: "png" }`).
- Content must be **unique and tool-specific**: `shortDescription` (>40 chars), `description` (2–4 sentences, >120 chars), `seoTitle` (≤70 chars, unique, usually ends with `| UtilityHub`), `seoDescription` (90–175 chars, unique), 3–6 `instructions`, 3–5 `faqs` that answer real questions about *this* tool (limits, formats, privacy, quality).
- `related`: 3–6 existing slugs, not including the tool itself.
- `status`:
  - `full`: works end to end, no caveats.
  - `partial`: works, with documented limitations. `statusNote` is required and must explain them honestly (e.g. "Text and basic formatting only; complex layouts, images and tables are not preserved.").
  - `api`: needs a Cloudflare Pages Function, binding or third-party service. `statusNote` and `dependencies` are required.
  - `planned`: not implemented. Use only when it genuinely cannot be built.
- `dependencies`: list runtime downloads or external services (e.g. `"FFmpeg.wasm core (loaded from unpkg.com)"`, `"Tesseract.js language data (jsDelivr)"`).
- Optionally set `keywords`, `popular` (≈1–2 per category), `featured` (≈0–1 per category) and `addedAt: "2026-11-21"`.

## UI component rules

- File starts with `"use client"`. Default export: `function X({ tool }: ToolComponentProps)`.
- Compose from `components/tools/shared.tsx` (`Panel`, `Settings`, `ActionBar`, `TaskProgress`, `ErrorMessage`, `TextOutput`, `FileResult`, `FileResults`, `DownloadButton`, `CopyButton`, `KeyValueTable`, `DataTable`, `UnsupportedNotice`), `components/ui/field.tsx` (`Field`, `Input`, `Textarea`, `Select`, `Checkbox`, `Slider`, `Segmented`), `components/ui/feedback.tsx` (`Alert`, `Stat`, `Progress`, `Badge`) and `components/upload/dropzone.tsx` (`Dropzone`, `FileList`).
- Use `useTask()` from `lib/utils/hooks.ts` for async work. Report **real** progress only (`ctx.progress(fraction)`), or pass `null` for indeterminate. Never animate fake progress.
- Use `useObjectUrl()` or `FileResult` so object URLs are revoked. Every tool needs a **Reset** (`ActionBar onReset`) that clears inputs, results and errors.
- Validate input and show errors through `ErrorMessage`. Never let exceptions escape.
- **Import heavy libraries dynamically inside handlers**: `const { PDFDocument } = await import("pdf-lib")`. Never import pdf-lib, pdfjs, ffmpeg, xlsx, tesseract, prettier, etc. at module top level. Category index files must stay light.
- Feature-detect browser APIs with `useSupport()` and show `UnsupportedNotice` when they are missing.
- Keep state inside the component. No module-level mutable state holding user data.
- Test hooks for e2e: the shared components already set `data-testid` on `run`, `reset`, `download`, `output`, `error`, `file-input`. Use `data-testid="input"` on the main text input.
- Styling: Tailwind with the design tokens (`bg-card`, `border-border`, `text-fg`, `text-fg-muted`, `text-fg-subtle`, `bg-bg-muted`, `bg-bg-subtle`, `bg-accent text-accent-fg`). Neutral palette only: no purple, no gradients, no neon.

## Reference implementation

See the Word Counter: `lib/tools/data/text.ts` (id 139), `lib/processors/text/counters.ts`, `components/tools/text/word-counter.tsx`, `components/tools/text/index.ts` and `tests/text-counters.test.ts`.

## Vendor assets

`scripts/copy-vendor.mjs` copies same-origin runtime assets into `public/vendor/` before dev/build:
- PDF.js worker: `/vendor/pdfjs/pdf.worker.min.mjs` (cMaps under `/vendor/pdfjs/cmaps/`, fonts under `/vendor/pdfjs/standard_fonts/`).
- libarchive.js: `/vendor/libarchive/worker-bundle.js` and `/vendor/libarchive/libarchive.wasm`.

Cloudflare Pages has a 25 MiB per-file limit, so FFmpeg core (~31 MB wasm) is loaded from a CDN at runtime.
