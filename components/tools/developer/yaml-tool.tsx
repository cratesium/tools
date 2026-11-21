"use client";

import { useMemo, useRef, useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox, Field, Select } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { ActionBar, KeyValueTable, Panel, Settings, TextOutput } from "@/components/tools/shared";
import { validateYaml, valueToYaml } from "@/lib/processors/developer/yaml";
import { formatBytes } from "@/lib/utils/format";
import { useDebounced } from "@/lib/utils/hooks";
import { CodeInput, LocatedError, sizeOf, toLocated } from "./code-panels";

const SAMPLE = `# Service configuration
service: {name: api, replicas: 3}
env:
    - name: NODE_ENV
      value: production
    - {name: PORT, value: "8080"}
resources:
  limits: {cpu: "500m", memory: 512Mi}
`;
const SAMPLE_BAD = `server:
  host: localhost
  ports:
    - 80
   - 443
`;

function kind(v: unknown): string {
  if (Array.isArray(v)) return `sequence (${v.length} items)`;
  if (v === null) return "null";
  if (typeof v === "object") return `mapping (${Object.keys(v as object).length} keys)`;
  return typeof v;
}

/** YAML Formatter (mode "format") and YAML Validator (mode "validate"). */
export default function YamlTool({ tool }: ToolComponentProps) {
  const mode = (tool.processorOptions?.mode as "format" | "validate") ?? "format";
  const [text, setText] = useState("");
  const [indent, setIndent] = useState(2);
  const [sortKeys, setSortKeys] = useState(false);
  const [lineWidth, setLineWidth] = useState(80);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const debounced = useDebounced(text, 200);

  const result = useMemo(() => {
    if (!debounced.trim()) return null;
    const v = validateYaml(debounced);
    if (!v.valid) return { ok: false as const, error: toLocated(v.error) };
    if (mode === "validate") return { ok: true as const, docs: v.documents, output: "" };
    try {
      const output = v.documents
        .map((d) => valueToYaml(d, { indent, sortKeys, lineWidth: lineWidth || -1 }))
        .join("---\n");
      return { ok: true as const, docs: v.documents, output };
    } catch (e) {
      return { ok: false as const, error: toLocated(e) };
    }
  }, [debounced, mode, indent, sortKeys, lineWidth]);

  return (
    <div className="space-y-4">
      <CodeInput
        value={text}
        onChange={setText}
        inputRef={inputRef}
        label="YAML"
        placeholder="Paste YAML here…"
        sample={mode === "validate" ? SAMPLE_BAD : SAMPLE}
        accept=".yaml,.yml,text/yaml,application/yaml"
      />
      {mode === "format" ? (
        <Settings>
          <Field label="Indentation">
            {(id) => (
              <Select id={id} value={indent} onChange={(e) => setIndent(Number(e.target.value))}>
                <option value={2}>2 spaces</option>
                <option value={4}>4 spaces</option>
              </Select>
            )}
          </Field>
          <Field label="Line width">
            {(id) => (
              <Select id={id} value={lineWidth} onChange={(e) => setLineWidth(Number(e.target.value))}>
                <option value={80}>80 characters</option>
                <option value={120}>120 characters</option>
                <option value={0}>No wrapping</option>
              </Select>
            )}
          </Field>
          <Checkbox label="Sort keys alphabetically" checked={sortKeys} onChange={setSortKeys} />
        </Settings>
      ) : null}

      {result && !result.ok ? <LocatedError error={result.error} inputRef={inputRef} title="Invalid YAML" /> : null}

      {result?.ok && mode === "validate" ? (
        <>
          <Alert tone="success" title="Valid YAML">
            The document parses without errors (YAML 1.2 core schema).
          </Alert>
          <Panel title="Summary">
            <KeyValueTable
              rows={[
                ["Documents", String(result.docs.length)],
                ...result.docs.slice(0, 10).map((d, i) => [`Document ${i + 1}`, kind(d)] as [string, string]),
                ["Size", formatBytes(sizeOf(debounced))],
              ]}
            />
          </Panel>
        </>
      ) : null}

      {result?.ok && mode === "format" ? (
        <>
          <Alert tone="info">Comments are not preserved when YAML is re-serialized; anchors and aliases are expanded.</Alert>
          <TextOutput value={result.output} filename="formatted.yaml" mime="application/yaml" />
        </>
      ) : null}

      <ActionBar
        onReset={() => {
          setText("");
          setIndent(2);
          setSortKeys(false);
          setLineWidth(80);
        }}
      />
    </div>
  );
}
