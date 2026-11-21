"use client";

import { useMemo, useRef, useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox, Field, Select } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { ActionBar, KeyValueTable, Panel, Settings, TextOutput } from "@/components/tools/shared";
import {
  type Indent,
  findUnsafeIntegerLiterals,
  jsonStats,
  parseJsonDetailed,
  parseRelaxedJson,
  stringifyJson,
} from "@/lib/processors/developer/json";
import { formatBytes, formatNumber } from "@/lib/utils/format";
import { useDebounced } from "@/lib/utils/hooks";
import { CodeInput, LocatedError, Stats, sizeOf, toLocated } from "./code-panels";

type Mode = "format" | "validate" | "minify" | "beautify";

const SAMPLES: Record<Mode, string> = {
  format: '{"id":1024,"name":"Widget","tags":["blue","large"],"price":{"amount":19.99,"currency":"EUR"},"inStock":true,"variants":[{"sku":"W-1","qty":4},{"sku":"W-2","qty":0}]}',
  validate: '{\n  "service": "api",\n  "port": 8080,\n  "replicas": 3\n  "debug": false\n}',
  minify: '{\n  "user": {\n    "id": 42,\n    "roles": [\n      "editor",\n      "viewer"\n    ]\n  },\n  "active": true\n}',
  beautify: "// tsconfig-style input with comments\n{\n  compilerOptions: {\n    target: 'ES2022',\n    strict: true, /* keep strict */\n    paths: { '@/*': ['./*'], },\n  },\n  include: ['src', 'tests',],\n}",
};

export default function JsonTool({ tool }: ToolComponentProps) {
  const mode = ((tool.processorOptions?.mode as Mode) ?? "format") as Mode;
  const [text, setText] = useState("");
  const [indent, setIndent] = useState<Indent>(2);
  const [sortKeys, setSortKeys] = useState(false);
  const [escapeUnicode, setEscapeUnicode] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const debounced = useDebounced(text, 200);

  const result = useMemo(() => {
    if (!debounced.trim()) return null;
    try {
      const parsed = mode === "beautify" ? parseRelaxedJson(debounced) : parseJsonDetailed(debounced);
      const output =
        mode === "validate"
          ? ""
          : stringifyJson(parsed.value, { indent: mode === "minify" ? 0 : indent, sortKeys, escapeUnicode: mode === "minify" ? false : escapeUnicode });
      return {
        ok: true as const,
        output,
        stats: jsonStats(parsed.value),
        repairs: parsed.repairs,
        duplicates: parsed.duplicateKeys,
        unsafe: findUnsafeIntegerLiterals(debounced),
      };
    } catch (e) {
      return { ok: false as const, error: toLocated(e) };
    }
  }, [debounced, mode, indent, sortKeys, escapeUnicode]);

  const reset = () => {
    setText("");
    setSortKeys(false);
    setEscapeUnicode(false);
    setIndent(2);
  };

  const repairList =
    result?.ok && mode === "beautify"
      ? ([
          ["comment", result.repairs.comments],
          ["trailing comma", result.repairs.trailingCommas],
          ["single-quoted string", result.repairs.singleQuotedStrings],
          ["unquoted key", result.repairs.unquotedKeys],
          ["non-standard number", result.repairs.otherNumbers],
        ] as [string, number][]).filter(([, n]) => n > 0)
      : [];

  return (
    <div className="space-y-4">
      <CodeInput
        value={text}
        onChange={setText}
        inputRef={inputRef}
        label={mode === "beautify" ? "Relaxed JSON, JSONC or JS object literal" : "JSON"}
        placeholder={mode === "beautify" ? "Paste JSON with comments, trailing commas, single quotes or unquoted keys…" : "Paste JSON here…"}
        sample={SAMPLES[mode]}
        accept=".json,.jsonc,.json5,.txt,application/json"
      />

      {mode !== "validate" ? (
        <Settings>
          {mode !== "minify" ? (
            <Field label="Indentation">
              {(id) => (
                <Select id={id} value={String(indent)} onChange={(e) => setIndent((e.target.value === "tab" ? "tab" : Number(e.target.value)) as Indent)}>
                  <option value="2">2 spaces</option>
                  <option value="4">4 spaces</option>
                  <option value="8">8 spaces</option>
                  <option value="tab">Tabs</option>
                </Select>
              )}
            </Field>
          ) : null}
          <div className="space-y-2 pt-1">
            <Checkbox label="Sort keys alphabetically" description="Recursively, arrays keep their order" checked={sortKeys} onChange={setSortKeys} />
            {mode !== "minify" ? (
              <Checkbox label="Escape non-ASCII characters" description="Write é as é for ASCII-only output" checked={escapeUnicode} onChange={setEscapeUnicode} />
            ) : null}
          </div>
        </Settings>
      ) : null}

      {result && !result.ok ? <LocatedError error={result.error} inputRef={inputRef} title={mode === "validate" ? "Invalid JSON" : "Could not parse JSON"} /> : null}

      {result?.ok && mode === "validate" ? (
        <Alert tone="success" title="Valid JSON">
          The input is well-formed JSON (RFC 8259). Top-level value: {result.stats.type}.
        </Alert>
      ) : null}

      {result?.ok && result.duplicates.length ? (
        <Alert tone="warning" title="Duplicate keys">
          {result.duplicates.slice(0, 10).join(", ")} appear more than once in the same object. Most parsers keep only the last value.
        </Alert>
      ) : null}
      {result?.ok && result.unsafe.length ? (
        <Alert tone="warning" title="Large integers lose precision">
          {result.unsafe.slice(0, 5).join(", ")} exceed 2^53 − 1. JavaScript (and this tool&apos;s output) rounds them; quote them as strings if exact digits matter.
        </Alert>
      ) : null}
      {repairList.length ? (
        <Alert tone="info" title="Repaired">
          Fixed {repairList.map(([k, n]) => `${n} ${k}${n === 1 ? "" : "s"}`).join(", ")}. Comments cannot be kept in strict JSON and were removed.
        </Alert>
      ) : null}

      {result?.ok && mode !== "validate" ? (
        <TextOutput
          value={result.output}
          filename={mode === "minify" ? "minified.json" : "formatted.json"}
          mime="application/json"
          label={
            <span className="flex flex-wrap items-center gap-3">
              Result
              <Stats
                items={[
                  ["Input", formatBytes(sizeOf(debounced))],
                  ["Output", formatBytes(sizeOf(result.output))],
                ]}
              />
            </span>
          }
          rows={mode === "minify" ? 6 : 16}
        />
      ) : null}

      {result?.ok && mode === "validate" ? (
        <Panel title="Structure">
          <KeyValueTable
            rows={[
              ["Top-level type", result.stats.type],
              ["Maximum depth", formatNumber(result.stats.depth, 0)],
              ["Objects", formatNumber(result.stats.objects, 0)],
              ["Arrays", formatNumber(result.stats.arrays, 0)],
              ["Keys", formatNumber(result.stats.keys, 0)],
              ["Strings / numbers", `${formatNumber(result.stats.strings, 0)} / ${formatNumber(result.stats.numbers, 0)}`],
              ["Booleans / nulls", `${formatNumber(result.stats.booleans, 0)} / ${formatNumber(result.stats.nulls, 0)}`],
              ["Size", formatBytes(sizeOf(debounced))],
            ]}
          />
        </Panel>
      ) : null}

      <ActionBar onReset={reset} />
    </div>
  );
}
