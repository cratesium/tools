"use client";

import { useMemo, useRef, useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox, Field, Segmented, Select } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { ActionBar, KeyValueTable, Panel, Settings, TextOutput } from "@/components/tools/shared";
import { formatXml, minifyXml, tokenizeXml, validateXml } from "@/lib/processors/developer/xml";
import { formatBytes, formatNumber } from "@/lib/utils/format";
import { useDebounced } from "@/lib/utils/hooks";
import { CodeInput, LocatedError, sizeOf } from "./code-panels";

const SAMPLE_FORMAT = `<?xml version="1.0" encoding="UTF-8"?><!-- RSS excerpt --><rss version="2.0"><channel><title>Release notes</title><link>https://example.com/</link><item><title>v2.4.0</title><description><![CDATA[<p>Faster <b>imports</b></p>]]></description><pubDate>Sat, 21 Nov 2026 09:00:00 GMT</pubDate></item><item><title>v2.3.1</title><description>Bug fixes</description></item></channel></rss>`;
const SAMPLE_VALIDATE = `<?xml version="1.0"?>
<config>
  <server host="localhost" port="8080">
    <timeout>30</timeout>
  </server>
  <users>
    <user id="1">ana</user>
    <user id="2">tom
  </users>
</config>`;

export default function XmlTool({ tool }: ToolComponentProps) {
  const mode = (tool.processorOptions?.mode as "format" | "validate") ?? "format";
  const [text, setText] = useState("");
  const [style, setStyle] = useState<"pretty" | "minify">("pretty");
  const [indent, setIndent] = useState<"2" | "4" | "tab">("2");
  const [selfClose, setSelfClose] = useState(false);
  const [removeComments, setRemoveComments] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const debounced = useDebounced(text, 200);

  const result = useMemo(() => {
    if (!debounced.trim()) return null;
    const v = validateXml(debounced);
    if (!v.valid) return { ok: false as const, error: { message: v.message ?? "Invalid XML", line: v.line, column: v.column } };
    if (mode === "validate") {
      const toks = tokenizeXml(debounced);
      let depth = 0;
      let max = 0;
      let attrs = 0;
      const names = new Set<string>();
      for (const t of toks) {
        if (t.type === "open" || t.type === "selfclose") {
          names.add(t.name ?? "");
          attrs += (t.raw.match(/\s[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*')/g) ?? []).length;
          if (t.type === "open") max = Math.max(max, ++depth);
          else max = Math.max(max, depth + 1);
        } else if (t.type === "close") depth--;
      }
      const root = toks.find((t) => t.type === "open" || t.type === "selfclose");
      return {
        ok: true as const,
        output: "",
        stats: [
          ["Root element", root?.name ?? "—"],
          ["Elements", formatNumber(toks.filter((t) => t.type === "open" || t.type === "selfclose").length, 0)],
          ["Distinct element names", formatNumber(names.size, 0)],
          ["Attributes", formatNumber(attrs, 0)],
          ["Maximum depth", formatNumber(max, 0)],
          ["Comments / CDATA", `${toks.filter((t) => t.type === "comment").length} / ${toks.filter((t) => t.type === "cdata").length}`],
          ["XML declaration", toks.some((t) => t.type === "decl") ? "yes" : "no"],
          ["DOCTYPE", toks.some((t) => t.type === "doctype") ? "yes (not validated against)" : "no"],
          ["Size", formatBytes(sizeOf(debounced))],
        ] as [string, string][],
      };
    }
    const output =
      style === "minify"
        ? minifyXml(debounced, { removeComments })
        : formatXml(debounced, { indent: indent === "tab" ? "tab" : Number(indent), selfCloseEmpty: selfClose });
    return { ok: true as const, output, stats: [] as [string, string][] };
  }, [debounced, mode, style, indent, selfClose, removeComments]);

  const reset = () => {
    setText("");
    setStyle("pretty");
    setIndent("2");
    setSelfClose(false);
    setRemoveComments(false);
  };

  return (
    <div className="space-y-4">
      <CodeInput
        value={text}
        onChange={setText}
        inputRef={inputRef}
        label="XML"
        placeholder="Paste XML here…"
        sample={mode === "validate" ? SAMPLE_VALIDATE : SAMPLE_FORMAT}
        accept=".xml,.svg,.rss,.atom,.xsd,.xsl,.xslt,.plist,.config,text/xml,application/xml"
      />

      {mode === "format" ? (
        <Settings>
          <Field label="Output">{() => <Segmented value={style} onChange={setStyle} options={[{ value: "pretty", label: "Pretty print" }, { value: "minify", label: "Minify" }]} />}</Field>
          {style === "pretty" ? (
            <>
              <Field label="Indentation">
                {(id) => (
                  <Select id={id} value={indent} onChange={(e) => setIndent(e.target.value as "2" | "4" | "tab")}>
                    <option value="2">2 spaces</option>
                    <option value="4">4 spaces</option>
                    <option value="tab">Tabs</option>
                  </Select>
                )}
              </Field>
              <Checkbox label="Collapse empty elements" description="<a></a> becomes <a/>" checked={selfClose} onChange={setSelfClose} />
            </>
          ) : (
            <Checkbox label="Remove comments" checked={removeComments} onChange={setRemoveComments} />
          )}
        </Settings>
      ) : null}

      {result && !result.ok ? <LocatedError error={result.error} inputRef={inputRef} title="XML is not well-formed" /> : null}

      {result?.ok && mode === "validate" ? (
        <>
          <Alert tone="success" title="Well-formed XML">
            Tags are properly nested and closed, attributes are quoted and unique. Schema (XSD/DTD) rules are not checked.
          </Alert>
          <Panel title="Document summary">
            <KeyValueTable rows={result.stats} />
          </Panel>
        </>
      ) : null}

      {result?.ok && mode === "format" ? (
        <TextOutput value={result.output} filename={style === "minify" ? "minified.xml" : "formatted.xml"} mime="application/xml" rows={16} />
      ) : null}

      <ActionBar onReset={reset} />
    </div>
  );
}
