"use client";

import { useMemo, useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox } from "@/components/ui/field";
import { defaultWhitespaceOptions, removeExtraSpaces, type WhitespaceOptions } from "@/lib/processors/text/lines";
import { useDebounced } from "@/lib/utils/hooks";
import { TransformLayout } from "./common";

const OPTS: { key: keyof WhitespaceOptions; label: string; description: string }[] = [
  { key: "collapseSpaces", label: "Collapse repeated spaces", description: "Turn runs of spaces into one" },
  { key: "trimLines", label: "Trim each line", description: "Remove leading and trailing spaces" },
  { key: "tabsToSpaces", label: "Convert tabs to spaces", description: "Each tab becomes one space" },
  { key: "normalizeUnicodeSpaces", label: "Fix invisible characters", description: "Non-breaking → normal, zero-width removed" },
  { key: "collapseBlankLines", label: "Collapse blank lines", description: "Keep at most one empty line" },
  { key: "removeBlankLines", label: "Remove all blank lines", description: "Delete every empty line" },
  { key: "removeLineBreaks", label: "Join into one line", description: "Replace line breaks with spaces" },
  { key: "fixPunctuationSpacing", label: "Remove space before punctuation", description: "\"word ,\" → \"word,\"" },
];

export default function RemoveExtraSpaces(_props: ToolComponentProps) {
  const [text, setText] = useState("");
  const [o, setO] = useState<WhitespaceOptions>(defaultWhitespaceOptions);
  const input = useDebounced(text, 120);
  const output = useMemo(() => removeExtraSpaces(input, o), [input, o]);
  const removed = [...input].length - [...output].length;

  return (
    <TransformLayout
      input={text}
      onInput={setText}
      placeholder="Paste text with messy spacing, e.g. copied from a PDF or email…"
      options={
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {OPTS.map((x) => (
            <Checkbox key={x.key} label={x.label} description={x.description} checked={o[x.key]} onChange={(v) => setO({ ...o, [x.key]: v })} />
          ))}
        </div>
      }
      output={output}
      outputLabel="Cleaned text"
      filename="cleaned.txt"
      summary={input ? `${removed.toLocaleString("en-US")} whitespace characters removed` : null}
      onReset={() => {
        setText("");
        setO(defaultWhitespaceOptions);
      }}
    />
  );
}
