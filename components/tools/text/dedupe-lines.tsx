"use client";

import { useMemo, useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox, Field, Select } from "@/components/ui/field";
import { Panel } from "@/components/tools/shared";
import { dedupeLines, defaultDedupeOptions, type DedupeOptions } from "@/lib/processors/text/lines";
import { useDebounced } from "@/lib/utils/hooks";
import { TransformLayout } from "./common";

export default function DedupeLines(_props: ToolComponentProps) {
  const [text, setText] = useState("");
  const [o, setO] = useState<DedupeOptions>(defaultDedupeOptions);
  const input = useDebounced(text, 120);
  const r = useMemo(() => dedupeLines(input, o), [input, o]);

  return (
    <TransformLayout
      input={text}
      onInput={setText}
      placeholder={"One item per line, e.g.\napple\nbanana\napple"}
      options={
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Output">
            {(id) => (
              <Select id={id} value={o.mode} onChange={(e) => setO({ ...o, mode: e.target.value as DedupeOptions["mode"] })}>
                <option value="dedupe">Remove duplicates (keep one of each)</option>
                <option value="unique">Only lines that appear once</option>
                <option value="duplicates">Only lines that repeat</option>
              </Select>
            )}
          </Field>
          <Field label="When repeated, keep">
            {(id) => (
              <Select id={id} value={o.keep} onChange={(e) => setO({ ...o, keep: e.target.value as DedupeOptions["keep"] })}>
                <option value="first">First occurrence</option>
                <option value="last">Last occurrence</option>
              </Select>
            )}
          </Field>
          <div className="space-y-2 sm:col-span-2">
            <Checkbox label="Case-sensitive" description="Apple and apple are different" checked={o.caseSensitive} onChange={(v) => setO({ ...o, caseSensitive: v })} />
            <Checkbox label="Ignore extra whitespace" description="Compare after trimming and collapsing spaces" checked={o.ignoreWhitespace} onChange={(v) => setO({ ...o, ignoreWhitespace: v })} />
            <Checkbox label="Remove empty lines" checked={o.removeEmpty} onChange={(v) => setO({ ...o, removeEmpty: v })} />
          </div>
        </div>
      }
      output={r.text}
      outputLabel="Unique lines"
      filename="deduplicated.txt"
      summary={
        input
          ? `${r.inputLines.toLocaleString("en-US")} lines in → ${r.outputLines.toLocaleString("en-US")} out (${r.removed.toLocaleString("en-US")} removed, ${r.duplicates.length} distinct lines repeated)`
          : null
      }
      extra={
        r.duplicates.length ? (
          <Panel title="Most repeated lines">
            <ul className="max-h-60 space-y-1 overflow-auto text-sm">
              {r.duplicates.slice(0, 25).map(([line, n], i) => (
                <li key={i} className="flex justify-between gap-4">
                  <span className="truncate font-mono text-[13px] text-fg">{line === "" ? <em className="text-fg-subtle">(empty line)</em> : line}</span>
                  <span className="shrink-0 font-mono text-fg-muted">×{n}</span>
                </li>
              ))}
            </ul>
          </Panel>
        ) : null
      }
      onReset={() => {
        setText("");
        setO(defaultDedupeOptions);
      }}
    />
  );
}
