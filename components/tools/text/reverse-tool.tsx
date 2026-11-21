"use client";

import { useMemo, useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox, Segmented } from "@/components/ui/field";
import { reverseText, reverseWords, type ReverseMode } from "@/lib/processors/text/lines";
import { useDebounced } from "@/lib/utils/hooks";
import { TransformLayout } from "./common";

const TEXT_MODES: { value: ReverseMode; label: string }[] = [
  { value: "characters", label: "Whole text" },
  { value: "each-line", label: "Each line" },
  { value: "each-word", label: "Letters in each word" },
  { value: "line-order", label: "Line order" },
];

/** Reverse Text (processorOptions.target "text") and Reverse Words (target "words"). */
export default function ReverseTool({ tool }: ToolComponentProps) {
  const words = tool.processorOptions?.target === "words";
  const [text, setText] = useState("");
  const [mode, setMode] = useState<ReverseMode>("characters");
  const [scope, setScope] = useState<"line" | "all">("line");
  const [keepEnd, setKeepEnd] = useState(true);
  const input = useDebounced(text, 80);

  const output = useMemo(
    () => (words ? reverseWords(input, { scope, keepEndPunctuation: keepEnd }) : reverseText(input, mode)),
    [words, input, scope, keepEnd, mode],
  );

  const options = words ? (
    <div className="flex flex-wrap items-center gap-6">
      <Segmented
        label="Scope"
        value={scope}
        onChange={setScope}
        options={[
          { value: "line", label: "Within each line" },
          { value: "all", label: "Across the whole text" },
        ]}
      />
      <Checkbox label="Keep end punctuation in place" description="“Hello big world.” → “world big Hello.”" checked={keepEnd} onChange={setKeepEnd} />
    </div>
  ) : (
    <Segmented label="What to reverse" value={mode} onChange={setMode} options={TEXT_MODES} />
  );

  return (
    <TransformLayout
      input={text}
      onInput={setText}
      options={options}
      output={output}
      outputLabel={words ? "Words reversed" : "Reversed text"}
      filename={words ? "reversed-words.txt" : "reversed.txt"}
      onReset={() => {
        setText("");
        setMode("characters");
        setScope("line");
        setKeepEnd(true);
      }}
    />
  );
}
