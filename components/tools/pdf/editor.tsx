"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent, type RefObject } from "react";
import { ChevronLeft, ChevronRight, Eraser, ImagePlus, PenLine, Square, Trash2, Type } from "lucide-react";
import type { ToolComponentProps } from "@/types/tool";
import { Field, Input, Segmented, Select, Slider, Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { ActionBar, ErrorMessage, Panel, TaskProgress } from "@/components/tools/shared";
import type { EditItem } from "@/lib/processors/pdf/annotate";
import type { FontChoice } from "@/lib/processors/pdf/stamp";
import { useObjectUrl, useTask } from "@/lib/utils/hooks";
import { cn } from "@/lib/utils/cn";
import { PdfPicker, outName, usePdfLoader } from "./common";
import { PdfOutput, ReplacedCharsNotice } from "./helpers";

let uid = 0;
const nextId = () => `i${uid++}`;

/** Renders one page into a canvas sized to the container width. */
function PageCanvas({ doc, page, onSize }: { doc: NonNullable<ReturnType<typeof usePdfLoader>["loaded"]>["doc"]; page: number; onSize: (w: number, h: number, aspect: number) => void }) {
  const holder = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const { renderPage } = await import("@/lib/processors/pdf/pdfjs");
      const p = await doc.getPage(page);
      const vp = p.getViewport({ scale: 1 });
      const width = Math.min(holder.current?.parentElement?.clientWidth ?? 800, 900);
      const c = await renderPage(p, (width * Math.min(2, window.devicePixelRatio || 1)) / vp.width);
      if (!alive || !holder.current) return;
      c.style.width = "100%";
      c.style.display = "block";
      holder.current.replaceChildren(c);
      onSize(vp.width, vp.height, vp.height / vp.width);
    })();
    return () => {
      alive = false;
    };
  }, [doc, page]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div ref={holder} className="bg-white" />;
}

/** Draw / type / upload a signature and return a trimmed PNG. */
function SignaturePad({ onDone }: { onDone: (png: Uint8Array, aspect: number) => void }) {
  const [mode, setMode] = useState<"draw" | "type" | "upload">("draw");
  const [name, setName] = useState("");
  const [color, setColor] = useState("#111827");
  const [style, setStyle] = useState("'Segoe Script','Brush Script MT','Snell Roundhand',cursive");
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [dirty, setDirty] = useState(false);

  const point = (e: RPointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * e.currentTarget.width, ((e.clientY - r.top) / r.height) * e.currentTarget.height] as const;
  };
  const exportTrimmed = async (c: HTMLCanvasElement) => {
    const g = c.getContext("2d")!;
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0;
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        if (d[(y * c.width + x) * 4 + 3] > 10) {
          x0 = Math.min(x0, x);
          y0 = Math.min(y0, y);
          x1 = Math.max(x1, x);
          y1 = Math.max(y1, y);
        }
      }
    }
    if (x1 <= x0 || y1 <= y0) throw new Error("The signature is empty.");
    const pad = 6;
    const t = document.createElement("canvas");
    t.width = x1 - x0 + pad * 2;
    t.height = y1 - y0 + pad * 2;
    t.getContext("2d")!.drawImage(c, x0 - pad, y0 - pad, t.width, t.height, 0, 0, t.width, t.height);
    const blob = await new Promise<Blob>((res) => t.toBlob((b) => res(b!), "image/png"));
    onDone(new Uint8Array(await blob.arrayBuffer()), t.height / t.width);
  };
  const typed = async () => {
    const c = document.createElement("canvas");
    c.width = 900;
    c.height = 260;
    const g = c.getContext("2d")!;
    g.fillStyle = color;
    g.font = `110px ${style}`;
    g.textBaseline = "middle";
    g.fillText(name, 20, 130);
    await exportTrimmed(c);
  };
  return (
    <div className="space-y-3">
      <Segmented label="Signature" value={mode} onChange={setMode} options={[{ value: "draw", label: "Draw" }, { value: "type", label: "Type" }, { value: "upload", label: "Upload image" }]} />
      {mode === "draw" ? (
        <>
          <canvas
            ref={canvas}
            width={900}
            height={260}
            className="h-36 w-full touch-none rounded-lg border border-dashed border-border-strong bg-white"
            aria-label="Signature drawing area"
            onPointerDown={(e) => {
              drawing.current = true;
              e.currentTarget.setPointerCapture(e.pointerId);
              const g = e.currentTarget.getContext("2d")!;
              const [x, y] = point(e);
              g.strokeStyle = color;
              g.lineWidth = 5;
              g.lineCap = "round";
              g.lineJoin = "round";
              g.beginPath();
              g.moveTo(x, y);
            }}
            onPointerMove={(e) => {
              if (!drawing.current) return;
              const g = e.currentTarget.getContext("2d")!;
              const [x, y] = point(e);
              g.lineTo(x, y);
              g.stroke();
              setDirty(true);
            }}
            onPointerUp={() => (drawing.current = false)}
          />
          <div className="flex flex-wrap items-center gap-2">
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Ink colour" className="h-8 w-10 rounded border border-border" />
            <Button size="sm" variant="ghost" onClick={() => (canvas.current!.getContext("2d")!.clearRect(0, 0, 900, 260), setDirty(false))}>Clear</Button>
            <Button size="sm" disabled={!dirty} onClick={() => exportTrimmed(canvas.current!).catch(() => {})}>Use this signature</Button>
          </div>
        </>
      ) : mode === "type" ? (
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Your name" className="min-w-[200px] flex-1">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} data-testid="input" />}</Field>
          <Field label="Style">{(id) => <Select id={id} value={style} onChange={(e) => setStyle(e.target.value)}><option value="'Segoe Script','Brush Script MT','Snell Roundhand',cursive">Script</option><option value="'Lucida Handwriting','Bradley Hand',cursive">Handwriting</option><option value="Georgia,serif">Formal serif</option></Select>}</Field>
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Ink colour" className="h-9 w-10 rounded border border-border" />
          <Button disabled={!name.trim()} onClick={typed}>Use this signature</Button>
          {name ? <p className="w-full text-3xl" style={{ fontFamily: style, color }}>{name}</p> : null}
        </div>
      ) : (
        <input
          type="file"
          accept="image/png,image/jpeg"
          aria-label="Signature image"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const bmp = await createImageBitmap(f);
            const c = document.createElement("canvas");
            c.width = bmp.width;
            c.height = bmp.height;
            c.getContext("2d")!.drawImage(bmp, 0, 0);
            bmp.close();
            await exportTrimmed(c).catch(() => {});
          }}
          className="text-sm"
        />
      )}
    </div>
  );
}

