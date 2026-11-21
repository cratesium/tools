"use client";

import { useEffect, useMemo, useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox, Field, Slider, Textarea } from "@/components/ui/field";
import { Alert, Badge } from "@/components/ui/feedback";
import { ActionBar, DownloadButton, ErrorMessage, Panel } from "@/components/tools/shared";
import { Dropzone, FileList } from "@/components/upload/dropzone";
import { computeLogoBox, MAX_LOGO_AREA } from "@/lib/processors/qr/logo";
import { canvasToBlob, decodeQrImageData, drawScaled, loadImage, renderQrSvg, renderQrToCanvas } from "@/lib/processors/qr/render";
import { errorMessage, useDebounced, useObjectUrl } from "@/lib/utils/hooks";
import { defaultQrStyle, isHexColor, QrStyleSettings, type QrStyle } from "./qr-options";

/** Minimum QR versions tried in order until the logo version verifies. Small versions have too few codewords to absorb a logo. */
const VERSION_LADDER = [5, 7, 10, 14];

interface Result {
  png: Blob;
  svg: Blob;
  verified: boolean;
  modules: number;
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Could not read the logo file."));
    r.readAsDataURL(file);
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + s, y, x + s, y + s, r);
  ctx.arcTo(x + s, y + s, x, y + s, r);
  ctx.arcTo(x, y + s, x, y, r);
  ctx.arcTo(x, y, x + s, y, r);
  ctx.closePath();
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

