"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Stat } from "@/components/ui/feedback";
import { Dropzone } from "@/components/upload/dropzone";
import { ActionBar, DownloadButton, Panel } from "@/components/tools/shared";
import { formatBytes } from "@/lib/utils/format";

const UNITS: [string, number][] = [["KB (1000)", 1e3], ["KiB (1024)", 1024], ["MB (1000²)", 1e6], ["MiB (1024²)", 1024 ** 2], ["GB (1000³)", 1e9], ["GiB (1024³)", 1024 ** 3]];

export default function SizeChecker(_props: ToolComponentProps) {
  const [files, setFiles] = useState<File[]>([]);
  const total = files.reduce((s, f) => s + f.size, 0);
  const sorted = [...files].sort((a, b) => b.size - a.size);
  const csv = "name,bytes,human\n" + sorted.map((f) => `${JSON.stringify(f.name)},${f.size},${formatBytes(f.size)}`).join("\n");
  return (
    <div className="space-y-4">
      <Dropzone multiple formatsLabel="Any files – nothing is uploaded, only sizes are read" onFiles={(f) => setFiles((p) => [...p, ...f])} />
      {files.length ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Total size" value={formatBytes(total)} sub={`${total.toLocaleString()} bytes`} />
            <Stat label="Files" value={files.length} />
            <Stat label="Largest" value={formatBytes(sorted[0].size)} sub={sorted[0].name} />
          </div>
          <Panel title="Total in other units">
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 font-mono text-sm sm:grid-cols-3">
              {UNITS.map(([u, d]) => (
                <div key={u} className="flex justify-between gap-3">
                  <span className="text-fg-muted">{u}</span>
                  <span>{(total / d).toLocaleString(undefined, { maximumFractionDigits: 3 })}</span>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="Files by size" actions={<DownloadButton text={csv} filename="file-sizes.csv" label="CSV" size="sm" variant="secondary" />}>
            <ul className="max-h-96 divide-y divide-border overflow-auto text-sm" data-testid="output">
              {sorted.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center gap-3 py-1.5">
                  <span className="min-w-0 flex-1 truncate">{f.name}</span>
                  <span className="w-28 text-right font-mono text-fg">{formatBytes(f.size)}</span>
                  <span className="hidden w-36 text-right font-mono text-xs text-fg-subtle sm:block">{f.size.toLocaleString()} B</span>
                  <span className="hidden w-14 text-right text-xs text-fg-subtle sm:block">{total ? ((f.size / total) * 100).toFixed(1) : 0}%</span>
                </li>
              ))}
            </ul>
          </Panel>
        </>
      ) : null}
      <ActionBar onReset={() => setFiles([])} />
    </div>
  );
}
