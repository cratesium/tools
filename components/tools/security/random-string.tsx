"use client";

import { useMemo, useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox, Field, Input, Select, Slider } from "@/components/ui/field";
import { ActionBar, TextOutput } from "@/components/tools/shared";
import { AMBIGUOUS, CHARSETS, entropyBits, randomFromAlphabet } from "@/lib/processors/security/random";

const PRESETS: Record<string, { label: string; chars: string }> = {
  alnum: { label: "Letters and digits", chars: CHARSETS.lower + CHARSETS.upper + CHARSETS.digits },
  lower: { label: "Lowercase letters", chars: CHARSETS.lower },
  upper: { label: "Uppercase letters", chars: CHARSETS.upper },
  digits: { label: "Digits (numeric code)", chars: CHARSETS.digits },
  hex: { label: "Hexadecimal", chars: CHARSETS.hex },
  base58: { label: "Base58 (no 0 O I l)", chars: CHARSETS.base58 },
  urlSafe: { label: "URL-safe (A–Z a–z 0–9 - _)", chars: CHARSETS.urlSafe },
  all: { label: "Letters, digits and symbols", chars: CHARSETS.lower + CHARSETS.upper + CHARSETS.digits + CHARSETS.symbols },
  custom: { label: "Custom characters…", chars: "" },
};

export default function RandomString(_props: ToolComponentProps) {
  const [preset, setPreset] = useState("alnum");
  const [custom, setCustom] = useState("abc123");
  const [length, setLength] = useState(16);
  const [count, setCount] = useState(10);
  const [noAmbig, setNoAmbig] = useState(false);
  const [prefix, setPrefix] = useState("");
  const [nonce, setNonce] = useState(0);
  const alphabet = useMemo(() => {
    const base = preset === "custom" ? custom : PRESETS[preset].chars;
    const uniq = [...new Set([...base])].filter((c) => !noAmbig || !AMBIGUOUS.includes(c));
    return uniq;
  }, [preset, custom, noAmbig]);
  const n = Math.max(1, Math.min(10000, Math.floor(count) || 1));
  const out = useMemo(
    () => (alphabet.length ? Array.from({ length: n }, () => prefix + randomFromAlphabet(alphabet, length)).join("\n") : ""),
    [alphabet, length, n, prefix, nonce], // eslint-disable-line react-hooks/exhaustive-deps
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Characters">
          {(id) => (
            <Select id={id} value={preset} onChange={(e) => setPreset(e.target.value)}>
              {Object.entries(PRESETS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {preset === "custom" ? <Field label="Custom alphabet">{(id) => <Input id={id} value={custom} onChange={(e) => setCustom(e.target.value)} className="font-mono" />}</Field> : null}
        <Slider label="Length" value={length} min={1} max={256} onChange={setLength} />
        <Field label="How many" hint="1–10,000">{(id) => <Input id={id} type="number" value={count} min={1} max={10000} onChange={(e) => setCount(Number(e.target.value))} data-testid="input" />}</Field>
        <Field label="Prefix (optional)" hint="e.g. sk_ or ORD-">{(id) => <Input id={id} value={prefix} onChange={(e) => setPrefix(e.target.value)} className="font-mono" />}</Field>
        <div className="pt-6">
          <Checkbox label="Remove look-alike characters" checked={noAmbig} onChange={setNoAmbig} />
        </div>
      </div>
      <p className="text-xs text-fg-subtle">
        Alphabet of {alphabet.length} characters · {entropyBits(alphabet.length, length).toFixed(1)} bits of entropy per string · generated with crypto.getRandomValues without modulo bias.
      </p>
      {out ? <TextOutput value={out} filename="random-strings.txt" label={`${n} random string${n === 1 ? "" : "s"}`} rows={Math.min(14, n + 1)} /> : <p className="text-sm text-danger">The alphabet is empty.</p>}
      <ActionBar onRun={() => setNonce((x) => x + 1)} runLabel="Regenerate" onReset={() => (setPreset("alnum"), setLength(16), setCount(10), setPrefix(""), setNonce((x) => x + 1))} />
    </div>
  );
}
