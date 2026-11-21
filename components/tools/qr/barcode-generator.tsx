"use client";

import { useEffect, useMemo, useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox, Field, Input, Select, Slider } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { ActionBar, DownloadButton, ErrorMessage, Panel } from "@/components/tools/shared";
import { barcodeFormats, validateBarcode, type BarcodeFormat } from "@/lib/processors/qr/barcode";
import { scanContrastWarning } from "@/lib/processors/qr/color";
import { canvasToBlob } from "@/lib/processors/qr/render";
import { errorMessage, useDebounced, useObjectUrl } from "@/lib/utils/hooks";
import { ColorField, isHexColor } from "./qr-options";

interface Opts {
  barWidth: number;
  height: number;
  displayValue: boolean;
  fontSize: number;
  margin: number;
  lineColor: string;
  background: string;
  pngScale: number;
}

const defaults: Opts = {
  barWidth: 2,
  height: 100,
  displayValue: true,
  fontSize: 18,
  margin: 10,
  lineColor: "#000000",
  background: "#ffffff",
  pngScale: 2,
};

export default function BarcodeGenerator({ tool }: ToolComponentProps) {
  void tool;
  const [format, setFormat] = useState<BarcodeFormat>("CODE128");
  const [value, setValue] = useState("");
  const [opts, setOpts] = useState<Opts>(defaults);
  const [svg, setSvg] = useState<Blob | null>(null);
  const [png, setPng] = useState<Blob | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

  const meta = barcodeFormats.find((f) => f.value === format)!;
  const validation = useMemo(() => (value.trim() ? validateBarcode(format, value) : null), [format, value]);
  const job = useDebounced({ format, validation, opts }, 120);
  const renderable = !!job.validation?.ok && isHexColor(job.opts.lineColor) && isHexColor(job.opts.background);
  const current = renderable && !!validation?.ok;
  const shownSvg = current ? svg : null;
  const shownPng = current ? png : null;
  const previewUrl = useObjectUrl(shownSvg);
  const set = <K extends keyof Opts>(k: K, v: Opts[K]) => setOpts((o) => ({ ...o, [k]: v }));
  const contrast = scanContrastWarning(opts.lineColor, opts.background);

  useEffect(() => {
    let alive = true;
    const { format: fmt, validation: v, opts: o } = job;
    if (!renderable || !v || !v.ok) return;
    (async () => {
      try {
        const { default: JsBarcode } = await import("jsbarcode");
        let valid = true;
        const base = {
          format: fmt,
          displayValue: o.displayValue,
          lineColor: o.lineColor,
          background: o.background,
          valid: (ok: boolean) => {
            if (!ok) valid = false;
          },
        };
        const svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        JsBarcode(svgEl, v.value, { ...base, width: o.barWidth, height: o.height, fontSize: o.fontSize, margin: o.margin });
        if (!valid) throw new Error(`JsBarcode rejected this value for ${fmt}.`);
        svgEl.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        const svgText = new XMLSerializer().serializeToString(svgEl);

        const canvas = document.createElement("canvas");
        const k = o.pngScale;
        JsBarcode(canvas, v.value, { ...base, width: o.barWidth * k, height: o.height * k, fontSize: o.fontSize * k, margin: o.margin * k, textMargin: 2 * k });
        const pngBlob = await canvasToBlob(canvas);
        if (!alive) return;
        setSvg(new Blob([svgText], { type: "image/svg+xml" }));
        setPng(pngBlob);
        setRenderError(null);
      } catch (e) {
        if (!alive) return;
        setSvg(null);
        setPng(null);
        setRenderError(errorMessage(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, [renderable, job]);

  const reset = () => {
    setFormat("CODE128");
    setValue("");
    setOpts(defaults);
    setSvg(null);
    setPng(null);
    setRenderError(null);
  };

  const fileBase = `barcode-${format.toLowerCase()}-${(validation?.ok ? validation.value : "code").replace(/[^a-z0-9-]+/gi, "_").slice(0, 40)}`;

  return (
    <div className="space-y-4">
      <Panel title="Barcode data">
        <div className="grid gap-4 sm:grid-cols-[220px_minmax(0,1fr)]">
          <Field label="Format">
            {(id) => (
              <Select id={id} value={format} onChange={(e) => setFormat(e.target.value as BarcodeFormat)}>
                {barcodeFormats.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Value" hint={meta.hint}>
            {(id) => (
              <Input
                id={id}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={`e.g. ${meta.example}`}
                data-testid="input"
                className="font-mono"
              />
            )}
          </Field>
        </div>
        {validation && !validation.ok ? <p className="mt-2 text-xs text-danger" role="alert">{validation.error}</p> : null}
        {validation?.ok && validation.note ? <p className="mt-2 text-xs text-fg-muted">{validation.note}</p> : null}
      </Panel>

      <Panel
        title="Preview"
        actions={
          <>
            <DownloadButton blob={shownSvg} filename={`${fileBase}.svg`} label="SVG" size="sm" />
            <DownloadButton blob={shownPng} filename={`${fileBase}.png`} label="PNG" size="sm" variant="secondary" />
          </>
        }
      >
        <div className="flex min-h-[160px] items-center justify-center overflow-auto rounded-lg border border-border bg-bg-subtle p-4">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt={`${meta.label} barcode`} data-testid="output" className="max-w-full" />
          ) : (
            <p className="text-sm text-fg-subtle">Enter a valid value to see the barcode.</p>
          )}
        </div>
      </Panel>
      <ErrorMessage error={current ? renderError : null} />

      <Panel title="Appearance">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Slider label="Bar width" value={opts.barWidth} min={1} max={5} onChange={(v) => set("barWidth", v)} format={(v) => `${v} px`} />
            <Slider label="Height" value={opts.height} min={30} max={300} step={5} onChange={(v) => set("height", v)} format={(v) => `${v} px`} />
            <Slider label="Margin" value={opts.margin} min={0} max={50} onChange={(v) => set("margin", v)} format={(v) => `${v} px`} />
            <Slider label="Font size" value={opts.fontSize} min={8} max={40} onChange={(v) => set("fontSize", v)} format={(v) => `${v} px`} />
            <Slider label="PNG scale" value={opts.pngScale} min={1} max={6} onChange={(v) => set("pngScale", v)} format={(v) => `${v}×`} />
            <div className="flex items-end pb-1">
              <Checkbox label="Show human-readable text" checked={opts.displayValue} onChange={(v) => set("displayValue", v)} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <ColorField label="Bars" value={opts.lineColor} onChange={(v) => set("lineColor", v)} />
            <ColorField label="Background" value={opts.background} onChange={(v) => set("background", v)} />
          </div>
          {contrast ? <Alert tone="warning">{contrast}</Alert> : null}
          {opts.margin < 10 ? (
            <Alert tone="info">Barcode scanners need a quiet zone either side of the bars. Keep a margin of at least 10 px (about 10× the bar width for print).</Alert>
          ) : null}
        </div>
      </Panel>
      <ActionBar onReset={reset} />
    </div>
  );
}
