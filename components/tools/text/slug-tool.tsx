"use client";

import { useMemo, useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import {
  defaultSlugOptions,
  defaultUnslugOptions,
  slugify,
  unslug,
  type SlugOptions,
  type UnslugOptions,
} from "@/lib/processors/text/slug";
import { useDebounced } from "@/lib/utils/hooks";
import { TransformLayout } from "./common";

/** Text → slug (processorOptions.direction "to-slug") and slug → text ("to-text"). Works line by line. */
export default function SlugTool({ tool }: ToolComponentProps) {
  const toText = tool.processorOptions?.direction === "to-text";
  const [text, setText] = useState("");
  const [so, setSo] = useState<SlugOptions>(defaultSlugOptions);
  const [uo, setUo] = useState<UnslugOptions>(defaultUnslugOptions);
  const input = useDebounced(text, 80);

  const output = useMemo(
    () =>
      input
        .split(/\r?\n/)
        .map((l) => (l.trim() ? (toText ? unslug(l, uo) : slugify(l, so)) : ""))
        .join("\n"),
    [input, toText, so, uo],
  );

  const options = toText ? (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Field label="Capitalisation">
        {(id) => (
          <Select id={id} value={uo.case} onChange={(e) => setUo({ ...uo, case: e.target.value as UnslugOptions["case"] })}>
            <option value="sentence">Sentence case</option>
            <option value="title">Title Case</option>
            <option value="lower">lower case</option>
            <option value="upper">UPPER CASE</option>
            <option value="as-is">Keep as is</option>
          </Select>
        )}
      </Field>
      <Checkbox label="Strip URL parts" description="Path, query, #hash and .html" checked={uo.stripUrlParts} onChange={(v) => setUo({ ...uo, stripUrlParts: v })} />
      <Checkbox label="Strip numeric IDs" description="“123-my-post-456” → “My post”" checked={uo.stripIds} onChange={(v) => setUo({ ...uo, stripIds: v })} />
    </div>
  ) : (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Field label="Separator">
        {(id) => (
          <Select id={id} value={so.separator} onChange={(e) => setSo({ ...so, separator: e.target.value as SlugOptions["separator"] })}>
            <option value="-">Hyphen (-)</option>
            <option value="_">Underscore (_)</option>
            <option value=".">Dot (.)</option>
          </Select>
        )}
      </Field>
      <Field label="Max length" hint="0 = no limit">
        {(id) => (
          <Input id={id} type="number" min={0} max={500} value={so.maxLength} onChange={(e) => setSo({ ...so, maxLength: Math.max(0, Number(e.target.value) || 0) })} />
        )}
      </Field>
      <div className="space-y-2">
        <Checkbox label="Lowercase" checked={so.lowercase} onChange={(v) => setSo({ ...so, lowercase: v })} />
        <Checkbox label="Remove stop words" description="a, the, of, and…" checked={so.removeStopWords} onChange={(v) => setSo({ ...so, removeStopWords: v })} />
      </div>
      <div className="space-y-2">
        <Checkbox label="Spell out symbols" description="& → and, % → percent" checked={so.replaceSymbols} onChange={(v) => setSo({ ...so, replaceSymbols: v })} />
        <Checkbox label="Transliterate" description="ß → ss, Привет → privet" checked={so.transliterate} onChange={(v) => setSo({ ...so, transliterate: v })} />
        <Checkbox label="Keep other scripts" description="Keep 日本語 instead of dropping it" checked={so.keepUnicode} onChange={(v) => setSo({ ...so, keepUnicode: v })} />
      </div>
    </div>
  );

  return (
    <TransformLayout
      input={text}
      onInput={setText}
      placeholder={toText ? "my-blog-post-title\nhttps://example.com/blog/another_post.html" : "My Blog Post Title\nCrème brûlée & café recipes"}
      inputLabel={toText ? "Slugs or URLs (one per line)" : "Titles (one per line)"}
      options={options}
      output={output}
      outputLabel={toText ? "Readable text" : "Slugs"}
      filename={toText ? "text.txt" : "slugs.txt"}
      onReset={() => {
        setText("");
        setSo(defaultSlugOptions);
        setUo(defaultUnslugOptions);
      }}
    />
  );
}
