"use client";


import type { ToolComponentProps } from "@/types/tool";
import { Badge } from "@/components/ui/feedback";
import { Dropzone } from "@/components/upload/dropzone";
import { ActionBar, Panel, TaskProgress } from "@/components/tools/shared";
import { compareExtension, detectFileType, looksLikeText, readHead, type ExtensionVerdict, type FileTypeInfo } from "@/lib/processors/files/signatures";
import { formatBytes } from "@/lib/utils/format";
import { useTask } from "@/lib/utils/hooks";

type Row = { name: string; size: number; browserType: string; detected: FileTypeInfo | null; text?: string; verdict: ExtensionVerdict; magic: string };

const VERDICT: Record<ExtensionVerdict, { label: string; cls: string }> = {
  match: { label: "Extension matches", cls: "text-success" },
  alias: { label: "Valid alternative extension", cls: "text-success" },
  mismatch: { label: "Extension does NOT match content", cls: "text-danger" },
  unknown: { label: "Unknown format", cls: "text-fg-subtle" },
  "no-extension": { label: "No extension", cls: "text-warning" },
};

export default function TypeChecker(_props: ToolComponentProps) {
  const task = useTask<Row[]>();
  const check = (files: File[]) =>
    task.run(async (ctx) => {
      const rows: Row[] = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const head = await readHead(f);
        const detected = detectFileType(head);
        const t = detected ? null : looksLikeText(head);
        rows.push({
          name: f.name,
          size: f.size,
          browserType: f.type || "—",
          detected,
          text: t?.text ? `Text${t.encoding ? ` (${t.encoding})` : ""}` : undefined,
          verdict: compareExtension(f.name, detected),
          magic: Array.from(head.slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join(" "),
        });
        ctx.progress((i + 1) / files.length);
      }
      return [...(task.result ?? []), ...rows];
    });
  return (
    <div className="space-y-4">
      <Dropzone multiple formatsLabel="Any files – only the first 34 KB of each is read" onFiles={check} />
      <TaskProgress running={task.running} progress={task.progress} label="Reading file signatures…" />
      {task.result?.length ? (
        <Panel title="Results">
          <ul className="divide-y divide-border" data-testid="output">
            {task.result.map((r, i) => (
              <li key={`${r.name}-${i}`} className="py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium text-fg">{r.name}</span>
                  <span className="font-mono text-xs text-fg-subtle">{formatBytes(r.size)}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                  <Badge>{r.detected ? `${r.detected.name} (.${r.detected.ext})` : r.text ?? "Unrecognised binary"}</Badge>
                  {r.detected ? <span className="font-mono text-xs text-fg-muted">{r.detected.mime}</span> : null}
                  <span className={`text-xs ${VERDICT[r.verdict].cls}`}>{r.text && r.verdict === "unknown" ? "Plain text file" : VERDICT[r.verdict].label}</span>
                </div>
                <div className="mt-1 text-xs text-fg-subtle">
                  Browser-reported type: <span className="font-mono">{r.browserType}</span> · First bytes: <span className="font-mono">{r.magic}</span>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
      <ActionBar onReset={task.reset} />
    </div>
  );
}
