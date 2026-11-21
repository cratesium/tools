"use client";

import { useMemo, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import type { ToolComponentProps } from "@/types/tool";
import { Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { ActionBar, KeyValueTable, Panel } from "@/components/tools/shared";
import { checkStrength } from "@/lib/processors/security/strength";
import { cn } from "@/lib/utils/cn";

const COLORS = ["bg-danger", "bg-danger", "bg-warning", "bg-success", "bg-success"];

export default function StrengthChecker(_props: ToolComponentProps) {
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const r = useMemo(() => (pw ? checkStrength(pw) : null), [pw]);

  return (
    <div className="space-y-4">
      <Panel title="Password">
        <div className="flex gap-2">
          <Input
            type={show ? "text" : "password"}
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="Type a password to analyse"
            aria-label="Password"
            data-testid="input"
            autoComplete="off"
            spellCheck={false}
            className="font-mono"
          />
          <Button size="icon" variant="secondary" aria-label={show ? "Hide password" : "Show password"} onClick={() => setShow((s) => !s)}>
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        </div>
        <div className="mt-3 flex gap-1" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={cn("h-1.5 flex-1 rounded-full", r && r.score > i ? COLORS[r.score] : "bg-bg-muted")} />
          ))}
        </div>
        <p className="mt-2 text-sm text-fg" data-testid="output" aria-live="polite">
          {r ? (
            <>
              <strong>{r.label}</strong> · about {Math.round(r.bits)} bits of entropy after pattern analysis (naive estimate {Math.round(r.naiveBits)} bits)
            </>
          ) : (
            "Nothing is sent anywhere – analysis runs in your browser."
          )}
        </p>
      </Panel>
      {r ? (
        <>
          {r.warnings.length ? (
            <Alert tone="warning" title="Weaknesses found">
              <ul className="list-disc pl-4">
                {r.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </Alert>
          ) : null}
          {r.suggestions.length ? (
            <Alert tone="info" title="Suggestions">
              <ul className="list-disc pl-4">
                {r.suggestions.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </Alert>
          ) : null}
          <Panel title="Estimated time to crack">
            <KeyValueTable rows={r.crackTimes.map((c) => [c.scenario, c.display])} />
          </Panel>
          <Panel title="How it was analysed">
            <ul className="space-y-1.5 text-sm">
              {r.sequence.map((m, i) => (
                <li key={i} className="flex flex-wrap items-baseline gap-2">
                  <code className="rounded bg-bg-muted px-1.5 font-mono">{show ? m.token : "•".repeat(m.token.length)}</code>
                  <span className="text-fg-muted">{m.detail}</span>
                  <span className="font-mono text-xs text-fg-subtle">{m.bits.toFixed(1)} bits</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-fg-subtle">
              Length {r.length}, character pool {r.pool}. The estimate looks for common passwords, dictionary words (including l33t substitutions), keyboard walks, sequences, repeats and dates, like zxcvbn.
            </p>
          </Panel>
        </>
      ) : null}
      <ActionBar onReset={() => setPw("")} />
    </div>
  );
}
