"use client";

import { useMemo, useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox, Field, Select, Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { ActionBar, Panel, Settings, TextOutput } from "@/components/tools/shared";
import { decodeEntitiesDetailed, encodeEntities, type EntityEncodeMode } from "@/lib/processors/developer/entities";

/** HTML Entity Encoder (mode "encode") and Decoder (mode "decode"). */
export default function EntitiesTool({ tool }: ToolComponentProps) {
  const mode = (tool.processorOptions?.mode as "encode" | "decode") ?? "encode";
  const [text, setText] = useState("");
  const [encMode, setEncMode] = useState<EntityEncodeMode>("minimal");
  const [quotes, setQuotes] = useState(true);
  const [nonAscii, setNonAscii] = useState(false);

  const enc = useMemo(() => (mode === "encode" && text ? encodeEntities(text, { mode: encMode, quotes, nonAscii }) : ""), [mode, text, encMode, quotes, nonAscii]);
  const dec = useMemo(() => (mode === "decode" && text ? decodeEntitiesDetailed(text) : null), [mode, text]);

  return (
    <div className="space-y-4">
      <Panel title={mode === "encode" ? "Text or HTML to escape" : "Text containing entities"}>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={mode === "encode" ? `<a href="/?q=1&x=2">Café “quotes”</a>` : "&lt;p&gt;Caf&eacute; &amp; cr&#232;me &#x1F600;&lt;/p&gt;"}
          aria-label="Input"
          data-testid="input"
          className="min-h-[160px]"
        />
      </Panel>
      {mode === "encode" ? (
        <Settings>
          <Field label="Style">
            {(id) => (
              <Select id={id} value={encMode} onChange={(e) => setEncMode(e.target.value as EntityEncodeMode)}>
                <option value="minimal">Minimal – only &amp; &lt; &gt; (and quotes)</option>
                <option value="named">Named entities where available (&amp;eacute;)</option>
                <option value="decimal">Decimal (&amp;#233;)</option>
                <option value="hex">Hexadecimal (&amp;#xE9;)</option>
              </Select>
            )}
          </Field>
          <Checkbox label="Escape quotes" description="Needed inside attribute values" checked={quotes} onChange={setQuotes} />
          <Checkbox label="Escape all non-ASCII characters" checked={nonAscii} onChange={setNonAscii} />
        </Settings>
      ) : null}
      {enc ? <TextOutput value={enc} filename="escaped.html" /> : null}
      {dec ? (
        <>
          <TextOutput value={dec.text} filename="decoded.txt" label={`Decoded (${dec.decoded} entit${dec.decoded === 1 ? "y" : "ies"})`} />
          {dec.unknown.length ? (
            <Alert tone="warning" title="Unrecognised entities left unchanged">
              {dec.unknown.slice(0, 20).join(", ")}
            </Alert>
          ) : null}
        </>
      ) : null}
      <ActionBar onReset={() => setText("")} />
    </div>
  );
}
