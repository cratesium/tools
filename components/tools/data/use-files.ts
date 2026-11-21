"use client";

import { useEffect, useMemo, useState } from "react";
import { sourceFromFile, type DataSource } from "@/lib/processors/data/load";
import { toTable, type Table } from "@/lib/processors/data/table";
import { errorMessage } from "@/lib/utils/hooks";

export interface LoadedFile {
  name: string;
  table: Table;
}

/** Parses several uploaded CSV/TSV/JSON/Excel files (first sheet) into tables. */
export function useTablesFromFiles(files: File[], hasHeader: boolean) {
  // Results are tagged with the file list they belong to, so stale results are ignored
  // and loading/error state is derived instead of set synchronously in the effect.
  const [state, setState] = useState<{ files: File[] | null; sources: DataSource[]; error: string | null }>({ files: null, sources: [], error: null });

  useEffect(() => {
    if (!files.length) return;
    let alive = true;
    Promise.all(
      files.map((f) =>
        sourceFromFile(f).catch((e) => {
          throw new Error(`${f.name}: ${errorMessage(e)}`);
        }),
      ),
    )
      .then((s) => alive && setState({ files, sources: s, error: null }))
      .catch((e) => alive && setState({ files, sources: [], error: errorMessage(e) }));
    return () => {
      alive = false;
    };
  }, [files]);

  const fresh = files.length > 0 && state.files === files;
  const sources = useMemo(() => (fresh ? state.sources : []), [fresh, state.sources]);
  const tables = useMemo<LoadedFile[]>(
    () => sources.map((s) => ({ name: s.name, table: toTable(s.sheets[0]?.rows ?? [], s.headerFixed || hasHeader) })),
    [sources, hasHeader],
  );
  return { tables, error: fresh ? state.error : null, loading: files.length > 0 && !fresh };
}
