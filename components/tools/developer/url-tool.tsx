"use client";

import { useMemo, useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox, Field, Select, Textarea } from "@/components/ui/field";
import { ActionBar, ErrorMessage, KeyValueTable, Panel, Settings, TextOutput } from "@/components/tools/shared";
import { parseUrl, urlDecodeFully, urlEncode, urlDecode, type UrlEncodeMode } from "@/lib/processors/developer/url";
import { errorMessage } from "@/lib/utils/hooks";

const MODES: { value: UrlEncodeMode; label: string; hint: string }[] = [
  { value: "component", label: "Component (encodeURIComponent)", hint: "For query values and path segments" },
  { value: "uri", label: "Full URL (encodeURI)", hint: "Keeps : / ? # & = intact" },
  { value: "form", label: "Form (application/x-www-form-urlencoded)", hint: "Spaces become +" },
  { value: "all", label: "Every character", hint: "Percent-encode all bytes" },
];

/** URL Encoder (mode "encode") and URL Decoder (mode "decode"), with URL breakdown. */
export default function UrlTool({ tool }: ToolComponentProps) {
  const mode = (tool.processorOptions?.mode as "encode" | "decode") ?? "encode";
  const [text, setText] = useState("");
  const [encMode, setEncMode] = useState<UrlEncodeMode>("component");
  const [perLine, setPerLine] = useState(false);
  const [plus, setPlus] = useState(true);
  const [full, setFull] = useState(false);

  const out = useMemo(() => {
    if (!text) return { value: "", error: null as string | null, passes: 0 };
    try {
      if (mode === "encode") {
        const value = perLine ? text.split("\n").map((l) => urlEncode(l, encMode)).join("\n") : urlEncode(text, encMode);
        return { value, error: null, passes: 1 };
      }
      if (full) {
        const r = urlDecodeFully(text, plus);
        return { value: r.value, error: null, passes: r.passes };
      }
      const value = perLine ? text.split("\n").map((l) => urlDecode(l, plus)).join("\n") : urlDecode(text, plus);
      return { value, error: null, passes: 1 };
    } catch (e) {
      return { value: "", error: errorMessage(e), passes: 0 };
    }
  }, [text, mode, encMode, perLine, plus, full]);

  const parts = useMemo(() => parseUrl(mode === "decode" ? out.value.trim() : text.trim()), [mode, out.value, text]);

  return (
    <div className="space-y-4">
      <Panel title={mode === "encode" ? "Text or URL to encode" : "Encoded text or URL"}>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={mode === "encode" ? "name=Ana María & city=São Paulo" : "q%3Dcaf%C3%A9%20au%20lait"} aria-label="Input" data-testid="input" className="min-h-[140px]" />
      </Panel>
      <Settings>
        {mode === "encode" ? (
          <Field label="Encoding" hint={MODES.find((m) => m.value === encMode)?.hint}>
            {(id) => (
              <Select id={id} value={encMode} onChange={(e) => setEncMode(e.target.value as UrlEncodeMode)}>
                {MODES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : (
          <>
            <Checkbox label="Treat + as space" description="For form-encoded query strings" checked={plus} onChange={setPlus} />
            <Checkbox label="Decode repeatedly" description="Undo double or triple encoding" checked={full} onChange={setFull} />
          </>
        )}
        {!full || mode === "encode" ? <Checkbox label="Process each line separately" checked={perLine} onChange={setPerLine} /> : null}
      </Settings>
      <ErrorMessage error={out.error ? `${out.error}. The input contains a malformed % sequence.` : null} />
      {out.value ? <TextOutput value={out.value} filename={mode === "encode" ? "encoded.txt" : "decoded.txt"} label={full && out.passes > 1 ? `Result (decoded ${out.passes}×)` : "Result"} /> : null}
      {parts ? (
        <Panel title="URL breakdown">
          <KeyValueTable
            rows={[
              ["Protocol", parts.protocol],
              ["Host", parts.hostname],
              ...(parts.port ? [["Port", parts.port] as [string, string]] : []),
              ["Path", parts.pathname],
              ...(parts.hash ? [["Fragment", parts.hash] as [string, string]] : []),
              ...parts.params.map(([k, v]) => [`?${k}`, v] as [string, string]),
            ]}
          />
        </Panel>
      ) : null}
      <ActionBar onReset={() => setText("")} />
    </div>
  );
}
