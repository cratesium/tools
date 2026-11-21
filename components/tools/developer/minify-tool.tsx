"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox } from "@/components/ui/field";
import { ActionBar, Panel, Settings, TaskProgress, TextOutput } from "@/components/tools/shared";
import { minifyCss, minifyJs } from "@/lib/processors/developer/code-format";
import { minifyHtml } from "@/lib/processors/developer/html-minify";
import { minifySql } from "@/lib/processors/developer/sql-minify";
import { formatBytes } from "@/lib/utils/format";
import { CodeInput, LocatedError, Stats, sizeOf, useLiveAsync } from "./code-panels";

type Lang = "html" | "css" | "javascript" | "sql";

const SAMPLES: Record<Lang, string> = {
  html: `<!DOCTYPE html>
<html lang="en">
  <head>
    <!-- page metadata -->
    <title>  Minify me  </title>
    <style type="text/css">
      body { margin: 0;  color: #111; }
    </style>
  </head>
  <body>
    <pre>  keep   this
    spacing </pre>
    <p class="intro">
      Hello,   <strong>world</strong>!
    </p>
    <script type="text/javascript">
      const greeting = "hi";   console.log(greeting);
    </script>
  </body>
</html>`,
  css: `/*! License: MIT */
.button {
  padding: 8px 16px;
  margin: 0px 0px 0px 0px;
  color: #ffffff;
  background-color: #000000;
}
.button:hover { opacity: 0.9; }
.button:hover { cursor: pointer; }`,
  javascript: `/** Adds numbers. @license MIT */
function addAll(numbers) {
  let total = 0;
  for (const value of numbers) {
    total = total + value;
  }
  console.log("total", total);
  return total;
}
export default addAll;`,
  sql: `-- Active customers with orders
SELECT c.id,
       c.name,   COUNT(o.id) AS orders   /* count */
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id
WHERE c.active = 1
GROUP BY c.id, c.name;`,
};
const ACCEPT: Record<Lang, string> = { html: ".html,.htm,text/html", css: ".css,text/css", javascript: ".js,.mjs,.cjs,text/javascript", sql: ".sql,text/plain" };
const EXT: Record<Lang, string> = { html: "html", css: "css", javascript: "js", sql: "sql" };

/** HTML (custom, safe), CSS (CSSO), JavaScript (Terser) and SQL (tokenizer) minifier. */
export default function MinifyTool({ tool }: ToolComponentProps) {
  const lang = (tool.processorOptions?.language as Lang) ?? "html";
  const [text, setText] = useState("");
  // HTML
  const [removeComments, setRemoveComments] = useState(true);
  const [aggressive, setAggressive] = useState(false);
  const [removeQuotes, setRemoveQuotes] = useState(false);
  const [minifyInline, setMinifyInline] = useState(true);
  // CSS / JS
  const [restructure, setRestructure] = useState(true);
  const [keepLicense, setKeepLicense] = useState(true);
  const [mangle, setMangle] = useState(true);
  const [dropConsole, setDropConsole] = useState(false);
  const [moduleMode, setModuleMode] = useState(true);
  // SQL
  const [keepHints, setKeepHints] = useState(true);
  const [statementPerLine, setStatementPerLine] = useState(false);

  const { result, error, busy } = useLiveAsync(
    text,
    async (src) => {
      if (lang === "css") return minifyCss(src, { restructure, keepLicenseComments: keepLicense });
      if (lang === "javascript") return minifyJs(src, { mangle, compress: true, keepLicenseComments: keepLicense, module: moduleMode, dropConsole });
      if (lang === "sql") return minifySql(src, { keepHints, statementPerLine });
      return minifyHtml(
        src,
        { removeComments, aggressiveWhitespace: aggressive, removeAttributeQuotes: removeQuotes, removeDefaultTypes: true },
        minifyInline ? { css: (c) => minifyCss(c), js: (c) => minifyJs(c, { module: false }) } : {},
      );
    },
    [lang, removeComments, aggressive, removeQuotes, minifyInline, restructure, keepLicense, mangle, dropConsole, moduleMode, keepHints, statementPerLine],
    400,
  );

  const before = sizeOf(text);
  const after = result != null ? sizeOf(result) : 0;

  return (
    <div className="space-y-4">
      <CodeInput value={text} onChange={setText} label={tool.inputFormats[0] ?? "Code"} placeholder="Paste code to minify…" sample={SAMPLES[lang]} accept={ACCEPT[lang]} />
      <Panel title="Options">
        <Settings>
          {lang === "html" ? (
            <>
              <Checkbox label="Remove comments" description="Conditional comments are kept" checked={removeComments} onChange={setRemoveComments} />
              <Checkbox label="Minify inline CSS and JS" checked={minifyInline} onChange={setMinifyInline} />
              <Checkbox label="Aggressive whitespace" description="Also removes spaces between inline elements – may change rendering" checked={aggressive} onChange={setAggressive} />
              <Checkbox label="Remove attribute quotes" description="Only where HTML allows it" checked={removeQuotes} onChange={setRemoveQuotes} />
            </>
          ) : null}
          {lang === "css" ? (
            <>
              <Checkbox label="Restructure rules" description="Merge duplicate selectors and declarations" checked={restructure} onChange={setRestructure} />
              <Checkbox label="Keep /*! license */ comments" checked={keepLicense} onChange={setKeepLicense} />
            </>
          ) : null}
          {lang === "javascript" ? (
            <>
              <Checkbox label="Mangle names" description="Shorten local variable names" checked={mangle} onChange={setMangle} />
              <Checkbox label="ES module" description="Allows import/export and top-level mangling" checked={moduleMode} onChange={setModuleMode} />
              <Checkbox label="Remove console.* calls" checked={dropConsole} onChange={setDropConsole} />
              <Checkbox label="Keep license comments" checked={keepLicense} onChange={setKeepLicense} />
            </>
          ) : null}
          {lang === "sql" ? (
            <>
              <Checkbox label="Keep optimizer hints" description="/*+ … */ comments" checked={keepHints} onChange={setKeepHints} />
              <Checkbox label="One statement per line" checked={statementPerLine} onChange={setStatementPerLine} />
            </>
          ) : null}
        </Settings>
      </Panel>
      <TaskProgress running={busy} progress={null} label="Minifying…" />
      <LocatedError error={error} title="Could not minify" />
      {result != null && !error ? (
        <>
          <Stats
            items={[
              ["Original", formatBytes(before)],
              ["Minified", formatBytes(after)],
              ["Saved", before ? `${(((before - after) / before) * 100).toFixed(1)}%` : "—"],
            ]}
          />
          <TextOutput value={result} filename={`minified.${EXT[lang]}`} />
        </>
      ) : null}
      <ActionBar onReset={() => setText("")} />
    </div>
  );
}
