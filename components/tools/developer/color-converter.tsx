"use client";

import { useMemo, useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Field, Input } from "@/components/ui/field";
import { ActionBar, CopyButton, ErrorMessage, Panel } from "@/components/tools/shared";
import { contrastRatio, formatAll, nearestNamed, parseColor, toHex, wcag, type RGBA } from "@/lib/processors/developer/color";
import { errorMessage } from "@/lib/utils/hooks";
import { cn } from "@/lib/utils/cn";

const WHITE = { r: 255, g: 255, b: 255 };
const BLACK = { r: 0, g: 0, b: 0 };

function Contrast({ c, against, name }: { c: RGBA; against: { r: number; g: number; b: number }; name: string }) {
  const w = wcag(c, against);
  const bg = `rgb(${against.r} ${against.g} ${against.b})`;
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center gap-3">
        <span className="rounded px-3 py-1.5 text-sm font-semibold" style={{ background: bg, color: toHex(c) }}>
          Aa
        </span>
        <div className="text-sm">
          <div className="font-mono text-fg">{w.ratio.toFixed(2)}:1 on {name}</div>
          <div className="mt-0.5 flex flex-wrap gap-2 text-xs">
            {(
              [
                ["AA", w.aaNormal],
                ["AA large", w.aaLarge],
                ["AAA", w.aaaNormal],
                ["AAA large", w.aaaLarge],
              ] as [string, boolean][]
            ).map(([k, ok]) => (
              <span key={k} className={ok ? "text-success" : "text-danger"}>
                {ok ? "✓" : "✗"} {k}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ColorConverter(_props: ToolComponentProps) {
  const [input, setInput] = useState("#3b82f6");
  const parsed = useMemo(() => {
    try {
      return { ok: true as const, c: parseColor(input) };
    } catch (e) {
      return { ok: false as const, error: errorMessage(e) };
    }
  }, [input]);
  const c = parsed.ok ? parsed.c : null;
  const formats = c ? formatAll(c) : null;
  const named = c ? nearestNamed(c) : null;

  return (
    <div className="space-y-4">
      <Panel title="Color">
        <div className="flex flex-wrap items-end gap-3">
          <input
            type="color"
            aria-label="Pick a color"
            value={c ? toHex({ ...c, a: 1 }).slice(0, 7) : "#000000"}
            onChange={(e) => setInput(e.target.value)}
            className="h-10 w-14 cursor-pointer rounded-md border border-border bg-card"
          />
          <Field label="Any CSS color" hint="HEX, rgb(), hsl(), hwb(), oklch(), cmyk or a name" className="min-w-0 flex-1">
            {(id) => <Input id={id} value={input} onChange={(e) => setInput(e.target.value)} className="font-mono" data-testid="input" spellCheck={false} />}
          </Field>
        </div>
      </Panel>
      {!parsed.ok ? <ErrorMessage error={parsed.error} /> : null}
      {c && formats ? (
        <>
          <div className="checkerboard h-24 overflow-hidden rounded-xl border border-border">
            <div className="h-full w-full" style={{ background: formats.rgb }} />
          </div>
          <Panel title="Formats">
            <ul className="divide-y divide-border" data-testid="output">
              {(
                [
                  ["HEX", formats.hex],
                  ["RGB", formats.rgb],
                  ["RGB (legacy)", formats.rgbLegacy],
                  ["HSL", formats.hsl],
                  ["HWB", formats.hwb],
                  ["OKLCH", formats.oklch],
                  ["OKLab", formats.oklab],
                  ["CMYK", formats.cmyk],
                ] as [string, string][]
              ).map(([k, v]) => (
                <li key={k} className="flex items-center gap-3 py-2">
                  <span className="w-28 shrink-0 text-xs text-fg-subtle">{k}</span>
                  <code className="min-w-0 flex-1 truncate font-mono text-[13px] text-fg">{v}</code>
                  <CopyButton text={v} />
                </li>
              ))}
              {named ? (
                <li className="flex items-center gap-3 py-2">
                  <span className="w-28 shrink-0 text-xs text-fg-subtle">CSS name</span>
                  <span className={cn("font-mono text-[13px]", named.exact ? "text-fg" : "text-fg-muted")}>
                    {named.exact ? named.name : `≈ ${named.name} (nearest)`}
                  </span>
                </li>
              ) : null}
            </ul>
          </Panel>
          <Panel title="WCAG contrast">
            <div className="grid gap-3 sm:grid-cols-2">
              <Contrast c={c} against={WHITE} name="white" />
              <Contrast c={c} against={BLACK} name="black" />
            </div>
            <p className="mt-3 text-xs text-fg-subtle">
              Best text color on this background: {contrastRatio(c, WHITE) >= contrastRatio(c, BLACK) ? "white" : "black"}. AA requires 4.5:1 for body text and 3:1 for large text.
            </p>
          </Panel>
        </>
      ) : null}
      <ActionBar onReset={() => setInput("#3b82f6")} />
    </div>
  );
}
