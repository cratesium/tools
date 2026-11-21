"use client";

import { useMemo, useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import type { ToolComponentProps } from "@/types/tool";
import { Button } from "@/components/ui/button";
import { Checkbox, Segmented, Textarea } from "@/components/ui/field";
import { Badge } from "@/components/ui/feedback";
import { ActionBar, DownloadButton, Panel } from "@/components/tools/shared";
import {
  computeDiff,
  diffStats,
  inlineChanges,
  sideBySide,
  unifiedPatch,
  type DiffGranularity,
  type DiffPart,
} from "@/lib/processors/text/diff";
import { useDebounced } from "@/lib/utils/hooks";
import { cn } from "@/lib/utils/cn";

const MAX_ROWS = 5000;

function Parts({ parts, className }: { parts: DiffPart[]; className?: string }) {
  return (
    <span className={className}>
      {parts.map((p, i) =>
        p.type === "equal" ? (
          <span key={i}>{p.value}</span>
        ) : p.type === "added" ? (
          <ins key={i} className="rounded-sm bg-success-bg text-success no-underline decoration-transparent">
            {p.value}
          </ins>
        ) : (
          <del key={i} className="rounded-sm bg-danger-bg text-danger">
            {p.value}
          </del>
        ),
      )}
    </span>
  );
}

export default function TextDiff(_props: ToolComponentProps) {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [granularity, setGranularity] = useState<DiffGranularity>("lines");
  const [ignoreCase, setIgnoreCase] = useState(false);
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false);
  const [view, setView] = useState<"split" | "inline">("split");
  const da = useDebounced(a, 250);
  const db = useDebounced(b, 250);

  const parts = useMemo(
    () => (da || db ? computeDiff(da, db, { granularity, ignoreCase, ignoreWhitespace }) : []),
    [da, db, granularity, ignoreCase, ignoreWhitespace],
  );
  const stats = useMemo(() => diffStats(parts, granularity), [parts, granularity]);
  const rows = useMemo(() => (granularity === "lines" ? sideBySide(parts) : []), [parts, granularity]);
  const patch = useMemo(
    () => (da || db ? unifiedPatch(da, db, { ignoreCase, ignoreWhitespace }) : ""),
    [da, db, ignoreCase, ignoreWhitespace],
  );

  const reset = () => {
    setA("");
    setB("");
    setGranularity("lines");
    setIgnoreCase(false);
    setIgnoreWhitespace(false);
    setView("split");
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Original text">
          <Textarea value={a} onChange={(e) => setA(e.target.value)} placeholder="Paste the original version…" aria-label="Original text" data-testid="input" className="min-h-[220px]" />
        </Panel>
        <Panel title="Changed text">
          <Textarea value={b} onChange={(e) => setB(e.target.value)} placeholder="Paste the changed version…" aria-label="Changed text" data-testid="input-b" className="min-h-[220px]" />
        </Panel>
      </div>

      <Panel title="Compare">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <Segmented
            label="Granularity"
            value={granularity}
            onChange={setGranularity}
            options={[
              { value: "lines", label: "Lines" },
              { value: "words", label: "Words" },
              { value: "chars", label: "Characters" },
            ]}
          />
          {granularity === "lines" ? (
            <Segmented
              label="View"
              value={view}
              onChange={setView}
              options={[
                { value: "split", label: "Side by side" },
                { value: "inline", label: "Unified" },
              ]}
            />
          ) : null}
          <Checkbox label="Ignore case" checked={ignoreCase} onChange={setIgnoreCase} />
          {granularity === "lines" ? <Checkbox label="Ignore whitespace" checked={ignoreWhitespace} onChange={setIgnoreWhitespace} /> : null}
          <Button
            variant="secondary"
            size="sm"
            icon={<ArrowLeftRight className="h-3.5 w-3.5" />}
            onClick={() => {
              setA(b);
              setB(a);
            }}
          >
            Swap
          </Button>
        </div>
      </Panel>

      {da || db ? (
        <Panel
          title={
            <span className="flex flex-wrap items-center gap-2" data-testid="diff-summary">
              {stats.identical ? (
                <span>No differences</span>
              ) : (
                <>
                  <Badge className="text-success">+{stats.added.toLocaleString("en-US")}</Badge>
                  <Badge className="text-danger">−{stats.removed.toLocaleString("en-US")}</Badge>
                  <span className="text-fg-muted">
                    {stats.unit} · {stats.unchanged.toLocaleString("en-US")} unchanged
                  </span>
                </>
              )}
            </span>
          }
          actions={<DownloadButton text={patch} filename="changes.diff" mime="text/x-diff" label="Download .diff" size="sm" variant="secondary" />}
        >
          <div data-testid="output" className="max-h-[640px] overflow-auto rounded-lg border border-border font-mono text-[13px]">
            {granularity !== "lines" ? (
              <div className="p-3 leading-relaxed break-words whitespace-pre-wrap">
                <Parts parts={parts} />
              </div>
            ) : view === "split" ? (
              <table className="w-full border-collapse">
                <tbody>
                  {rows.slice(0, MAX_ROWS).map((r, i) => {
                    const inl = r.type === "changed" ? inlineChanges(r.left ?? "", r.right ?? "") : null;
                    return (
                      <tr key={i} className="align-top">
                        <td className="w-10 border-r border-border px-2 text-right text-fg-subtle select-none">{r.leftNo ?? ""}</td>
                        <td
                          className={cn(
                            "w-1/2 border-r border-border px-2 break-all whitespace-pre-wrap",
                            (r.type === "removed" || r.type === "changed") && "bg-danger-bg/60",
                          )}
                        >
                          {inl ? <Parts parts={inl.left} /> : r.left}
                        </td>
                        <td className="w-10 border-r border-border px-2 text-right text-fg-subtle select-none">{r.rightNo ?? ""}</td>
                        <td
                          className={cn(
                            "w-1/2 px-2 break-all whitespace-pre-wrap",
                            (r.type === "added" || r.type === "changed") && "bg-success-bg/60",
                          )}
                        >
                          {inl ? <Parts parts={inl.right} /> : r.right}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <pre className="p-3 leading-relaxed whitespace-pre-wrap">
                {parts.flatMap((p, i) =>
                  p.value
                    .replace(/\n$/, "")
                    .split("\n")
                    .slice(0, MAX_ROWS)
                    .map((line, j) => (
                      <div
                        key={`${i}-${j}`}
                        className={cn(p.type === "added" && "bg-success-bg text-success", p.type === "removed" && "bg-danger-bg text-danger")}
                      >
                        {p.type === "added" ? "+ " : p.type === "removed" ? "- " : "  "}
                        {line}
                      </div>
                    )),
                )}
              </pre>
            )}
          </div>
          {rows.length > MAX_ROWS ? (
            <p className="mt-2 text-xs text-fg-subtle">Showing the first {MAX_ROWS} rows. The .diff download contains every change.</p>
          ) : null}
        </Panel>
      ) : null}

      <ActionBar onReset={reset} />
    </div>
  );
}
