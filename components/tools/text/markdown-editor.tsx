"use client";

import { useRef, useState } from "react";
import { Bold, Code, Heading2, Italic, Link2, List, ListOrdered, Quote, Table } from "lucide-react";
import type { ToolComponentProps } from "@/types/tool";
import { Button } from "@/components/ui/button";
import { Checkbox, Segmented, Textarea } from "@/components/ui/field";
import { ActionBar, CopyButton, DownloadButton, ErrorMessage, Panel } from "@/components/tools/shared";
import { firstHeading, htmlDocument } from "@/lib/processors/text/markdown";
import { countWords } from "@/lib/processors/text/counters";
import { slugify } from "@/lib/processors/text/slug";
import { useDebounced } from "@/lib/utils/hooks";
import { cn } from "@/lib/utils/cn";
import { useMarkdown } from "./use-markdown";

const SAMPLE = `# Project notes

Write **Markdown** on the left and see the result on the right.

## Checklist

- [x] Headings, *emphasis* and \`inline code\`
- [ ] Tables and task lists (GFM)

| Feature | Supported |
| ------- | --------- |
| Tables  | Yes       |

> Everything stays in your browser.

\`\`\`js
console.log("hello");
\`\`\`
`;

type Snippet = { icon: React.ReactNode; label: string; before: string; after?: string; placeholder: string; block?: boolean };

const SNIPPETS: Snippet[] = [
  { icon: <Bold className="h-3.5 w-3.5" />, label: "Bold", before: "**", after: "**", placeholder: "bold text" },
  { icon: <Italic className="h-3.5 w-3.5" />, label: "Italic", before: "_", after: "_", placeholder: "italic text" },
  { icon: <Heading2 className="h-3.5 w-3.5" />, label: "Heading", before: "## ", placeholder: "Heading", block: true },
  { icon: <Link2 className="h-3.5 w-3.5" />, label: "Link", before: "[", after: "](https://)", placeholder: "link text" },
  { icon: <Code className="h-3.5 w-3.5" />, label: "Code", before: "`", after: "`", placeholder: "code" },
  { icon: <List className="h-3.5 w-3.5" />, label: "Bulleted list", before: "- ", placeholder: "List item", block: true },
  { icon: <ListOrdered className="h-3.5 w-3.5" />, label: "Numbered list", before: "1. ", placeholder: "List item", block: true },
  { icon: <Quote className="h-3.5 w-3.5" />, label: "Quote", before: "> ", placeholder: "Quote", block: true },
  { icon: <Table className="h-3.5 w-3.5" />, label: "Table", before: "| Column | Column |\n| ------ | ------ |\n| ", after: " | Cell |", placeholder: "Cell", block: true },
];

export default function MarkdownEditor(_props: ToolComponentProps) {
  const [md, setMd] = useState(SAMPLE);
  const [gfm, setGfm] = useState(true);
  const [breaks, setBreaks] = useState(false);
  const [layout, setLayout] = useState<"split" | "editor" | "preview">("split");
  const ref = useRef<HTMLTextAreaElement>(null);
  const debounced = useDebounced(md, 120);
  const { raw, safe, error } = useMarkdown(debounced, { gfm, breaks });

  const title = firstHeading(md) ?? "document";
  const base = slugify(title) || "document";

  function insert(s: Snippet) {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = md.slice(start, end) || s.placeholder;
    const needsNewline = s.block && start > 0 && md[start - 1] !== "\n";
    const before = (needsNewline ? "\n" : "") + s.before;
    const next = md.slice(0, start) + before + selected + (s.after ?? "") + md.slice(end);
    setMd(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1" role="toolbar" aria-label="Formatting">
          {SNIPPETS.map((s) => (
            <Button key={s.label} variant="secondary" size="icon" aria-label={s.label} title={s.label} onClick={() => insert(s)}>
              {s.icon}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Checkbox label="GitHub Flavored" checked={gfm} onChange={setGfm} />
          <Checkbox label="Line breaks → <br>" checked={breaks} onChange={setBreaks} />
          <Segmented
            label="Layout"
            value={layout}
            onChange={setLayout}
            options={[
              { value: "split", label: "Split" },
              { value: "editor", label: "Editor" },
              { value: "preview", label: "Preview" },
            ]}
          />
        </div>
      </div>

      <div className={cn("grid gap-4", layout === "split" && "lg:grid-cols-2")}>
        {layout !== "preview" ? (
          <Panel title="Markdown" actions={<span className="text-xs text-fg-subtle">{countWords(md).toLocaleString("en-US")} words</span>}>
            <Textarea
              ref={ref}
              value={md}
              onChange={(e) => setMd(e.target.value)}
              aria-label="Markdown source"
              data-testid="input"
              className="min-h-[480px]"
            />
          </Panel>
        ) : null}
        {layout !== "editor" ? (
          <Panel title="Preview">
            <div
              className="rendered-preview min-h-[480px] max-w-none overflow-auto text-sm text-fg"
              data-testid="output"
              // Sanitized by DOMPurify in useMarkdown.
              dangerouslySetInnerHTML={{ __html: safe }}
            />
          </Panel>
        ) : null}
      </div>

      <ErrorMessage error={error} />

      <ActionBar onReset={() => { setMd(""); setGfm(true); setBreaks(false); setLayout("split"); }}>
        <DownloadButton text={md} filename={`${base}.md`} mime="text/markdown;charset=utf-8" label="Download .md" size="lg" />
        <DownloadButton text={htmlDocument(safe, title)} filename={`${base}.html`} mime="text/html;charset=utf-8" label="Download .html" size="lg" variant="secondary" />
        <CopyButton text={raw} label="Copy HTML" size="md" />
      </ActionBar>
    </div>
  );
}