export default function QrLogo({ tool }: ToolComponentProps) {
  void tool;
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [area, setArea] = useState(12);
  const [pad, setPad] = useState(true);
  const [style, setStyle] = useState<QrStyle>({ ...defaultQrStyle, ecc: "H", margin: 4 });
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [doneFor, setDoneFor] = useState<unknown>(null);

  const opts = useMemo(() => ({ text, file, area, pad, style }), [text, file, area, pad, style]);
  const debounced = useDebounced(opts, 200);
  const renderable = !!debounced.text && !!debounced.file && isHexColor(debounced.style.foreground) && isHexColor(debounced.style.background);
  const current = renderable && !!text && !!file;
  const shown = current ? result : null;
  const shownError = current ? error : null;
  const busy = renderable && doneFor !== debounced;
  const previewUrl = useObjectUrl(shown?.png);

  useEffect(() => {
    let alive = true;
    if (!renderable) return;
    const { text: t, file: f, area: a, pad: p, style: s } = debounced;
    if (!f) return;
    (async () => {
      const logo = await loadImage(f);
      try {
        const dataUrl = await readAsDataUrl(f);
        const frac = Math.min(a / 100, MAX_LOGO_AREA);
        const render = { ...s, ecc: "H" as const };
        let best: Result | null = null;
        const seen = new Set<number>();
        for (const minVersion of VERSION_LADDER) {
          const canvas = document.createElement("canvas");
          const modules = await renderQrToCanvas(canvas, t, { ...render, minVersion });
          if (seen.has(modules)) continue;
          seen.add(modules);
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (!ctx) throw new Error("Canvas is not available.");
          const box = computeLogoBox(canvas.width, modules, s.margin, frac, logo.width, logo.height, p ? 0.1 : 0);
          if (p) {
            ctx.fillStyle = s.background;
            roundRect(ctx, box.pad.x, box.pad.y, box.pad.size, box.pad.size * 0.12);
            ctx.fill();
          }
          ctx.drawImage(logo.source, box.image.x, box.image.y, box.image.w, box.image.h);

          // Verify at full resolution and at a phone-camera-like 400 px.
          const full = await decodeQrImageData(ctx.getImageData(0, 0, canvas.width, canvas.height));
          const small = drawScaled(canvas, canvas.width, canvas.height, 400);
          const smallDecoded = await decodeQrImageData(small.getContext("2d")!.getImageData(0, 0, small.width, small.height));
          const verified = full === t && smallDecoded === t;

          const svgText = await renderQrSvg(t, { ...render, minVersion });
          const units = modules + 2 * s.margin;
          const vb = computeLogoBox(units, modules, s.margin, frac, logo.width, logo.height, p ? 0.1 : 0);
          const overlay =
            (p
              ? `<rect x="${vb.pad.x}" y="${vb.pad.y}" width="${vb.pad.size}" height="${vb.pad.size}" rx="${vb.pad.size * 0.12}" fill="${escapeAttr(s.background)}"/>`
              : "") +
            `<image x="${vb.image.x}" y="${vb.image.y}" width="${vb.image.w}" height="${vb.image.h}" preserveAspectRatio="xMidYMid meet" href="${escapeAttr(dataUrl)}"/>`;
          const svg = svgText.replace(/<\/svg>\s*$/, `${overlay}</svg>`);

          best = { png: await canvasToBlob(canvas), svg: new Blob([svg], { type: "image/svg+xml" }), verified, modules };
          if (verified) break;
        }
        if (!alive) return;
        setResult(best);
        setError(null);
      } catch (e) {
        if (!alive) return;
        setResult(null);
        setError(errorMessage(e));
      } finally {
        logo.close();
        if (alive) setDoneFor(debounced);
      }
    })().catch((e) => {
      if (!alive) return;
      setResult(null);
      setError(errorMessage(e));
      setDoneFor(debounced);
    });
    return () => {
      alive = false;
    };
  }, [renderable, debounced]);

  const reset = () => {
    setText("");
    setFile(null);
    setArea(12);
    setPad(true);
    setStyle({ ...defaultQrStyle, ecc: "H", margin: 4 });
    setResult(null);
    setError(null);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <Panel title="Content">
            <Field label="Text or URL to encode">
              {(id) => (
                <Textarea
                  id={id}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="https://example.com"
                  data-testid="input"
                  className="min-h-[90px]"
                />
              )}
            </Field>
          </Panel>
          <Panel title="Logo">
            <div className="space-y-4">
              {file ? (
                <FileList files={[file]} onRemove={() => setFile(null)} />
              ) : (
                <Dropzone
                  onFiles={(f) => setFile(f[0])}
                  accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
                  maxSize={10 * 1024 * 1024}
                  formatsLabel="PNG, JPG, WebP or SVG logo (square, transparent PNG works best)"
                />
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <Slider
                  label="Logo size (share of code area)"
                  value={area}
                  min={4}
                  max={MAX_LOGO_AREA * 100}
                  onChange={setArea}
                  format={(v) => `${v}%`}
                />
                <div className="flex items-end pb-1">
                  <Checkbox
                    label="Backing pad behind logo"
                    description="A solid pad in the background colour keeps modules from showing through."
                    checked={pad}
                    onChange={setPad}
                  />
                </div>
              </div>
            </div>
          </Panel>
          <Panel title="Appearance">
            <QrStyleSettings value={style} onChange={setStyle} lockEcc />
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Preview" actions={shown ? <Badge>{`${shown.modules}×${shown.modules} modules`}</Badge> : null}>
            <div className="space-y-3">
              <div className="flex aspect-square items-center justify-center rounded-lg border border-border bg-bg-subtle">
                {previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previewUrl} alt="QR code with logo" data-testid="output" className="h-full w-full object-contain p-2" />
                ) : (
                  <p className="px-6 text-center text-sm text-fg-subtle">
                    {busy && renderable ? "Rendering and verifying…" : "Enter content and add a logo to see the preview."}
                  </p>
                )}
              </div>
              {shown?.verified ? (
                <>
                  <Alert tone="success" title="Verified">
                    The code was decoded successfully after adding the logo, at full size and at 400 px.
                  </Alert>
                  <div className="flex flex-wrap gap-2">
                    <DownloadButton blob={shown.png} filename="qr-logo.png" label="PNG" />
                    <DownloadButton blob={shown.svg} filename="qr-logo.svg" label="SVG" variant="secondary" />
                  </div>
                </>
              ) : null}
              {shown && !shown.verified ? (
                <Alert tone="warning" title="This code may not scan">
                  <p>
                    The logo covers too much of the code (or the colours are too weak) for it to decode reliably, even at larger QR
                    versions. Make the logo smaller, turn on the backing pad or shorten the content.
                  </p>
                  <div className="mt-2">
                    <DownloadButton blob={shown.png} filename="qr-logo-unverified.png" label="Download anyway" size="sm" variant="secondary" />
                  </div>
                </Alert>
              ) : null}
            </div>
          </Panel>
          <ErrorMessage error={shownError} />
        </div>
      </div>
      <ActionBar onReset={reset} />
    </div>
  );
}
