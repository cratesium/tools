"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox, Segmented } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { ActionBar, DataTable, DownloadButton, ErrorMessage, FileResult, Panel, TaskProgress } from "@/components/tools/shared";
import type { PageTable } from "@/lib/processors/pdf/office-tables";
import { useTask } from "@/lib/utils/hooks";
import { PdfPicker, outName, usePdfLoader } from "./common";
import { ScannedNotice, extractAllText } from "./helpers";
import type { PageText } from "@/lib/processors/pdf/text";

/** PDF to Excel (mode "excel") and Extract Tables (mode "tables", CSV-first). */
export default function PdfTables({ tool }: ToolComponentProps) {
  const excel = tool.processorOptions?.mode === "excel";
  const loader = usePdfLoader();
  const L = loader.loaded;
  const [layout, setLayout] = useState<"sheets" | "single">("sheets");
  const [nums, setNums] = useState(true);
  const task = useTask<{ pages: PageText[]; tables: PageTable[]; xlsx: Uint8Array; csv: string }>();
  const run = () =>
    task.run(async (ctx) => {
      if (!L) throw new Error("Add a PDF first.");
      const pages = await extractAllText(L, ctx, 0.8);
      const { pagesToTables, tablesToXlsx, tablesToCsv } = await import("@/lib/processors/pdf/office-tables");
      const tables = pagesToTables(pages).filter((t) => t.grid.length);
      ctx.progress(0.9, "Building spreadsheet…");
      return { pages, tables, xlsx: await tablesToXlsx(tables, { layout, convertNumbers: nums }), csv: tablesToCsv(tables) };
    });
  const r = task.result;
  return (
    <div className="space-y-4">
      <PdfPicker loader={loader} />
      <div className="flex flex-wrap items-center gap-4">
        <Segmented label="Sheets" value={layout} onChange={setLayout} options={[{ value: "sheets", label: "One sheet per page" }, { value: "single", label: "All pages in one sheet" }]} />
        <Checkbox label="Convert numbers" checked={nums} onChange={setNums} />
      </div>
      <ActionBar onRun={run} runLabel={excel ? "Convert to Excel" : "Extract tables"} running={task.running} disabled={!L} onCancel={task.cancel} onReset={() => (loader.reset(), task.reset())} />
      <TaskProgress running={task.running} progress={task.progress} label={task.progressLabel} />
      <ErrorMessage error={task.error} />
      {r && L ? (
        <>
          <ScannedNotice pages={r.pages} />
          {r.tables.length ? (
            <>
              <FileResult blob={new Blob([r.xlsx as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })} filename={outName(L.file.name, "", "xlsx")} preview={false} label="Excel workbook">
                <DownloadButton text={r.csv} filename={outName(L.file.name, "", "csv")} mime="text/csv" label="Download CSV" size="sm" variant="secondary" />
              </FileResult>
              <Panel title={`Preview – page ${r.tables[0].page}`}>
                <div data-testid="output"><DataTable headers={r.tables[0].grid[0]?.map((_, i) => `Column ${i + 1}`) ?? []} rows={r.tables[0].grid} max={60} /></div>
              </Panel>
            </>
          ) : (
            <Alert tone="warning">No table-like text was detected. Tables drawn as images need OCR first.</Alert>
          )}
        </>
      ) : null}
      <Alert tone="info">Tables are reconstructed from the position of text on each page (columns are inferred from aligned text). Results are excellent for clean, ruled tables but may need tidying for complex layouts with merged cells.</Alert>
    </div>
  );
}