/** Edit PDF (mode "edit": text, boxes, whiteout, images) and Sign PDF (mode "sign": signature + date). */
export default function PdfEditor({ tool }: ToolComponentProps) {
  const sign = tool.processorOptions?.mode === "sign";
  const loader = usePdfLoader();
  const L = loader.loaded;
  const [page, setPage] = useState(1);
  const [aspect, setAspect] = useState(1.414);
  const [ptWidth, setPtWidth] = useState(612);
  const [items, setItems] = useState<EditItem[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; mode: "move" | "resize"; sx: number; sy: number; start: EditItem } | null>(null);
  const task = useTask<{ bytes: Uint8Array; replacedChars: number }>();
  const selected = items.find((i) => i.id === sel) ?? null;
  const upd = (id: string, patch: Partial<EditItem>) => setItems((list) => list.map((i) => (i.id === id ? ({ ...i, ...patch } as EditItem) : i)));
  const add = (it: EditItem) => (setItems((l) => [...l, it]), setSel(it.id));

  const onDown = (e: RPointerEvent<HTMLElement>) => {
    const id = e.currentTarget.dataset.id!;
    const it = items.find((i) => i.id === id);
    if (!it) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setSel(id);
    drag.current = { id, mode: e.currentTarget.dataset.mode === "resize" ? "resize" : "move", sx: e.clientX, sy: e.clientY, start: it };
  };
  const onMove = (e: RPointerEvent) => {
    const d = drag.current;
    if (!d || !box.current) return;
    const r = box.current.getBoundingClientRect();
    const dx = (e.clientX - d.sx) / r.width;
    const dy = (e.clientY - d.sy) / r.height;
    const s = d.start;
    if (d.mode === "move") upd(d.id, { x: Math.min(1 - s.w, Math.max(0, s.x + dx)), y: Math.min(1 - s.h, Math.max(0, s.y + dy)) });
    else {
      const w = Math.max(0.02, Math.min(1 - s.x, s.w + dx));
      const h = s.kind === "image" ? (w * s.h) / s.w : Math.max(0.01, Math.min(1 - s.y, s.h + dy));
      upd(d.id, { w, h });
    }
  };

  const addText = (text = "Double-click to edit") => add({ id: nextId(), kind: "text", page, x: 0.1, y: 0.1, w: 0.4, h: 0.04, text, size: 14, color: "#111827", font: "helvetica" });
  const addImage = async (f: File) => {
    const bmp = await createImageBitmap(f);
    const ratio = bmp.height / bmp.width;
    bmp.close();
    const mime = f.type === "image/png" ? "image/png" : "image/jpeg";
    const w = 0.3;
    add({ id: nextId(), kind: "image", page, x: 0.35, y: 0.4, w, h: (w * ratio) / aspect, bytes: new Uint8Array(await f.arrayBuffer()), mime });
  };

  const run = () =>
    task.run(async () => {
      if (!L) throw new Error("Add a PDF first.");
      if (!items.length) throw new Error(sign ? "Place your signature on a page first." : "Add at least one element.");
      const { applyEdits } = await import("@/lib/processors/pdf/annotate");
      return applyEdits(L.bytes, items, L.password);
    });

  const pageItems = items.filter((i) => i.page === page);

  return (
    <div className="space-y-4">
      <PdfPicker loader={loader} />
      {L ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
          <Panel
            title={
              <span className="flex items-center gap-2">
                <Button size="icon" variant="ghost" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
                Page {page} of {L.pageCount}
                <Button size="icon" variant="ghost" aria-label="Next page" disabled={page >= L.pageCount} onClick={() => setPage((p) => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
              </span>
            }
            actions={
              !sign ? (
                <>
                  <Button size="sm" variant="secondary" icon={<Type className="h-3.5 w-3.5" />} onClick={() => addText()}>Text</Button>
                  <Button size="sm" variant="secondary" icon={<Square className="h-3.5 w-3.5" />} onClick={() => add({ id: nextId(), kind: "rect", page, x: 0.2, y: 0.2, w: 0.3, h: 0.1, color: "#dc2626", fill: false, strokeWidth: 2 })}>Box</Button>
                  <Button size="sm" variant="secondary" icon={<Eraser className="h-3.5 w-3.5" />} onClick={() => add({ id: nextId(), kind: "whiteout", page, x: 0.2, y: 0.3, w: 0.3, h: 0.05, color: "#ffffff", fill: true, strokeWidth: 0 })}>Whiteout</Button>
                  <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-[13px] font-medium hover:bg-bg-muted">
                    <ImagePlus className="h-3.5 w-3.5" /> Image
                    <input type="file" accept="image/png,image/jpeg" className="sr-only" onChange={(e) => e.target.files?.[0] && addImage(e.target.files[0])} />
                  </label>
                </>
              ) : null
            }
          >
            <div ref={box} className="relative mx-auto max-w-[900px] touch-none select-none border border-border shadow-xs" onPointerMove={onMove} onPointerUp={() => (drag.current = null)} onPointerDown={() => setSel(null)}>
              <PageCanvas doc={L.doc} page={page} onSize={(w, _h, a) => (setAspect(a), setPtWidth(w))} />
              {pageItems.map((it) => (
                <div
                  key={it.id}
                  data-id={it.id}
                  onPointerDown={onDown}
                  className={cn("absolute cursor-move", sel === it.id ? "outline outline-2 outline-info" : "outline outline-1 outline-dashed outline-fg-subtle/40")}
                  style={{ left: `${it.x * 100}%`, top: `${it.y * 100}%`, width: `${it.w * 100}%`, height: it.kind === "text" ? "auto" : `${it.h * 100}%` }}
                >
                  {it.kind === "text" ? (
                    <div className="leading-[1.15] whitespace-pre-wrap" style={{ color: it.color, fontFamily: it.font.startsWith("times") ? "Times New Roman, serif" : it.font === "courier" ? "Courier New, monospace" : "Helvetica, Arial, sans-serif", fontWeight: it.font.endsWith("bold") ? 700 : 400 }}>
                      <TextScale size={it.size} ptWidth={ptWidth} boxRef={box}>{it.text}</TextScale>
                    </div>
                  ) : it.kind === "image" ? (
                    <ImgPreview bytes={it.bytes} mime={it.mime} />
                  ) : (
                    <div className="h-full w-full" style={{ background: it.kind === "whiteout" ? "#fff" : it.fill ? it.color : "transparent", border: it.kind === "rect" ? `${Math.max(1, it.strokeWidth)}px solid ${it.color}` : undefined }} />
                  )}
                  {sel === it.id ? <span data-id={it.id} data-mode="resize" onPointerDown={onDown} className="absolute -right-1.5 -bottom-1.5 h-3 w-3 cursor-nwse-resize rounded-sm border border-white bg-info" /> : null}
                </div>
              ))}
            </div>
          </Panel>
          <div className="space-y-4">
            {sign ? (
              <Panel title="Your signature">
                <SignaturePad onDone={(png, ratio) => { const w = 0.28; add({ id: nextId(), kind: "image", page, x: 0.55, y: 0.8, w, h: (w * ratio) / aspect, bytes: png, mime: "image/png" }); }} />
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" icon={<PenLine className="h-3.5 w-3.5" />} onClick={() => addText(new Date().toLocaleDateString())}>Add date</Button>
                  <Button size="sm" variant="secondary" icon={<Type className="h-3.5 w-3.5" />} onClick={() => addText("Name")}>Add text</Button>
                </div>
              </Panel>
            ) : null}
            <Panel title={selected ? "Selected element" : "Elements"}>
              {selected ? (
                <div className="space-y-3">
                  {selected.kind === "text" ? (
                    <>
                      <Field label="Text">{(id) => <Textarea id={id} value={selected.text} onChange={(e) => upd(selected.id, { text: e.target.value })} className="min-h-[80px] font-sans" />}</Field>
                      <Slider label="Size" value={selected.size} min={6} max={72} onChange={(v) => upd(selected.id, { size: v })} format={(v) => `${v}pt`} />
                      <Field label="Font">{(id) => <Select id={id} value={selected.font} onChange={(e) => upd(selected.id, { font: e.target.value as FontChoice })}><option value="helvetica">Helvetica</option><option value="helvetica-bold">Helvetica Bold</option><option value="times">Times</option><option value="times-bold">Times Bold</option><option value="courier">Courier</option></Select>}</Field>
                      <Field label="Colour">{(id) => <Input id={id} type="color" value={selected.color} onChange={(e) => upd(selected.id, { color: e.target.value })} className="h-9 w-20 p-1" />}</Field>
                    </>
                  ) : selected.kind === "rect" ? (
                    <>
                      <Field label="Colour">{(id) => <Input id={id} type="color" value={selected.color} onChange={(e) => upd(selected.id, { color: e.target.value })} className="h-9 w-20 p-1" />}</Field>
                      <Slider label="Border" value={selected.strokeWidth} min={0} max={10} onChange={(v) => upd(selected.id, { strokeWidth: v })} format={(v) => `${v}pt`} />
                      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selected.fill} onChange={(e) => upd(selected.id, { fill: e.target.checked })} /> Filled</label>
                    </>
                  ) : (
                    <p className="text-sm text-fg-muted">Drag to move; drag the corner handle to resize.</p>
                  )}
                  <Button size="sm" variant="danger" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => (setItems((l) => l.filter((i) => i.id !== selected.id)), setSel(null))}>Delete</Button>
                </div>
              ) : (
                <p className="text-sm text-fg-muted" data-testid="output">{items.length ? `${items.length} element(s) on ${new Set(items.map((i) => i.page)).size} page(s). Click one to edit it.` : sign ? "Create your signature above, then drag it into place." : "Add text, boxes, whiteout or images with the toolbar."}</p>
              )}
            </Panel>
          </div>
        </div>
      ) : null}
      <ActionBar onRun={run} runLabel={sign ? "Save signed PDF" : "Save PDF"} running={task.running} disabled={!L || !items.length} onReset={() => (loader.reset(), setItems([]), setSel(null), setPage(1), task.reset())} />
      <TaskProgress running={task.running} progress={null} label="Saving…" />
      <ErrorMessage error={task.error} />
      {task.result && L ? (
        <PdfOutput bytes={task.result.bytes} name={outName(L.file.name, sign ? "-signed" : "-edited")} label={sign ? "Signed PDF" : "Edited PDF"}>
          <ReplacedCharsNotice count={task.result.replacedChars} />
        </PdfOutput>
      ) : null}
      <Alert tone="info">
        {sign
          ? "This adds a visual signature image to the page, like signing a printout. It is not a certificate-based digital signature (PAdES), so it doesn't cryptographically prove who signed or detect later changes."
          : "Elements are drawn onto the page. Whiteout hides content visually, but the original text underneath remains in the file – use it for appearance, not for redacting confidential data."}
      </Alert>
    </div>
  );
}

/** Scales preview text so its size in PDF points matches the rendered page width. */
function TextScale({ size, ptWidth, boxRef, children }: { size: number; ptWidth: number; boxRef: RefObject<HTMLDivElement | null>; children: string }) {
  const [w, setW] = useState(800);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [boxRef]);
  return <span style={{ fontSize: (size * w) / ptWidth }}>{children}</span>;
}

function ImgPreview({ bytes, mime }: { bytes: Uint8Array; mime: string }) {
  const blob = useMemo(() => new Blob([bytes as BlobPart], { type: mime }), [bytes, mime]);
  const url = useObjectUrl(blob);
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img src={url} alt="" className="pointer-events-none h-full w-full object-contain" draggable={false} /> : null;
}
