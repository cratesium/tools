"use client";

import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { ToolComponentProps } from "@/types/tool";
import { Segmented } from "@/components/ui/field";
import { Stat } from "@/components/ui/feedback";
import { ActionBar, Panel } from "@/components/tools/shared";
import { buildFolderTree, sortTree, statsByExtension, type FolderNode, type TreeSort } from "@/lib/processors/files/folder";
import { formatBytes } from "@/lib/utils/format";
import { FolderPicker, FolderSummary, toRecords, type PickedFolder } from "./common";

function Node({ node, total, depth }: { node: FolderNode; total: number; depth: number }) {
  const [open, setOpen] = useState(depth < 1);
  const pct = total ? (node.size / total) * 100 : 0;
  return (
    <li>
      <div className="flex items-center gap-2 py-1 text-[13px]" style={{ paddingLeft: depth * 16 }}>
        {node.directory ? (
          <button className="flex items-center gap-1 text-left font-medium text-fg" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            <ChevronRight className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-90" : ""}`} aria-hidden />
            {node.name || "(root)"}/
          </button>
        ) : (
          <span className="truncate pl-[18px] text-fg-muted">{node.name}</span>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <div className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-bg-muted sm:block">
            <div className="h-full bg-fg/60" style={{ width: `${pct}%` }} />
          </div>
          <span className="w-12 text-right text-xs text-fg-subtle">{pct.toFixed(1)}%</span>
          <span className="w-20 text-right font-mono text-xs">{formatBytes(node.size)}</span>
        </div>
      </div>
      {node.directory && open ? (
        <ul>
          {node.children.slice(0, 300).map((c) => (
            <Node key={c.path || c.name} node={c} total={total} depth={depth + 1} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export default function FolderSize(_props: ToolComponentProps) {
  const [folder, setFolder] = useState<PickedFolder | null>(null);
  const [sort, setSort] = useState<TreeSort>("size");
  const records = useMemo(() => (folder ? toRecords(folder.files) : []), [folder]);
  const tree = useMemo(() => (folder ? sortTree(buildFolderTree(records, folder.name), sort) : null), [records, folder, sort]);
  const exts = useMemo(() => statsByExtension(records).slice(0, 15), [records]);
  return (
    <div className="space-y-4">
      {folder ? <FolderSummary folder={folder} onClear={() => setFolder(null)} /> : <FolderPicker onPick={setFolder} label="Drop a folder to measure" />}
      {tree ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Total size" value={formatBytes(tree.size)} sub={`${tree.size.toLocaleString()} bytes`} />
            <Stat label="Files" value={tree.files.toLocaleString()} />
            <Stat label="Largest type" value={exts[0] ? `.${exts[0].ext}` : "—"} sub={exts[0] ? formatBytes(exts[0].size) : undefined} />
          </div>
          <Panel title="Folder tree" actions={<Segmented label="Sort" value={sort} onChange={setSort} options={[{ value: "size", label: "Size" }, { value: "name", label: "Name" }, { value: "files", label: "Files" }]} />}>
            <ul className="max-h-[520px] overflow-auto" data-testid="output">
              <Node node={tree} total={tree.size} depth={0} />
            </ul>
          </Panel>
          <Panel title="By file type">
            <ul className="space-y-1 text-[13px]">
              {exts.map((e) => (
                <li key={e.ext} className="flex items-center gap-3">
                  <span className="w-20 font-mono">.{e.ext}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg-muted">
                    <div className="h-full bg-fg/60" style={{ width: `${(e.size / (tree.size || 1)) * 100}%` }} />
                  </div>
                  <span className="w-16 text-right text-xs text-fg-subtle">{e.files} files</span>
                  <span className="w-20 text-right font-mono text-xs">{formatBytes(e.size)}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </>
      ) : null}
      <ActionBar onReset={() => setFolder(null)} />
    </div>
  );
}
