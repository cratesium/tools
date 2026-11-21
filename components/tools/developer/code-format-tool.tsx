"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox, Field, Select } from "@/components/ui/field";
import { ActionBar, Settings, TaskProgress, TextOutput } from "@/components/tools/shared";
import { formatCode, type CodeLanguage } from "@/lib/processors/developer/code-format";
import { CodeInput, LocatedError, useLiveAsync } from "./code-panels";

const SAMPLES: Record<string, string> = {
  html: `<!doctype html><html><head><title>Demo</title><style>body{margin:0}</style></head><body><nav class="top"><a href="/">Home</a><a href="/about">About</a></nav><main><h1>Hello</h1><p>Some <b>bold</b> text.</p><ul><li>One</li><li>Two</li></ul></main><script>document.querySelector("h1").onclick=()=>alert("hi")</script></body></html>`,
  css: `.card{display:flex;gap:12px;padding:16px 24px;border:1px solid #e4e4e7;border-radius:8px}.card:hover{box-shadow:0 1px 3px rgba(0,0,0,.1)}@media (max-width:600px){.card{flex-direction:column}}`,
  javascript: `const fetchUsers=async(ids)=>{const res=await Promise.all(ids.map(id=>fetch(\`/api/users/\${id}\`).then(r=>r.json())));return res.filter(u=>u.active).map(({id,name})=>({id,name}))};export default fetchUsers`,
};
const ACCEPT: Record<string, string> = {
  html: ".html,.htm,.xhtml,.vue,.svelte,text/html",
  css: ".css,.scss,.less,text/css",
  javascript: ".js,.mjs,.cjs,.jsx,.json,text/javascript",
};
const EXT: Record<string, string> = { html: "html", css: "css", javascript: "js" };

/** HTML / CSS / JavaScript formatter powered by Prettier (processorOptions.language). */
export default function CodeFormatTool({ tool }: ToolComponentProps) {
  const language = (tool.processorOptions?.language as CodeLanguage) ?? "html";
  const [text, setText] = useState("");
  const [tabWidth, setTabWidth] = useState(2);
  const [useTabs, setUseTabs] = useState(false);
  const [printWidth, setPrintWidth] = useState(80);
  const [singleQuote, setSingleQuote] = useState(false);
  const [semi, setSemi] = useState(true);
  const [cssParser, setCssParser] = useState<"css" | "scss" | "less">("css");
  const [ws, setWs] = useState<"css" | "strict" | "ignore">("css");

  const { result, error, busy } = useLiveAsync(
    text,
    (src) => formatCode(src, language, { tabWidth, useTabs, printWidth, singleQuote, semi, cssParser, htmlWhitespaceSensitivity: ws }),
    [language, tabWidth, useTabs, printWidth, singleQuote, semi, cssParser, ws],
    400,
  );

  return (
    <div className="space-y-4">
      <CodeInput value={text} onChange={setText} label={tool.inputFormats[0] ?? "Code"} placeholder="Paste code here…" sample={SAMPLES[language]} accept={ACCEPT[language]} />
      <Settings>
        <Field label="Indentation">
          {(id) => (
            <Select id={id} value={useTabs ? "tab" : String(tabWidth)} onChange={(e) => (e.target.value === "tab" ? setUseTabs(true) : (setUseTabs(false), setTabWidth(Number(e.target.value))))}>
              <option value="2">2 spaces</option>
              <option value="4">4 spaces</option>
              <option value="tab">Tabs</option>
            </Select>
          )}
        </Field>
        <Field label="Print width">
          {(id) => (
            <Select id={id} value={printWidth} onChange={(e) => setPrintWidth(Number(e.target.value))}>
              {[80, 100, 120, 160].map((w) => (
                <option key={w} value={w}>
                  {w} characters
                </option>
              ))}
            </Select>
          )}
        </Field>
        {language === "css" ? (
          <Field label="Syntax">
            {(id) => (
              <Select id={id} value={cssParser} onChange={(e) => setCssParser(e.target.value as "css" | "scss" | "less")}>
                <option value="css">CSS</option>
                <option value="scss">SCSS</option>
                <option value="less">Less</option>
              </Select>
            )}
          </Field>
        ) : null}
        {language === "html" ? (
          <Field label="Whitespace sensitivity">
            {(id) => (
              <Select id={id} value={ws} onChange={(e) => setWs(e.target.value as "css" | "strict" | "ignore")}>
                <option value="css">Respect CSS display (default)</option>
                <option value="strict">Strict – never change rendering</option>
                <option value="ignore">Ignore – prettiest output</option>
              </Select>
            )}
          </Field>
        ) : null}
        {language !== "html" ? <Checkbox label="Single quotes" checked={singleQuote} onChange={setSingleQuote} /> : null}
        {language === "javascript" ? <Checkbox label="Semicolons" checked={semi} onChange={setSemi} /> : null}
      </Settings>
      <TaskProgress running={busy} progress={null} label="Formatting…" />
      <LocatedError error={error} title="Could not format" />
      {result != null && !error ? <TextOutput value={result} filename={`formatted.${EXT[language]}`} /> : null}
      <ActionBar
        onReset={() => {
          setText("");
          setTabWidth(2);
          setUseTabs(false);
          setPrintWidth(80);
          setSingleQuote(false);
          setSemi(true);
        }}
      />
    </div>
  );
}
