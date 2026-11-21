"use client";

import { useMemo, useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox, Field, Input, Segmented } from "@/components/ui/field";
import { ActionBar, TextOutput } from "@/components/tools/shared";
import { splitName } from "@/lib/processors/files/rename";
import { FolderPicker, FolderSummary, type PickedFolder } from "./common";

export default function NameExtractor(_props: ToolComponentProps) {
  const [folder, setFolder] = useState<PickedFolder | null>(null);
  const [what, setWhat] = useState<"name" | "base" | "path" | "ext">("name");
  const [unique, setUnique] = useState(false);
  const [sort, setSort] = useState(true);
  const [sep, setSep] = useState("\\n");
  const [wrap, setWrap] = useState("");
  const out = useMemo(() => {
    if (!folder) return "";
    let list = folder.files.map((p) => {
      const name = p.file.name;
      if (what === "path") return p.path;
      if (what === "base") return splitName(name).base;
      if (what === "ext") return splitName(name).ext.toLowerCase();
      return name;
    });
    if (what === "ext") list = list.filter(Boolean);
    if (unique) list = [...new Set(list)];
    if (sort) list.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    return list.map((s) => `${wrap}${s}${wrap}`).join(sep.replace(/\\n/g, "\n").replace(/\\t/g, "\t"));
  }, [folder, what, unique, sort, sep, wrap]);
  return (
    <div className="space-y-4">
      {folder ? <FolderSummary folder={folder} onClear={() => setFolder(null)} /> : <FolderPicker onPick={setFolder} allowFiles label="Drop files or a folder" />}
      <Segmented label="Extract" value={what} onChange={setWhat} options={[{ value: "name", label: "Name with extension" }, { value: "base", label: "Name without extension" }, { value: "path", label: "Relative path" }, { value: "ext", label: "Extensions" }]} />
      <div className="flex flex-wrap items-end gap-4">
        <Field label="Separator" hint="\n new line, \t tab" className="w-40">{(id) => <Input id={id} value={sep} onChange={(e) => setSep(e.target.value)} />}</Field>
        <Field label="Wrap each in" hint='e.g. " for quotes' className="w-32">{(id) => <Input id={id} value={wrap} onChange={(e) => setWrap(e.target.value)} maxLength={2} />}</Field>
        <Checkbox label="Sort" checked={sort} onChange={setSort} />
        <Checkbox label="Remove duplicates" checked={unique} onChange={setUnique} />
      </div>
      {out ? <TextOutput value={out} filename="file-names.txt" label="File names" rows={12} /> : null}
      <ActionBar onReset={() => setFolder(null)} />
    </div>
  );
}
