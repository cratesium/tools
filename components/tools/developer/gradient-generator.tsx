"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox, Field, Segmented, Select, Slider } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { ActionBar, Panel, TextOutput } from "@/components/tools/shared";
import { DEFAULT_GRADIENT, gradientCss, gradientRule, type GradientState, type GradientType } from "@/lib/processors/developer/gradient";

const PRESETS: { name: string; state: Partial<GradientState> }[] = [
  { name: "Graphite", state: { type: "linear", angle: 135, stops: [{ id: "a", color: "#0f172a", position: 0 }, { id: "b", color: "#475569", position: 55 }, { id: "c", color: "#e2e8f0", position: 100 }] } },
  { name: "Sunrise", state: { type: "linear", angle: 90, stops: [{ id: "a", color: "#f97316", position: 0 }, { id: "b", color: "#facc15", position: 100 }] } },
  { name: "Ocean", state: { type: "linear", angle: 180, stops: [{ id: "a", color: "#0ea5e9", position: 0 }, { id: "b", color: "#0f766e", position: 100 }] } },
  { name: "Forest", state: { type: "radial", shape: "circle", stops: [{ id: "a", color: "#bbf7d0", position: 0 }, { id: "b", color: "#166534", position: 100 }] } },
  { name: "Paper", state: { type: "linear", angle: 180, stops: [{ id: "a", color: "#ffffff", position: 0 }, { id: "b", color: "#f4f4f5", position: 100 }] } },
  { name: "Color wheel", state: { type: "conic", angle: 0, stops: [{ id: "a", color: "#ef4444", position: 0 }, { id: "b", color: "#eab308", position: 33 }, { id: "c", color: "#22c55e", position: 66 }, { id: "d", color: "#ef4444", position: 100 }] } },
];

let uid = 100;

export default function GradientGenerator(_props: ToolComponentProps) {
  const [g, setG] = useState<GradientState>(DEFAULT_GRADIENT);
  const css = useMemo(() => gradientCss(g), [g]);
  const rule = useMemo(() => gradientRule(g), [g]);
  const set = <K extends keyof GradientState>(k: K, v: GradientState[K]) => setG((s) => ({ ...s, [k]: v }));
  const setStop = (id: string, patch: Partial<{ color: string; position: number }>) =>
    setG((s) => ({ ...s, stops: s.stops.map((st) => (st.id === id ? { ...st, ...patch } : st)) }));

  return (
    <div className="space-y-4">
      <div className="h-56 rounded-xl border border-border sm:h-72" style={{ backgroundImage: css }} role="img" aria-label="Gradient preview" />
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.name}
            type="button"
            onClick={() => setG({ ...DEFAULT_GRADIENT, ...p.state } as GradientState)}
            className="flex items-center gap-2 rounded-full border border-border bg-card px-2.5 py-1 text-[13px] text-fg-muted hover:text-fg"
          >
            <span className="h-4 w-4 rounded-full border border-border" style={{ backgroundImage: gradientCss({ ...DEFAULT_GRADIENT, ...p.state } as GradientState) }} />
            {p.name}
          </button>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Type">
          <div className="space-y-4">
            <Segmented
              label="Gradient type"
              value={g.type}
              onChange={(v: GradientType) => set("type", v)}
              options={[
                { value: "linear", label: "Linear" },
                { value: "radial", label: "Radial" },
                { value: "conic", label: "Conic" },
              ]}
            />
            {g.type !== "radial" ? <Slider label="Angle" value={g.angle} min={0} max={360} onChange={(v) => set("angle", v)} format={(v) => `${v}°`} /> : null}
            {g.type === "radial" ? (
              <Field label="Shape">
                {(id) => (
                  <Select id={id} value={g.shape} onChange={(e) => set("shape", e.target.value as "circle" | "ellipse")}>
                    <option value="ellipse">Ellipse</option>
                    <option value="circle">Circle</option>
                  </Select>
                )}
              </Field>
            ) : null}
            {g.type !== "linear" ? (
              <div className="grid grid-cols-2 gap-4">
                <Slider label="Center X" value={g.centerX} min={0} max={100} onChange={(v) => set("centerX", v)} format={(v) => `${v}%`} />
                <Slider label="Center Y" value={g.centerY} min={0} max={100} onChange={(v) => set("centerY", v)} format={(v) => `${v}%`} />
              </div>
            ) : null}
            <Checkbox label="Repeating" checked={g.repeating} onChange={(v) => set("repeating", v)} />
          </div>
        </Panel>
        <Panel
          title="Color stops"
          actions={
            <Button
              size="sm"
              variant="secondary"
              icon={<Plus className="h-3.5 w-3.5" />}
              onClick={() => setG((s) => ({ ...s, stops: [...s.stops, { id: `s${uid++}`, color: "#71717a", position: 50 }] }))}
            >
              Add stop
            </Button>
          }
        >
          <ul className="space-y-3">
            {g.stops.map((st) => (
              <li key={st.id} className="flex items-center gap-3">
                <input type="color" value={st.color} onChange={(e) => setStop(st.id, { color: e.target.value })} aria-label="Stop color" className="h-9 w-11 cursor-pointer rounded border border-border bg-card" />
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={st.position}
                  onChange={(e) => setStop(st.id, { position: Number(e.target.value) })}
                  aria-label="Stop position"
                  className="min-w-0 flex-1 accent-[var(--accent)]"
                />
                <span className="w-10 text-right font-mono text-xs text-fg-muted">{st.position}%</span>
                <Button
                  size="icon"
                  variant="ghost"
                  disabled={g.stops.length <= 2}
                  aria-label="Remove stop"
                  onClick={() => setG((s) => ({ ...s, stops: s.stops.filter((x) => x.id !== st.id) }))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
      <TextOutput value={rule} filename="gradient.css" mime="text/css" label="CSS" rows={5} />
      <ActionBar onReset={() => setG(DEFAULT_GRADIENT)} />
    </div>
  );
}
