"use client";

import { useMemo, useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox, Field, Input, Segmented } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { ActionBar, KeyValueTable, Panel, TextOutput } from "@/components/tools/shared";
import { formatUuid, generateUuids, inspectUuid, type UuidVersion } from "@/lib/processors/developer/uuid";

export default function UuidGenerator(_props: ToolComponentProps) {
  const [version, setVersion] = useState<UuidVersion>("v4");
  const [count, setCount] = useState(5);
  const [upper, setUpper] = useState(false);
  const [hyphens, setHyphens] = useState(true);
  const [braces, setBraces] = useState(false);
  const [urn, setUrn] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [inspect, setInspect] = useState("");

  const n = Math.max(1, Math.min(10000, Math.floor(count) || 1));
  // nonce forces regeneration when the user clicks Generate.
  const ids = useMemo(() => generateUuids(version, n), [version, n, nonce]); // eslint-disable-line react-hooks/exhaustive-deps
  const output = useMemo(() => ids.map((u) => formatUuid(u, { uppercase: upper, hyphens, braces, urn })).join("\n"), [ids, upper, hyphens, braces, urn]);
  const info = useMemo(() => (inspect.trim() ? inspectUuid(inspect) : null), [inspect]);

  return (
    <div className="space-y-4">
      <Panel title="Settings">
        <div className="flex flex-wrap items-end gap-4">
          <Field label="Version">
            {() => (
              <Segmented
                value={version}
                onChange={setVersion}
                options={[
                  { value: "v4", label: "v4 random" },
                  { value: "v7", label: "v7 time-ordered" },
                  { value: "nil", label: "Nil" },
                  { value: "max", label: "Max" },
                ]}
              />
            )}
          </Field>
          <Field label="How many" hint="1–10,000" className="w-32">
            {(id) => <Input id={id} type="number" min={1} max={10000} value={count} onChange={(e) => setCount(Number(e.target.value))} data-testid="input" />}
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap gap-4">
          <Checkbox label="Uppercase" checked={upper} onChange={setUpper} />
          <Checkbox label="Hyphens" checked={hyphens} onChange={setHyphens} />
          <Checkbox label="{Braces}" checked={braces} onChange={setBraces} />
          <Checkbox label="urn:uuid: prefix" checked={urn} onChange={setUrn} />
        </div>
      </Panel>
      <TextOutput value={output} filename="uuids.txt" label={`${n} UUID${n === 1 ? "" : "s"}`} rows={Math.min(12, n + 1)} />
      <Alert tone="info">
        {version === "v7"
          ? "UUIDv7 (RFC 9562) starts with a 48-bit Unix millisecond timestamp, so values sort by creation time – good for database keys."
          : "UUIDv4 uses 122 random bits from crypto.getRandomValues; the chance of a collision is negligible."}
      </Alert>
      <Panel title="Inspect a UUID">
        <Input value={inspect} onChange={(e) => setInspect(e.target.value)} placeholder="Paste any UUID to see its version, variant and timestamp" aria-label="UUID to inspect" className="font-mono" />
        {info ? (
          <div className="mt-3">
            {info.valid ? (
              <KeyValueTable
                rows={[
                  ["Canonical", info.canonical ?? ""],
                  ["Version", String(info.version ?? "—")],
                  ["Variant", info.variant ?? "—"],
                  ...(info.timestamp ? [["Timestamp", info.timestamp.toISOString()] as [string, string]] : []),
                  ...(info.note ? [["Note", info.note] as [string, string]] : []),
                ]}
              />
            ) : (
              <p className="text-sm text-danger">Not a valid UUID{info.note ? `: ${info.note}` : "."}</p>
            )}
          </div>
        ) : null}
      </Panel>
      <ActionBar onRun={() => setNonce((x) => x + 1)} runLabel="Generate new" onReset={() => (setCount(5), setVersion("v4"), setInspect(""), setNonce((x) => x + 1))} />
    </div>
  );
}
