"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox, Segmented, Textarea } from "@/components/ui/field";
import { ActionBar, CopyButton, ErrorMessage, Panel, TextOutput } from "@/components/tools/shared";
import { firstHeading, htmlDocument } from "@/lib/processors/text/markdown";
import { useDebounced } from "@/lib/utils/hooks";
import { useMarkdown } from "./use-markdown";

export default function MarkdownToHtml(_props: ToolComponentProps) {
  const [md, setMd] = useState("");
  const [gfm, setGfm] = useState(true);
  const [breaks, setBreaks] = useState(false);
  const [sanitize, setSanitize] = useState(true);
  const [fullDoc, setFullDoc] = useState(false);
  const [tab, setTab] = useState<"code" | "preview">("code");
  const debounced = useDebounced(md, 150);
  const { raw, safe, error } = useMarkdown(debounced, { gfm, breaks });

  const fragment = (sanitize ? safe : raw).trim();
  const output = !debounced.trim() ? "" : fullDoc ? htmlDocument(fragment, firstHeading(debounced) ?? "Document") : fragment + "\n";

  return (
    <div className="space-y-4">
      <Panel title="Options">
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          <Checkbox label="GitHub Flavored Markdown" description="Tables, task lists, ~~strikethrough~~, autolinks" checked={gfm} onChange={setGfm} />
          <Checkbox label="Single line breaks → <br>" checked={breaks} onChange={setBreaks} />
          <Checkbox label="Sanitize output" description="Strip scripts, event handlers and javascript: links" checked={sanitize} onChange={setSanitize} />
          <Checkbox label="Full HTML document" description="Adds <html>, <head> and basic styles" checked={fullDoc} onChange={setFullDoc} />
        </div>
      </Panel>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Markdown" actions={<CopyButton text={md} />}>
          <Textarea value={md} onChange={(e) => setMd(e.target.value)} placeholder={"# Heading\n\nSome **bold** text and a [link](https://example.com)."} aria-label="Markdown input" data-testid="input" className="min-h-[360px]" />
        </Panel>
        <div className="space-y-2">
          <Segmented label="Output view" value={tab} onChange={setTab} options={[{ value: "code", label: "HTML code" }, { value: "preview", label: "Rendered preview" }]} />
          {tab === "code" ? (
            <TextOutput value={output} label="HTML" filename={fullDoc ? "document.html" : "fragment.html"} mime="text/html;charset=utf-8" className="[&_textarea]:min-h-[320px]" />
          ) : (
            <Panel title="Preview (always sanitized)">
              <div className="rendered-preview min-h-[320px] text-sm text-fg" data-testid="output" dangerouslySetInnerHTML={{ __html: safe }} />
            </Panel>
          )}
        </div>
      </div>
      {!sanitize && raw !== safe && debounced ? (
        <p className="text-xs text-warning">The unsanitized output contains markup that the sanitizer would remove (for example scripts or inline event handlers).</p>
      ) : null}
      <ErrorMessage error={error} />
      <ActionBar
        onReset={() => {
          setMd("");
          setGfm(true);
          setBreaks(false);
          setSanitize(true);
          setFullDoc(false);
          setTab("code");
        }}
      />
    </div>
  );
}
