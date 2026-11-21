"use client";

import { useEffect, useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox, Field, Select, Textarea } from "@/components/ui/field";
import { ActionBar, CopyButton, ErrorMessage, Panel, TextOutput } from "@/components/tools/shared";
import { defaultTurndownOptions, htmlToMarkdown, type TurndownOptions } from "@/lib/processors/text/markdown";
import { errorMessage, useDebounced } from "@/lib/utils/hooks";

export default function HtmlToMarkdown(_props: ToolComponentProps) {
  const [html, setHtml] = useState("");
  const [o, setO] = useState<TurndownOptions>(defaultTurndownOptions);
  const [md, setMd] = useState("");
  const [error, setError] = useState<string | null>(null);
  const debounced = useDebounced(html, 200);

  useEffect(() => {
    let alive = true;
    if (!debounced.trim()) return;
    htmlToMarkdown(debounced, o)
      .then((r) => alive && (setMd(r), setError(null)))
      .catch((e) => alive && setError(errorMessage(e)));
    return () => {
      alive = false;
    };
  }, [debounced, o]);

  return (
    <div className="space-y-4">
      <Panel title="Options">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Headings">
            {(id) => (
              <Select id={id} value={o.headingStyle} onChange={(e) => setO({ ...o, headingStyle: e.target.value as TurndownOptions["headingStyle"] })}>
                <option value="atx"># ATX</option>
                <option value="setext">Underlined (Setext)</option>
              </Select>
            )}
          </Field>
          <Field label="Bullet marker">
            {(id) => (
              <Select id={id} value={o.bulletListMarker} onChange={(e) => setO({ ...o, bulletListMarker: e.target.value as TurndownOptions["bulletListMarker"] })}>
                <option value="-">- dash</option>
                <option value="*">* asterisk</option>
                <option value="+">+ plus</option>
              </Select>
            )}
          </Field>
          <Field label="Code blocks">
            {(id) => (
              <Select id={id} value={o.codeBlockStyle} onChange={(e) => setO({ ...o, codeBlockStyle: e.target.value as TurndownOptions["codeBlockStyle"] })}>
                <option value="fenced">``` fenced</option>
                <option value="indented">Indented</option>
              </Select>
            )}
          </Field>
          <Field label="Emphasis">
            {(id) => (
              <Select id={id} value={o.emDelimiter} onChange={(e) => setO({ ...o, emDelimiter: e.target.value as TurndownOptions["emDelimiter"] })}>
                <option value="_">_underscore_</option>
                <option value="*">*asterisk*</option>
              </Select>
            )}
          </Field>
          <div className="flex items-end pb-1.5">
            <Checkbox label="GFM tables & strikethrough" checked={o.gfm} onChange={(v) => setO({ ...o, gfm: v })} />
          </div>
        </div>
      </Panel>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="HTML" actions={<CopyButton text={html} />}>
          <Textarea
            value={html}
            onChange={(e) => setHtml(e.target.value)}
            placeholder={"<h1>Title</h1>\n<p>Paste HTML, e.g. copied from a page's source…</p>"}
            aria-label="HTML input"
            data-testid="input"
            className="min-h-[360px]"
          />
        </Panel>
        <TextOutput value={debounced.trim() ? md : ""} label="Markdown" filename="converted.md" mime="text/markdown;charset=utf-8" className="[&_textarea]:min-h-[360px]" />
      </div>
      <p className="text-xs text-fg-subtle">
        The HTML is parsed into an inert document: scripts never run, and &lt;script&gt;, &lt;style&gt; and &lt;iframe&gt; content is dropped.
      </p>
      <ErrorMessage error={debounced.trim() ? error : null} />
      <ActionBar
        onReset={() => {
          setHtml("");
          setO(defaultTurndownOptions);
          setMd("");
          setError(null);
        }}
      />
    </div>
  );
}
