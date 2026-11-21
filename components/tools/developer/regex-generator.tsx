"use client";

import { useMemo, useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox, Field, Segmented, Select, Textarea } from "@/components/ui/field";
import { Alert, Badge } from "@/components/ui/feedback";
import { ActionBar, CopyButton, Panel } from "@/components/tools/shared";
import { REGEX_PRESETS, checkExamples, inferRegex, toStringLiteral } from "@/lib/processors/developer/regex-generate";
import { cn } from "@/lib/utils/cn";

function Results({ pattern, flags, positives, negatives }: { pattern: string; flags: string; positives: string[]; negatives: string[] }) {
  const checks = useMemo(() => {
    try {
      return checkExamples(pattern, flags, positives, negatives);
    } catch {
      return [];
    }
  }, [pattern, flags, positives, negatives]);
  if (!checks.length) return null;
  const failed = checks.filter((c) => c.actual !== c.expected).length;
  return (
    <div className="space-y-2">
      <p className={cn("text-sm", failed ? "text-danger" : "text-success")}>
        {failed ? `${failed} example(s) do not behave as expected` : "All examples behave as expected"}
      </p>
      <ul className="space-y-1 font-mono text-[13px]">
        {checks.map((c, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className={c.actual === c.expected ? "text-success" : "text-danger"}>{c.actual === c.expected ? "✓" : "✗"}</span>
            <span className="break-all">{c.text || <em>empty</em>}</span>
            <span className="text-fg-subtle">{c.expected ? "should match" : "should not match"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PatternBox({ pattern, flags }: { pattern: string; flags: string }) {
  const literal = `/${pattern}/${flags}`;
  return (
    <Panel
      title="Generated regex"
      actions={
        <>
          <CopyButton text={literal} label="Copy /regex/" />
          <CopyButton text={toStringLiteral(pattern)} label="Copy as string" />
        </>
      }
    >
      <pre data-testid="output" className="overflow-x-auto rounded-lg bg-bg-subtle p-3 font-mono text-[13px] break-all whitespace-pre-wrap text-fg">
        {literal}
      </pre>
    </Panel>
  );
}

export default function RegexGenerator(_props: ToolComponentProps) {
  const [mode, setMode] = useState<"preset" | "examples">("preset");
  const [presetId, setPresetId] = useState(REGEX_PRESETS[0].id);
  const [pos, setPos] = useState("INV-2026-0001\nINV-2025-1234\nINV-2024-0420");
  const [neg, setNeg] = useState("INV-26-1\ninv-2026-0001");
  const [anchors, setAnchors] = useState(true);
  const [exactLengths, setExactLengths] = useState(true);
  const [keepLiterals, setKeepLiterals] = useState(true);
  const preset = REGEX_PRESETS.find((p) => p.id === presetId)!;
  const positives = useMemo(() => pos.split("\n").filter((l) => l.length), [pos]);
  const negatives = useMemo(() => neg.split("\n").filter((l) => l.length), [neg]);
  const inferred = useMemo(
    () => (mode === "examples" && positives.length ? inferRegex(positives, { anchors, exactLengths, keepLiterals }) : null),
    [mode, positives, anchors, exactLengths, keepLiterals],
  );

  return (
    <div className="space-y-4">
      <Segmented label="Mode" value={mode} onChange={setMode} options={[{ value: "preset", label: "Common patterns" }, { value: "examples", label: "From examples" }]} />
      {mode === "preset" ? (
        <>
          <Field label="Pattern">
            {(id) => (
              <Select id={id} value={presetId} onChange={(e) => setPresetId(e.target.value)}>
                {REGEX_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <p className="text-sm text-fg-muted">{preset.description}</p>
          <PatternBox pattern={preset.pattern} flags={preset.flags} />
          <Panel title="Examples">
            <Results pattern={preset.pattern} flags={preset.flags} positives={preset.matches} negatives={preset.rejects} />
          </Panel>
        </>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <Panel title="Strings that should match (one per line)">
              <Textarea value={pos} onChange={(e) => setPos(e.target.value)} aria-label="Positive examples" data-testid="input" className="min-h-[140px]" />
            </Panel>
            <Panel title="Strings that should not match (optional)">
              <Textarea value={neg} onChange={(e) => setNeg(e.target.value)} aria-label="Negative examples" className="min-h-[140px]" />
            </Panel>
          </div>
          <div className="flex flex-wrap gap-4">
            <Checkbox label="Anchor with ^ and $" checked={anchors} onChange={setAnchors} />
            <Checkbox label="Exact lengths" description="\\d{4} rather than \\d+" checked={exactLengths} onChange={setExactLengths} />
            <Checkbox label="Keep common literals" description="Fixed text such as INV- stays literal" checked={keepLiterals} onChange={setKeepLiterals} />
          </div>
          {inferred ? (
            <>
              <PatternBox pattern={inferred.pattern} flags={inferred.flags} />
              <Panel title={<span className="flex items-center gap-2">How it was built <Badge>{inferred.strategy}</Badge></span>}>
                <ul className="list-disc space-y-1 pl-5 text-sm text-fg-muted">
                  {inferred.explanation.map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
                <div className="mt-4">
                  <Results pattern={inferred.pattern} flags={inferred.flags} positives={positives} negatives={negatives} />
                </div>
              </Panel>
              <Alert tone="info">Inference generalizes character classes from your examples. It is a starting point – review the pattern and test it with the Regex Tester.</Alert>
            </>
          ) : mode === "examples" ? (
            <Alert tone="warning">Enter at least one example string to generate a pattern.</Alert>
          ) : null}
        </>
      )}
      <ActionBar
        onReset={() => {
          setPos("");
          setNeg("");
          setPresetId(REGEX_PRESETS[0].id);
        }}
      />
    </div>
  );
}
