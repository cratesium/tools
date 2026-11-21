"use client";

import { useMemo, useState } from "react";
import { Shuffle } from "lucide-react";
import type { ToolComponentProps } from "@/types/tool";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Select } from "@/components/ui/field";
import { defaultSortOptions, sortLines, type SortMethod, type SortOptions } from "@/lib/processors/text/lines";
import { useDebounced } from "@/lib/utils/hooks";
import { TransformLayout } from "./common";

const METHODS: { value: SortMethod; label: string }[] = [
  { value: "alphabetical", label: "Alphabetical (A → Z)" },
  { value: "natural", label: "Natural (item2 before item10)" },
  { value: "length", label: "By length (shortest first)" },
  { value: "reverse-order", label: "Reverse current order" },
  { value: "random", label: "Random shuffle" },
];

const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];

export default function SortLinesTool(_props: ToolComponentProps) {
  const [text, setText] = useState("");
  const [o, setO] = useState<SortOptions>({ ...defaultSortOptions, seed: 1 });
  const input = useDebounced(text, 120);
  const output = useMemo(() => sortLines(input, o), [input, o]);
  const lines = output ? output.split("\n").length : 0;
  const ordered = o.method !== "random" && o.method !== "reverse-order";

  return (
    <TransformLayout
      input={text}
      onInput={setText}
      placeholder={"One item per line\nbanana\nApple\ncherry"}
      options={
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Sort by">
            {(id) => (
              <Select
                id={id}
                value={o.method}
                onChange={(e) => {
                  const method = e.target.value as SortMethod;
                  setO({ ...o, method, seed: method === "random" ? randomSeed() : o.seed });
                }}
              >
                {METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <div className="space-y-2">
            <Checkbox label="Descending (Z → A)" checked={o.descending} disabled={!ordered} onChange={(v) => setO({ ...o, descending: v })} />
            <Checkbox label="Case-sensitive" description="Otherwise apple = Apple" checked={o.caseSensitive} onChange={(v) => setO({ ...o, caseSensitive: v })} />
          </div>
          <div className="space-y-2">
            <Checkbox label="Remove empty lines" checked={o.removeEmpty} onChange={(v) => setO({ ...o, removeEmpty: v })} />
            <Checkbox label="Remove duplicates" checked={o.dedupe} onChange={(v) => setO({ ...o, dedupe: v })} />
            <Checkbox label="Trim spaces" checked={o.trim} onChange={(v) => setO({ ...o, trim: v })} />
          </div>
          {o.method === "random" ? (
            <div className="flex items-end">
              <Button variant="secondary" icon={<Shuffle className="h-4 w-4" />} onClick={() => setO({ ...o, seed: randomSeed() })}>
                Shuffle again
              </Button>
            </div>
          ) : null}
        </div>
      }
      output={output}
      outputLabel="Sorted lines"
      filename="sorted.txt"
      summary={input ? `${lines.toLocaleString("en-US")} lines` : null}
      onReset={() => {
        setText("");
        setO({ ...defaultSortOptions, seed: 1 });
      }}
    />
  );
}
