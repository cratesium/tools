"use client";

import { useState } from "react";
import { Monitor, Smartphone, Tablet } from "lucide-react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox, Segmented } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { ActionBar, DownloadButton, Panel } from "@/components/tools/shared";
import { useDebounced } from "@/lib/utils/hooks";
import { CodeInput } from "./code-panels";

const SAMPLE = `<!doctype html>
<html>
<head>
  <style>
    body { font-family: system-ui, sans-serif; margin: 2rem; color: #18181b; }
    .card { border: 1px solid #e4e4e7; border-radius: 12px; padding: 1.25rem; max-width: 28rem; }
    button { background: #18181b; color: #fff; border: 0; border-radius: 8px; padding: .5rem 1rem; }
  </style>
</head>
<body>
  <div class="card">
    <h2>Hello from the preview</h2>
    <p>Edit the HTML on the left and the page updates live.</p>
    <button onclick="this.textContent='Clicked!'">Click me</button>
  </div>
</body>
</html>`;

const WIDTHS = { desktop: "100%", tablet: "768px", mobile: "375px" } as const;

/**
 * Renders user HTML in a sandboxed iframe via srcdoc. Scripts may run only when the user opts in,
 * and even then the frame has an opaque origin (no allow-same-origin), so it cannot touch this page.
 */
export default function HtmlPreview(_props: ToolComponentProps) {
  const [html, setHtml] = useState("");
  const [scripts, setScripts] = useState(false);
  const [device, setDevice] = useState<keyof typeof WIDTHS>("desktop");
  const debounced = useDebounced(html, 300);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <CodeInput value={html} onChange={setHtml} label="HTML" placeholder="Paste or write HTML, CSS and JS…" sample={SAMPLE} accept=".html,.htm,text/html" className="min-h-[420px]" />
        <Panel
          title="Preview"
          actions={
            <Segmented
              label="Viewport"
              value={device}
              onChange={setDevice}
              options={[
                { value: "desktop", label: <Monitor className="h-3.5 w-3.5" aria-label="Desktop" /> },
                { value: "tablet", label: <Tablet className="h-3.5 w-3.5" aria-label="Tablet" /> },
                { value: "mobile", label: <Smartphone className="h-3.5 w-3.5" aria-label="Mobile" /> },
              ]}
            />
          }
        >
          <div className="flex justify-center overflow-x-auto rounded-lg border border-border bg-bg-muted">
            <iframe
              key={scripts ? "js" : "nojs"}
              title="HTML preview"
              sandbox={scripts ? "allow-scripts allow-modals allow-forms" : ""}
              srcDoc={debounced}
              referrerPolicy="no-referrer"
              className="h-[420px] bg-white"
              style={{ width: WIDTHS[device], maxWidth: "100%" }}
              data-testid="output"
            />
          </div>
        </Panel>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <Checkbox label="Run JavaScript" description="Scripts run in an isolated, opaque-origin sandbox" checked={scripts} onChange={setScripts} />
        <DownloadButton text={html} filename="preview.html" mime="text/html;charset=utf-8" label="Download .html" variant="secondary" />
      </div>
      {!scripts ? <Alert tone="info">JavaScript is disabled in the preview by default. Enable it to test interactive code.</Alert> : null}
      <ActionBar onReset={() => (setHtml(""), setScripts(false))} />
    </div>
  );
}
