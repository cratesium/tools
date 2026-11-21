"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox, Select } from "@/components/ui/field";
import { ActionBar, FileResult } from "@/components/tools/shared";
import { apiPath, callApiBlob, normalizeUrlInput } from "@/lib/processors/web/api";
import { ApiErrorNotice, QueryBar, useApi } from "./common";

const SIZES = { desktop: [1280, 800], laptop: [1440, 900], tablet: [834, 1112], mobile: [390, 844] } as const;

export default function Screenshot(_props: ToolComponentProps) {
  const [size, setSize] = useState<keyof typeof SIZES>("desktop");
  const [full, setFull] = useState(false);
  const [format, setFormat] = useState<"png" | "jpeg">("png");
  const api = useApi<{ blob: Blob; host: string }>();
  return (
    <div className="space-y-4">
      <QueryBar
        placeholder="https://example.com"
        label="Capture"
        inputMode="url"
        running={api.running}
        onSubmit={(v) =>
          api.run(async () => {
            const url = normalizeUrlInput(v);
            const [width, height] = SIZES[size];
            const r = await callApiBlob(apiPath("/api/screenshot", { url, width, height, fullPage: full, format }));
            return { blob: r.blob, host: new URL(url).hostname };
          })
        }
      >
        <Select aria-label="Viewport" value={size} onChange={(e) => setSize(e.target.value as keyof typeof SIZES)} className="h-11 sm:w-44">
          {Object.entries(SIZES).map(([k, [w, h]]) => (
            <option key={k} value={k}>
              {k[0].toUpperCase() + k.slice(1)} ({w}×{h})
            </option>
          ))}
        </Select>
      </QueryBar>
      <div className="flex flex-wrap gap-5">
        <Checkbox label="Full page" checked={full} onChange={setFull} />
        <Checkbox label="JPEG (smaller file)" checked={format === "jpeg"} onChange={(v) => setFormat(v ? "jpeg" : "png")} />
      </div>
      {api.running ? <p className="text-sm text-fg-subtle">Rendering the page in a headless browser… this can take up to 30 seconds.</p> : null}
      <ApiErrorNotice error={api.error} />
      {api.data ? <FileResult blob={api.data.blob} filename={`${api.data.host}-${size}.${format === "jpeg" ? "jpg" : "png"}`} label="Screenshot" /> : null}
      <ActionBar onReset={api.reset} />
    </div>
  );
}
