"use client";

import { useEffect, useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox, Field, Input, Segmented, Textarea } from "@/components/ui/field";
import { Badge } from "@/components/ui/feedback";
import { ActionBar, CopyButton, ErrorMessage, Panel } from "@/components/tools/shared";
import { HASH_ALGORITHMS, formatDigest, hashAll, type HashOutput, type HashRow } from "@/lib/processors/developer/hash";
import { errorMessage, useDebounced } from "@/lib/utils/hooks";

/** Every common hash of a text at once (MD5 … BLAKE3), optional HMAC. */
export default function HashGenerator(_props: ToolComponentProps) {
  const [text, setText] = useState("");
  const [useKey, setUseKey] = useState(false);
  const [key, setKey] = useState("");
  const [output, setOutput] = useState<HashOutput>("hex");
  const [state, setState] = useState<{ input: string; rows: HashRow[]; error: string | null }>({ input: "", rows: [], error: null });
  const debounced = useDebounced(text, 200);
  const k = useKey ? key : undefined;
  const sig = JSON.stringify([debounced, k]);

  useEffect(() => {
    let alive = true;
    hashAll(debounced, k)
      .then((rows) => alive && setState({ input: sig, rows, error: null }))
      .catch((e) => alive && setState({ input: sig, rows: [], error: errorMessage(e) }));
    return () => {
      alive = false;
    };
  }, [debounced, k, sig]);

  return (
    <div className="space-y-4">
      <Panel title="Text">
        <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Type or paste text to hash (UTF-8)…" aria-label="Input" data-testid="input" className="min-h-[140px]" />
      </Panel>
      <div className="flex flex-wrap items-end gap-4">
        <Segmented
          label="Output"
          value={output}
          onChange={setOutput}
          options={[
            { value: "hex", label: "hex" },
            { value: "HEX", label: "HEX" },
            { value: "base64", label: "Base64" },
          ]}
        />
        <Checkbox label="HMAC with a secret key" checked={useKey} onChange={setUseKey} />
        {useKey ? <Field label="Key" className="w-64">{(id) => <Input id={id} value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" />}</Field> : null}
      </div>
      <ErrorMessage error={state.error} />
      <Panel title={useKey ? "HMAC digests" : "Digests"}>
        <ul className="divide-y divide-border" data-testid="output">
          {state.rows.map((r) => {
            const alg = HASH_ALGORITHMS.find((a) => a.id === r.id);
            const v = r.hex == null ? "" : formatDigest(r.hex, output);
            return (
              <li key={r.id} className="flex items-center gap-3 py-2">
                <span className="flex w-32 shrink-0 items-center gap-1.5 text-xs text-fg-muted">
                  {r.label}
                  {alg?.insecure ? <Badge className="text-warning">weak</Badge> : null}
                </span>
                <code className="min-w-0 flex-1 font-mono text-[12px] break-all text-fg">{v || <span className="text-fg-subtle">{r.note ?? "—"}</span>}</code>
                {v ? <CopyButton text={v} /> : null}
              </li>
            );
          })}
        </ul>
      </Panel>
      <p className="text-xs text-fg-subtle">MD5 and SHA-1 are broken for security purposes – use them only for checksums. Hashing runs locally with Web Crypto and hash-wasm.</p>
      <ActionBar onReset={() => (setText(""), setKey(""), setUseKey(false))} />
    </div>
  );
}
