"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/field";
import { Alert, Badge } from "@/components/ui/feedback";
import { ActionBar, ErrorMessage, Panel, TextOutput } from "@/components/tools/shared";
import { segmentText, validateFlags, type RegexRunResult, type RegexWorkerResponse } from "@/lib/processors/developer/regex";
import { useDebounced } from "@/lib/utils/hooks";

const FLAG_INFO: [string, string][] = [
  ["g", "global"],
  ["i", "ignore case"],
  ["m", "multiline ^ $"],
  ["s", "dot matches newline"],
  ["u", "unicode"],
  ["y", "sticky"],
];
const TIMEOUT_MS = 2000;

/** Runs patterns in a Web Worker so catastrophic backtracking can be stopped. */
function useRegexWorker(pattern: string, flags: string, text: string, replacement: string | undefined) {
  const workerRef = useRef<Worker | null>(null);
  const idRef = useRef(0);
  const [state, setState] = useState<{ result: RegexRunResult | null; timedOut: boolean }>({ result: null, timedOut: false });

  useEffect(() => () => workerRef.current?.terminate(), []);

  useEffect(() => {
    if (!pattern) return;
    const id = ++idRef.current;
    if (!workerRef.current) workerRef.current = new Worker(new URL("../../../workers/developer/regex.worker.ts", import.meta.url), { type: "module" });
    const w = workerRef.current;
    const timer = setTimeout(() => {
      if (id !== idRef.current) return;
      w.terminate();
      workerRef.current = null;
      setState({ result: null, timedOut: true });
    }, TIMEOUT_MS);
    const onMsg = (e: MessageEvent<RegexWorkerResponse>) => {
      if (e.data.id !== id) return;
      clearTimeout(timer);
      setState({ result: e.data.result, timedOut: false });
    };
    w.addEventListener("message", onMsg);
    w.postMessage({ id, pattern, flags, text, replacement });
    return () => {
      clearTimeout(timer);
      w.removeEventListener("message", onMsg);
    };
  }, [pattern, flags, text, replacement]);

  return pattern ? state : { result: null, timedOut: false };
}

export default function RegexTester(_props: ToolComponentProps) {
  const [pattern, setPattern] = useState("(?<user>[\\w.+-]+)@(?<domain>[\\w-]+\\.[\\w.]+)");
  const [flags, setFlags] = useState("g");
  const [text, setText] = useState("Contact ana@example.com or support@utility-hub.dev for help.\nInvalid: bob@ and @site.com");
  const [useReplace, setUseReplace] = useState(false);
  const [replacement, setReplacement] = useState("$<user> at $<domain>");
  const dp = useDebounced(pattern, 200);
  const dt = useDebounced(text, 200);
  const flagError = validateFlags(flags);
  const { result, timedOut } = useRegexWorker(flagError ? "" : dp, flags, dt, useReplace ? replacement : undefined);
  const segments = useMemo(() => (result?.ok ? segmentText(dt, result.matches) : []), [result, dt]);

  const toggle = (f: string) => setFlags((cur) => (cur.includes(f) ? cur.replace(f, "") : cur + f));

  return (
    <div className="space-y-4">
      <Panel title="Regular expression">
        <div className="flex items-center gap-2 font-mono">
          <span className="text-fg-subtle">/</span>
          <Input value={pattern} onChange={(e) => setPattern(e.target.value)} aria-label="Pattern" data-testid="input" className="font-mono" spellCheck={false} />
          <span className="text-fg-subtle">/</span>
          <Input value={flags} onChange={(e) => setFlags(e.target.value)} aria-label="Flags" className="w-20 font-mono" spellCheck={false} />
        </div>
        <div className="mt-3 flex flex-wrap gap-3">
          {FLAG_INFO.map(([f, label]) => (
            <Checkbox key={f} label={<span><code className="font-mono">{f}</code> {label}</span>} checked={flags.includes(f)} onChange={() => toggle(f)} />
          ))}
        </div>
      </Panel>
      <ErrorMessage error={flagError ?? (result && !result.ok ? result.error : null)} />
      {timedOut ? (
        <Alert tone="danger" title="Pattern took too long">
          Execution was stopped after {TIMEOUT_MS / 1000} s, which usually means catastrophic backtracking (for example nested quantifiers like (a+)+). Simplify the pattern.
        </Alert>
      ) : null}
      <Panel title="Test string">
        <Textarea value={text} onChange={(e) => setText(e.target.value)} aria-label="Test string" className="min-h-[140px]" />
      </Panel>
      {result?.ok ? (
        <Panel
          title={
            <span className="flex items-center gap-2">
              Matches <Badge>{result.matches.length}{result.truncated ? "+" : ""}</Badge>
            </span>
          }
        >
          <pre className="max-h-72 overflow-auto rounded-lg bg-bg-subtle p-3 font-mono text-[13px] whitespace-pre-wrap break-words text-fg" data-testid="output">
            {segments.map((s, i) =>
              s.match != null ? (
                <mark key={i} className="rounded-sm bg-warning-bg px-0.5 text-fg outline outline-1 outline-warning/40">
                  {s.text}
                </mark>
              ) : (
                <span key={i}>{s.text}</span>
              ),
            )}
          </pre>
          {result.matches.length ? (
            <div className="mt-3 max-h-80 overflow-auto rounded-lg border border-border">
              <table className="w-full text-[13px]">
                <thead className="sticky top-0 bg-bg-muted text-left">
                  <tr>
                    <th className="px-3 py-1.5 font-medium">#</th>
                    <th className="px-3 py-1.5 font-medium">Match</th>
                    <th className="px-3 py-1.5 font-medium">Index</th>
                    <th className="px-3 py-1.5 font-medium">Groups</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border font-mono">
                  {result.matches.slice(0, 200).map((m, i) => (
                    <tr key={i} className="align-top">
                      <td className="px-3 py-1.5 text-fg-subtle">{i + 1}</td>
                      <td className="px-3 py-1.5 break-all">{m.value || <em className="text-fg-subtle">empty</em>}</td>
                      <td className="px-3 py-1.5 text-fg-muted">{m.index}–{m.end}</td>
                      <td className="px-3 py-1.5 break-all text-fg-muted">
                        {m.groups.map((g) => `${g.name ?? g.index}: ${g.value ?? "∅"}`).join("  ·  ") || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </Panel>
      ) : null}
      <Panel title="Replace">
        <Checkbox label="Preview a replacement" description="Supports $1, $<name>, $& and $$" checked={useReplace} onChange={setUseReplace} />
        {useReplace ? (
          <Field label="Replacement" className="mt-3">
            {(id) => <Input id={id} value={replacement} onChange={(e) => setReplacement(e.target.value)} className="font-mono" />}
          </Field>
        ) : null}
      </Panel>
      {useReplace && result?.ok && result.replaced != null ? <TextOutput value={result.replaced} filename="replaced.txt" label="Result after replace" /> : null}
      <ActionBar
        onReset={() => {
          setPattern("");
          setFlags("g");
          setText("");
          setUseReplace(false);
        }}
      />
    </div>
  );
}
