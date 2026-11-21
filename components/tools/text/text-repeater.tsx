"use client";

import { useMemo, useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { ErrorMessage } from "@/components/tools/shared";
import { repeatText, MAX_REPEAT_OUTPUT } from "@/lib/processors/text/lines";
import { errorMessage, useDebounced } from "@/lib/utils/hooks";
import { TransformLayout } from "./common";

const SEPARATORS = [
  { value: "\n", label: "New line" },
  { value: "\n\n", label: "Blank line" },
  { value: " ", label: "Space" },
  { value: "", label: "Nothing" },
  { value: ", ", label: "Comma" },
  { value: "custom", label: "Custom…" },
];

export default function TextRepeater(_props: ToolComponentProps) {
  const [text, setText] = useState("");
  const [count, setCount] = useState(10);
  const [sep, setSep] = useState("\n");
  const [custom, setCustom] = useState(" | ");
  const [numbered, setNumbered] = useState(false);
  const input = useDebounced(text, 150);
  const dCount = useDebounced(count, 150);

  const { output, error } = useMemo(() => {
    try {
      const separator = sep === "custom" ? custom.replace(/\\n/g, "\n").replace(/\\t/g, "\t") : sep;
      return { output: repeatText(input, { count: dCount, separator, numbered }), error: null };
    } catch (e) {
      return { output: "", error: errorMessage(e) };
    }
  }, [input, dCount, sep, custom, numbered]);

  return (
    <TransformLayout
      input={text}
      onInput={setText}
      placeholder="Text to repeat…"
      options={
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Repeat" hint="times">
            {(id) => (
              <Input
                id={id}
                type="number"
                min={1}
                max={100000}
                value={count}
                onChange={(e) => setCount(Math.max(0, Math.min(100000, Number(e.target.value) || 0)))}
              />
            )}
          </Field>
          <Field label="Separator">
            {(id) => (
              <Select id={id} value={sep} onChange={(e) => setSep(e.target.value)}>
                {SEPARATORS.map((s) => (
                  <option key={s.label} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {sep === "custom" ? (
            <Field label="Custom separator" hint="\n = newline, \t = tab">
              {(id) => <Input id={id} value={custom} onChange={(e) => setCustom(e.target.value)} />}
            </Field>
          ) : null}
          <div className="flex items-end pb-1.5">
            <Checkbox label="Number each copy" checked={numbered} onChange={setNumbered} />
          </div>
        </div>
      }
      output={output}
      outputLabel="Repeated text"
      filename="repeated.txt"
      summary={
        error ? (
          <ErrorMessage error={error} />
        ) : output ? (
          `${output.length.toLocaleString("en-US")} characters (limit ${MAX_REPEAT_OUTPUT.toLocaleString("en-US")})`
        ) : null
      }
      onReset={() => {
        setText("");
        setCount(10);
        setSep("\n");
        setCustom(" | ");
        setNumbered(false);
      }}
    />
  );
}
