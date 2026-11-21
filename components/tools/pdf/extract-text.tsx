"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox, Segmented } from "@/components/ui/field";
import { ActionBar, ErrorMessage, TaskProgress, TextOutput } from "@/components/tools/shared";
import type { PageText } from "@/lib/processors/pdf/text";
import type { TextMode } from "@/lib/processors/pdf/text-export";
import { useTask } from "@/lib/utils/hooks";
import { useEffect } from "react";
import { PdfPicker, outName, usePdfLoader } from "./common";
import { ScannedNotice, extractAllText } from "./helpers";

export default function ExtractText(_props: ToolComponentProps) {
  const loader = usePdfLoader();
  const L = loader.loaded;
  const [mode, setMode] = useState<TextMode>("paragraphs");
  const [seps, setSeps] = useState(true);
  const [text, setText] = useState("");
  const task = useTask<PageText[]>();
  const run = () => task.run(async (ctx) => (L ? extractAllText(L, ctx) : Promise.reject(new Error("Add a PDF first."))));
  useEffect(() => {
    if (!task.result) return;
    import("@/lib/processors/pdf/text-export").then((m) => setText(m.pagesToText(task.result!, { mode, separators: seps })));
  }, [task.result, mode, seps]);
  return (
    <div className="space-y-4">
      <PdfPicker loader={loader} />
      <div className="flex flex-wrap items-center gap-4">
        <Segmented label="Layout" value={mode} onChange={setMode} options={[{ value: "paragraphs", label: "Paragraphs" }, { value: "lines", label: "Lines" }, { value: "layout", label: "Keep layout" }]} />
        <Checkbox label="Page separators" checked={seps} onChange={setSeps} />
      </div>
      <ActionBar onRun={run} runLabel="Extract text" running={task.running} disabled={!L} onCancel={task.cancel} onReset={() => (loader.reset(), task.reset(), setText(""))} />
      <TaskProgress running={task.running} progress={task.progress} label={task.progressLabel} />
      <ErrorMessage error={task.error} />
      {task.result ? (
        <>
          <ScannedNotice pages={task.result} />
          <TextOutput value={text} filename={outName(L?.file.name, "", "txt")} label={`Text (${text.length.toLocaleString()} characters)`} rows={18} />
        </>
      ) : null}
    </div>
  );
}
