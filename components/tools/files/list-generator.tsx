"use client";

import { useMemo, useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox, Field, Segmented, Select } from "@/components/ui/field";
import { ActionBar, TextOutput } from "@/components/tools/shared";
import { generateFileList, type ListFormat, type ListOptions } from "@/lib/processors/files/folder";
import { FolderPicker, FolderSummary, toRecords, type PickedFolder } from "./common";

const MIME: Record<ListFormat, string> = { txt: "text/plain", csv: "text/csv", json: "application/json", md: "text/markdown" };

export default function ListGenerator(_props: ToolComponentProps) {
  const [folder, setFolder] = useState<PickedFolder | null>(null);
  const [o, setO] = useState<ListOptions>({ format: "txt", includePath: true, includeSize: true, includeDate: false, includeExtension: false, humanSize: true, sort: "path" });
  const set = <K extends keyof ListOptions>(k: K, v: ListOptions[K]) => setO((x) => ({ ...x, [k]: v }));
  const out = useMemo(() => (folder ? generateFileList(toRecords(folder.files), o) : ""), [folder, o]);
  return (
    <div className="space-y-4">
      {folder ? <FolderSummary folder={folder} onClear={() => setFolder(null)} /> : <FolderPicker onPick={setFolder} allowFiles label="Drop a folder to list its files" />}
      <div className="flex flex-wrap items-end gap-4">
        <Segmented label="Format" value={o.format} onChange={(v) => set("format", v)} options={[{ value: "txt", label: "Text" }, { value: "csv", label: "CSV" }, { value: "json", label: "JSON" }, { value: "md", label: "Markdown" }]} />
        <Field label="Sort by" className="w-40">
          {(id) => (
            <Select id={id} value={o.sort} onChange={(e) => set("sort", e.target.value as ListOptions["sort"])}>
              <option value="path">Path</option>
              <option value="name">Name</option>
              <option value="size">Size (largest first)</option>
              <option value="date">Date (newest first)</option>
            </Select>
          )}
        </Field>
      </div>
      <div className="flex flex-wrap gap-5">
        <Checkbox label="Full path" checked={o.includePath} onChange={(v) => set("includePath", v)} />
        <Checkbox label="Size" checked={o.includeSize} onChange={(v) => set("includeSize", v)} />
        {o.includeSize ? <Checkbox label="Human-readable sizes" checked={!!o.humanSize} onChange={(v) => set("humanSize", v)} /> : null}
        <Checkbox label="Modified date" checked={o.includeDate} onChange={(v) => set("includeDate", v)} />
        <Checkbox label="Extension column" checked={!!o.includeExtension} onChange={(v) => set("includeExtension", v)} />
      </div>
      {out ? <TextOutput value={out} filename={`file-list.${o.format}`} mime={MIME[o.format]} label={`${folder?.files.length} files`} rows={14} /> : null}
      <ActionBar onReset={() => setFolder(null)} />
    </div>
  );
}
