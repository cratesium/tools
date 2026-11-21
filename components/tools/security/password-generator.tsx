"use client";

import { useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox, Field, Input, Segmented, Slider } from "@/components/ui/field";
import { Badge } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { ActionBar, CopyButton, Panel, TextOutput } from "@/components/tools/shared";
import { generatePassphrase, generatePassword, passphraseEntropy, passwordEntropy, strengthLabel, type PasswordOptions } from "@/lib/processors/security/random";

/**
 * Password Generator, and (processorOptions.archive) Archive Password Generator with archive-friendly defaults.
 */
export default function PasswordGenerator({ tool }: ToolComponentProps) {
  const archive = tool.processorOptions?.archive === true;
  const [kind, setKind] = useState<"password" | "passphrase">("password");
  const [opts, setOpts] = useState<PasswordOptions>({
    length: archive ? 24 : 20,
    lower: true,
    upper: true,
    digits: true,
    symbols: !archive,
    avoidAmbiguous: archive,
    requireEach: true,
    symbolSet: archive ? "-_.+=@#%" : undefined,
  });
  const [words, setWords] = useState(6);
  const [sep, setSep] = useState("-");
  const [cap, setCap] = useState(true);
  const [count, setCount] = useState(1);
  const [nonce, setNonce] = useState(0);
  const set = <K extends keyof PasswordOptions>(k: K, v: PasswordOptions[K]) => setOpts((o) => ({ ...o, [k]: v }));
  const n = Math.max(1, Math.min(500, Math.floor(count) || 1));

  const result = useMemo(() => {
    try {
      const list = Array.from({ length: n }, () => (kind === "password" ? generatePassword(opts) : generatePassphrase(words, sep, cap)));
      return { list, error: null };
    } catch (e) {
      return { list: [], error: (e as Error).message };
    }
  }, [opts, kind, words, sep, cap, n, nonce]); // eslint-disable-line react-hooks/exhaustive-deps
  const bits = kind === "password" ? passwordEntropy(opts) : passphraseEntropy(words);
  const s = strengthLabel(bits);

  return (
    <div className="space-y-4">
      <Segmented label="Type" value={kind} onChange={setKind} options={[{ value: "password", label: "Random password" }, { value: "passphrase", label: "Passphrase (words)" }]} />
      {result.list[0] ? (
        <Panel
          title={
            <span className="flex items-center gap-2">
              Generated <Badge className={s.tone === "success" ? "text-success" : s.tone === "warning" ? "text-warning" : "text-danger"}>{s.label} · {Math.round(bits)} bits</Badge>
            </span>
          }
          actions={
            <>
              <Button size="sm" variant="secondary" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => setNonce((x) => x + 1)}>
                New
              </Button>
              <CopyButton text={result.list[0]} />
            </>
          }
        >
          <code data-testid="output" className="block font-mono text-lg break-all text-fg">
            {result.list[0]}
          </code>
        </Panel>
      ) : null}
      {result.error ? <p className="text-sm text-danger">{result.error}</p> : null}
      <Panel title="Options">
        {kind === "password" ? (
          <div className="space-y-4">
            <Slider label="Length" value={opts.length} min={6} max={128} onChange={(v) => set("length", v)} />
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              <Checkbox label="a–z" checked={!!opts.lower} onChange={(v) => set("lower", v)} />
              <Checkbox label="A–Z" checked={!!opts.upper} onChange={(v) => set("upper", v)} />
              <Checkbox label="0–9" checked={!!opts.digits} onChange={(v) => set("digits", v)} />
              <Checkbox label="Symbols" checked={!!opts.symbols} onChange={(v) => set("symbols", v)} />
              <Checkbox label="Avoid look-alikes (Il1O0)" checked={!!opts.avoidAmbiguous} onChange={(v) => set("avoidAmbiguous", v)} />
              <Checkbox label="At least one of each type" checked={!!opts.requireEach} onChange={(v) => set("requireEach", v)} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {opts.symbols ? (
                <Field label="Symbol set" hint="Leave empty for the default set">
                  {(id) => <Input id={id} value={opts.symbolSet ?? ""} onChange={(e) => set("symbolSet", e.target.value || undefined)} className="font-mono" />}
                </Field>
              ) : null}
              <Field label="Exclude characters">{(id) => <Input id={id} value={opts.exclude ?? ""} onChange={(e) => set("exclude", e.target.value)} className="font-mono" />}</Field>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-3">
            <Slider label="Words" value={words} min={3} max={12} onChange={setWords} />
            <Field label="Separator">{(id) => <Input id={id} value={sep} onChange={(e) => setSep(e.target.value)} maxLength={3} />}</Field>
            <div className="pt-6">
              <Checkbox label="Capitalize words" checked={cap} onChange={setCap} />
            </div>
          </div>
        )}
        <Field label="How many" hint="1–500" className="mt-4 w-32">
          {(id) => <Input id={id} type="number" min={1} max={500} value={count} onChange={(e) => setCount(Number(e.target.value))} />}
        </Field>
      </Panel>
      {n > 1 ? <TextOutput value={result.list.join("\n")} filename="passwords.txt" label={`${n} passwords`} rows={Math.min(12, n)} /> : null}
      {archive ? (
        <p className="text-xs text-fg-subtle">
          Archive defaults avoid characters that are awkward to type in archive tools and command lines. Use the ZIP Creator to make an AES-256 encrypted ZIP with this password.
        </p>
      ) : null}
      <ActionBar onRun={() => setNonce((x) => x + 1)} runLabel="Generate" onReset={() => (setCount(1), setNonce((x) => x + 1))} />
    </div>
  );
}
