"use client";

import { useMemo, useState } from "react";
import { ArrowDownUp } from "lucide-react";
import type { ToolComponentProps } from "@/types/tool";
import { Button } from "@/components/ui/button";
import { Field, Segmented, Select } from "@/components/ui/field";
import { ErrorMessage } from "@/components/tools/shared";
import { decode, detectScheme, encode, SCHEMES, type Scheme } from "@/lib/processors/text/encoder";
import { errorMessage, useDebounced } from "@/lib/utils/hooks";
import { TransformLayout } from "./common";

export default function TextEncoder(_props: ToolComponentProps) {
  const [text, setText] = useState("");
  const [scheme, setScheme] = useState<Scheme>("base64");
  const [dir, setDir] = useState<"encode" | "decode">("encode");
  const input = useDebounced(text, 100);

  const { output, error } = useMemo(() => {
    if (!input) return { output: "", error: null };
    try {
      return { output: dir === "encode" ? encode(input, scheme) : decode(input, scheme), error: null };
    } catch (e) {
      return { output: "", error: errorMessage(e) };
    }
  }, [input, scheme, dir]);

  const guess = dir === "decode" ? detectScheme(input) : null;
  const meta = SCHEMES.find((s) => s.value === scheme)!;

  return (
    <TransformLayout
      input={text}
      onInput={setText}
      inputLabel={dir === "encode" ? "Plain text" : `${meta.label} input`}
      placeholder={dir === "encode" ? "Text to encode…" : "Encoded text to decode…"}
      options={
        <div className="flex flex-wrap items-end gap-4">
          <Field label="Direction">
            {() => (
              <Segmented
                label="Direction"
                value={dir}
                onChange={setDir}
                options={[
                  { value: "encode", label: "Encode" },
                  { value: "decode", label: "Decode" },
                ]}
              />
            )}
          </Field>
          <Field label="Scheme" hint={meta.hint} className="min-w-64">
            {(id) => (
              <Select id={id} value={scheme} onChange={(e) => setScheme(e.target.value as Scheme)}>
                {SCHEMES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Button
            variant="secondary"
            icon={<ArrowDownUp className="h-4 w-4" />}
            disabled={!output}
            onClick={() => {
              setText(output);
              setDir(dir === "encode" ? "decode" : "encode");
            }}
          >
            Use output as input
          </Button>
        </div>
      }
      output={output}
      outputLabel={dir === "encode" ? `${meta.label} output` : "Decoded text"}
      filename={`${dir}d-${scheme}.txt`}
      summary={
        error ? (
          <ErrorMessage error={error} />
        ) : guess && guess !== scheme ? (
          <span>
            This looks like <strong>{SCHEMES.find((s) => s.value === guess)?.label}</strong>.{" "}
            <button type="button" className="underline" onClick={() => setScheme(guess)}>
              Switch scheme
            </button>
          </span>
        ) : null
      }
      onReset={() => {
        setText("");
        setScheme("base64");
        setDir("encode");
      }}
    />
  );
}
