"use client";

import { Field, Input, Segmented, Slider } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { scanContrastWarning } from "@/lib/processors/qr/color";
import type { EccLevel } from "@/lib/processors/qr/render";

export interface QrStyle {
  size: number;
  margin: number;
  ecc: EccLevel;
  foreground: string;
  background: string;
}

export const defaultQrStyle: QrStyle = { size: 512, margin: 4, ecc: "M", foreground: "#000000", background: "#ffffff" };

const eccOptions = [
  { value: "L", label: "L 7%" },
  { value: "M", label: "M 15%" },
  { value: "Q", label: "Q 25%" },
  { value: "H", label: "H 30%" },
] as const;

/** Colour picker plus hex text input kept in sync. */
export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      {(id) => (
        <div className="flex items-center gap-2">
          <input
            type="color"
            aria-label={`${label} picker`}
            value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#000000"}
            onChange={(e) => onChange(e.target.value)}
            className="h-9 w-11 shrink-0 cursor-pointer rounded-lg border border-border bg-card p-1"
          />
          <Input id={id} value={value} onChange={(e) => onChange(e.target.value.trim())} maxLength={7} className="font-mono" />
        </div>
      )}
    </Field>
  );
}

/**
 * Size, quiet zone, error correction and colours, with a contrast warning.
 * `lockEcc` shows the level but prevents changes (QR with Logo forces H).
 */
export function QrStyleSettings({
  value,
  onChange,
  lockEcc,
}: {
  value: QrStyle;
  onChange: (v: QrStyle) => void;
  lockEcc?: boolean;
}) {
  const set = <K extends keyof QrStyle>(k: K, v: QrStyle[K]) => onChange({ ...value, [k]: v });
  const warning = scanContrastWarning(value.foreground, value.background);
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Slider label="Image size" value={value.size} min={128} max={2048} step={32} onChange={(v) => set("size", v)} format={(v) => `${v} px`} />
        <Slider label="Quiet zone (margin)" value={value.margin} min={0} max={10} onChange={(v) => set("margin", v)} format={(v) => `${v} modules`} />
      </div>
      <div>
        <p className="mb-1.5 text-[13px] font-medium text-fg">Error correction</p>
        {lockEcc ? (
          <p className="text-sm text-fg-muted">
            High (H, ~30% recovery), required so the code survives the logo covering its centre.
          </p>
        ) : (
          <>
            <Segmented label="Error correction level" value={value.ecc} onChange={(v) => set("ecc", v)} options={eccOptions} />
            <p className="mt-1.5 text-xs text-fg-subtle">Higher levels survive damage and dirt but make the code denser.</p>
          </>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <ColorField label="Foreground" value={value.foreground} onChange={(v) => set("foreground", v)} />
        <ColorField label="Background" value={value.background} onChange={(v) => set("background", v)} />
      </div>
      {value.margin < 2 ? (
        <Alert tone="warning">A quiet zone under 2 modules can stop scanners finding the code when it is placed on a busy background.</Alert>
      ) : null}
      {warning ? <Alert tone="warning">{warning}</Alert> : null}
    </div>
  );
}

export function isHexColor(v: string): boolean {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v);
}
