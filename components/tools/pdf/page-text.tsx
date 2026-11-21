"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Field, Input, Select, Slider } from "@/components/ui/field";
import { ActionBar, ErrorMessage, Panel, Settings, TaskProgress } from "@/components/tools/shared";
import type { FontChoice, HAlign, NumberStyle, TextStamp } from "@/lib/processors/pdf/stamp";
import { useTask } from "@/lib/utils/hooks";
import { PdfPicker, outName, usePdfLoader } from "./common";
import { PdfOutput, ReplacedCharsNotice, pagesFrom } from "./helpers";

const SLOTS: { v: "top" | "bottom"; h: HAlign; label: string }[] = [
  { v: "top", h: "left", label: "Header left" },
  { v: "top", h: "center", label: "Header centre" },
  { v: "top", h: "right", label: "Header right" },
  { v: "bottom", h: "left", label: "Footer left" },
  { v: "bottom", h: "center", label: "Footer centre" },
  { v: "bottom", h: "right", label: "Footer right" },
];

/** Page numbers (mode "numbers") and Header & Footer (mode "header-footer"). */
export default function PageText({ tool }: ToolComponentProps) {
  const numbers = tool.processorOptions?.mode === "numbers";
  const loader = usePdfLoader();
  const L = loader.loaded;
  const [format, setFormat] = useState("Page {n} of {total}");
  const [slot, setSlot] = useState(4);
  const [style, setStyle] = useState<NumberStyle>("arabic");
  const [start, setStart] = useState(1);
  const [texts, setTexts] = useState<string[]>(["{title}", "", "{date}", "", "", "Page {n} of {total}"]);
  const [font, setFont] = useState<FontChoice>("helvetica");
  const [size, setSize] = useState(10);
  const [color, setColor] = useState("#333333");
  const [margin, setMargin] = useState(28);
  const [pages, setPages] = useState("");
  const task = useTask<{ bytes: Uint8Array; replacedChars: number }>();
  const run = () =>
    task.run(async () => {
      if (!L) throw new Error("Add a PDF first.");
      const { stampPageText, expandTemplate } = await import("@/lib/processors/pdf/stamp");
      const selected = await pagesFrom(pages, L.pageCount);
      const date = new Date().toLocaleDateString();
      const title = L.file.name.replace(/\.pdf$/i, "");
      const stamps = (page: number, total: number): TextStamp[] => {
        const idx = selected.indexOf(page);
        const vars = { page: numbers ? idx + start : page, total: numbers ? selected.length + start - 1 : total, date, title, filename: L.file.name, style };
        if (numbers) return [{ text: expandTemplate(format, vars), v: SLOTS[slot].v, h: SLOTS[slot].h }];
        return SLOTS.map((s, i) => ({ text: expandTemplate(texts[i], vars), v: s.v, h: s.h })).filter((s) => s.text.trim());
      };
      return stampPageText(L.bytes, { stamps, font, fontSize: size, color, margin, pages: selected, password: L.password });
    });
  return (
    <div className="space-y-4">
      <PdfPicker loader={loader} />
      <Panel title={numbers ? "Page numbers" : "Header and footer text"}>
        <div className="space-y-4">
          {numbers ? (
            <Settings>
              <Field label="Format" hint="{n}, {total}">{(id) => <Input id={id} value={format} onChange={(e) => setFormat(e.target.value)} data-testid="input" />}</Field>
              <Field label="Position">
                {(id) => <Select id={id} value={slot} onChange={(e) => setSlot(Number(e.target.value))}>{SLOTS.map((s, i) => <option key={i} value={i}>{s.label.replace("Header", "Top").replace("Footer", "Bottom")}</option>)}</Select>}
              </Field>
              <Field label="Number style">
                {(id) => (
                  <Select id={id} value={style} onChange={(e) => setStyle(e.target.value as NumberStyle)}>
                    <option value="arabic">1, 2, 3</option>
                    <option value="roman">i, ii, iii</option>
                    <option value="roman-upper">I, II, III</option>
                    <option value="alpha">a, b, c</option>
                  </Select>
                )}
              </Field>
              <Field label="Start at">{(id) => <Input id={id} type="number" min={0} value={start} onChange={(e) => setStart(Number(e.target.value) || 0)} />}</Field>
            </Settings>
          ) : (
            <>
              <p className="text-xs text-fg-subtle">Placeholders: {"{page}"}, {"{total}"}, {"{date}"}, {"{title}"}, {"{filename}"}. Leave a box empty to skip it.</p>
              <div className="grid gap-3 sm:grid-cols-3">
                {SLOTS.map((s, i) => (
                  <Field key={i} label={s.label}>{(id) => <Input id={id} value={texts[i]} onChange={(e) => setTexts((t) => t.map((x, j) => (j === i ? e.target.value : x)))} data-testid={i === 0 ? "input" : undefined} />}</Field>
                ))}
              </div>
            </>
          )}
          <Settings>
            <Field label="Font">
              {(id) => (
                <Select id={id} value={font} onChange={(e) => setFont(e.target.value as FontChoice)}>
                  <option value="helvetica">Helvetica</option>
                  <option value="helvetica-bold">Helvetica Bold</option>
                  <option value="times">Times</option>
                  <option value="courier">Courier</option>
                </Select>
              )}
            </Field>
            <Slider label="Font size" value={size} min={6} max={36} onChange={setSize} format={(v) => `${v}pt`} />
            <Field label="Colour">{(id) => <Input id={id} type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-20 p-1" />}</Field>
            <Slider label="Distance from edge" value={margin} min={8} max={90} onChange={setMargin} format={(v) => `${v}pt`} />
            <Field label="Pages" hint="empty = all">{(id) => <Input id={id} value={pages} onChange={(e) => setPages(e.target.value)} placeholder="e.g. 2-last" />}</Field>
          </Settings>
        </div>
      </Panel>
      <ActionBar onRun={run} runLabel={numbers ? "Add page numbers" : "Add header & footer"} running={task.running} disabled={!L} onReset={() => (loader.reset(), task.reset())} />
      <TaskProgress running={task.running} progress={null} label="Stamping pages…" />
      <ErrorMessage error={task.error} />
      {task.result && L ? (
        <PdfOutput bytes={task.result.bytes} name={outName(L.file.name, numbers ? "-numbered" : "-header-footer")} label="Result">
          <ReplacedCharsNotice count={task.result.replacedChars} />
        </PdfOutput>
      ) : null}
    </div>
  );
}
