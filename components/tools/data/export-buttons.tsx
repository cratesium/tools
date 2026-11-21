"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportTable, EXPORT_LABELS, type ExportFormat } from "@/lib/processors/data/export";
import type { Table } from "@/lib/processors/data/table";
import { downloadBlob } from "@/lib/utils/download";
import { errorMessage } from "@/lib/utils/hooks";

const EXT: Record<ExportFormat, string> = { csv: "csv", tsv: "tsv", json: "json", xlsx: "xlsx" };

/** One download button per format. Excel export loads SheetJS on demand. */
export function ExportButtons({
  table,
  baseName,
  formats = ["csv", "xlsx", "json"],
  size = "sm",
  onError,
}: {
  table: Table | null;
  baseName: string;
  formats?: ExportFormat[];
  size?: "sm" | "md";
  onError?: (msg: string) => void;
}) {
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  return (
    <>
      {formats.map((f, i) => (
        <Button
          key={f}
          size={size}
          variant={i === 0 ? "primary" : "secondary"}
          disabled={!table}
          loading={busy === f}
          data-testid={i === 0 ? "download" : `download-${f}`}
          icon={<Download className="h-3.5 w-3.5" />}
          onClick={async () => {
            if (!table) return;
            setBusy(f);
            try {
              const blob = await exportTable(table, f);
              downloadBlob(blob, `${baseName}.${EXT[f]}`);
            } catch (e) {
              onError?.(errorMessage(e));
            } finally {
              setBusy(null);
            }
          }}
        >
          {EXPORT_LABELS[f]}
        </Button>
      ))}
    </>
  );
}
