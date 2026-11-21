"use client";

import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { Field, Select } from "@/components/ui/field";
import { useObjectUrl } from "@/lib/utils/hooks";
import { cn } from "@/lib/utils/cn";
import type { DecodedImage } from "@/lib/processors/image/canvas";
import type { OutputFormat } from "@/lib/processors/image/formats";
import type { Pixels, Rect } from "@/lib/processors/image/pixels";

export const IMAGE_ACCEPT = "image/*,.heic,.heif,.avif,.svg";
export const MAX_IMAGE_BYTES = 80 * 1024 * 1024;

/** Decodes any supported image, converting HEIC/HEIF with heic2any first (lazy-loaded). */
export async function decodeAny(file: Blob & { name?: string }): Promise<DecodedImage> {
  const [{ decodeImage }, { isHeic }] = await Promise.all([import("@/lib/processors/image/canvas"), import("@/lib/processors/image/formats")]);
  if (isHeic({ name: file.name ?? "", type: file.type })) {
    const heic2any = (await import("heic2any")).default;
    const out = await heic2any({ blob: file, toType: "image/png" });
    return decodeImage(Array.isArray(out) ? out[0] : out);
  }
  return decodeImage(file);
}

/** Reads full-resolution RGBA pixels of a decoded image. */
export async function pixelsOf(img: DecodedImage): Promise<Pixels> {
  const { toCanvas, canvasPixels } = await import("@/lib/processors/image/canvas");
  return canvasPixels(toCanvas(img));
}

export async function pixelsToBlob(px: Pixels, format: OutputFormat, quality = 0.9, background?: string): Promise<Blob> {
  const { pixelsToCanvas, encodeCanvas } = await import("@/lib/processors/image/canvas");
  return encodeCanvas(pixelsToCanvas(px), { format, quality, background });
}

/** Keeps a decoded image for a file and frees it when the file changes or the component unmounts. */
export function useDecoded(file: File | null) {
  const [state, setState] = useState<{ file: File | null; img: DecodedImage | null; error: string | null }>({ file: null, img: null, error: null });
  useEffect(() => {
    if (!file) return;
    let alive = true;
    let decoded: DecodedImage | null = null;
    decodeAny(file)
      .then((img) => {
        decoded = img;
        if (alive) setState({ file, img, error: null });
        else img.close();
      })
      .catch((e) => alive && setState({ file, img: null, error: (e as Error).message }));
    return () => {
      alive = false;
      decoded?.close();
    };
  }, [file]);
  const fresh = !!file && state.file === file;
  return { img: fresh ? state.img : null, error: fresh ? state.error : null, loading: !!file && !fresh };
}

/** Picks the output format: "keep" maps to the input type when encodable. */
export function inferFormat(file: File | null, choice: OutputFormat | "keep"): OutputFormat {
  if (choice !== "keep") return choice;
  const t = file?.type ?? "";
  if (t.includes("png") || t.includes("gif") || t.includes("svg")) return "png";
  if (t.includes("webp")) return "webp";
  if (t.includes("bmp")) return "bmp";
  return "jpeg";
}

export function FormatSelect({ value, onChange, allowKeep = true, label = "Output format" }: { value: OutputFormat | "keep"; onChange: (v: OutputFormat | "keep") => void; allowKeep?: boolean; label?: string }) {
  const [webp, setWebp] = useState(true);
  useEffect(() => {
    import("@/lib/processors/image/canvas").then((m) => setWebp(m.canEncode("image/webp")));
  }, []);
  return (
    <Field label={label} hint={!webp ? "WebP encoding isn't supported in this browser" : undefined}>
      {(id) => (
        <Select id={id} value={value} onChange={(e) => onChange(e.target.value as OutputFormat | "keep")}>
          {allowKeep ? <option value="keep">Same as input</option> : null}
          <option value="jpeg">JPG</option>
          <option value="png">PNG</option>
          <option value="webp" disabled={!webp}>
            WebP{!webp ? " (unsupported)" : ""}
          </option>
          <option value="bmp">BMP</option>
        </Select>
      )}
    </Field>
  );
}

/** Before/after comparison with a draggable divider. */
export function CompareView({ before, after, alt = "Image" }: { before: Blob | null; after: Blob | null; alt?: string }) {
  const b = useObjectUrl(before);
  const a = useObjectUrl(after);
  const [pos, setPos] = useState(50);
  if (!b) return null;
  return (
    <div className="space-y-2">
      <div className="checkerboard relative overflow-hidden rounded-lg border border-border select-none">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={a ?? b} alt={`${alt} (after)`} className="mx-auto block max-h-[520px] max-w-full" draggable={false} data-testid="output" />
        {a ? (
          <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={b} alt={`${alt} (before)`} className="mx-auto block max-h-[520px] max-w-full" draggable={false} />
          </div>
        ) : null}
        {a ? <div className="pointer-events-none absolute inset-y-0 w-px bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.4)]" style={{ left: `${pos}%` }} /> : null}
      </div>
      {a ? (
        <div className="flex items-center gap-3 text-xs text-fg-subtle">
          <span>Before</span>
          <input type="range" min={0} max={100} value={pos} onChange={(e) => setPos(Number(e.target.value))} aria-label="Compare before and after" className="flex-1 accent-[var(--accent)]" />
          <span>After</span>
        </div>
      ) : null}
    </div>
  );
}

/** Displays an image and lets the user drag out a rectangle (in image pixel coordinates). */
export function RegionSelect({ src, width, height, region, onChange, className }: { src: string; width: number; height: number; region: Rect | null; onChange: (r: Rect | null) => void; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const toImg = (e: RPointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: Math.max(0, Math.min(width, ((e.clientX - r.left) / r.width) * width)), y: Math.max(0, Math.min(height, ((e.clientY - r.top) / r.height) * height)) };
  };
  return (
    <div
      ref={ref}
      className={cn("relative mx-auto w-fit cursor-crosshair touch-none select-none", className)}
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        start.current = toImg(e);
        onChange(null);
      }}
      onPointerMove={(e) => {
        if (!start.current) return;
        const p = toImg(e);
        const s = start.current;
        onChange({ x: Math.round(Math.min(s.x, p.x)), y: Math.round(Math.min(s.y, p.y)), width: Math.round(Math.abs(p.x - s.x)), height: Math.round(Math.abs(p.y - s.y)) });
      }}
      onPointerUp={() => (start.current = null)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="Select a region" className="block max-h-[480px] max-w-full rounded-lg" draggable={false} />
      {region && region.width > 2 && region.height > 2 ? (
        <div
          className="pointer-events-none absolute border-2 border-white bg-white/10 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]"
          style={{ left: `${(region.x / width) * 100}%`, top: `${(region.y / height) * 100}%`, width: `${(region.width / width) * 100}%`, height: `${(region.height / height) * 100}%` }}
        />
      ) : null}
    </div>
  );
}
