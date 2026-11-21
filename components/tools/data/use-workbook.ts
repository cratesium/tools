"use client";

import { useEffect, useState } from "react";
import type { WorkBook, XLSXModule } from "@/lib/processors/data/excel";
import { errorMessage } from "@/lib/utils/hooks";

export interface LoadedWorkbook {
  file: File;
  wb: WorkBook;
}

/** Reads one or more Excel files with SheetJS (loaded on demand). */
export function useWorkbooks(files: File[]) {
  const [state, setState] = useState<{ files: File[] | null; X: XLSXModule | null; books: LoadedWorkbook[]; error: string | null }>({
    files: null,
    X: null,
    books: [],
    error: null,
  });

  useEffect(() => {
    if (!files.length) return;
    let alive = true;
    (async () => {
      const excel = await import("@/lib/processors/data/excel");
      const mod = await excel.loadXlsx();
      const out: LoadedWorkbook[] = [];
      for (const f of files) {
        try {
          out.push({ file: f, wb: excel.readWorkbook(mod, await f.arrayBuffer()) });
        } catch (e) {
          throw new Error(`${f.name}: ${errorMessage(e)}`);
        }
      }
      return { mod, out };
    })()
      .then(({ mod, out }) => alive && setState({ files, X: mod, books: out, error: null }))
      .catch((e) => alive && setState({ files, X: null, books: [], error: errorMessage(e) }));
    return () => {
      alive = false;
    };
  }, [files]);

  const fresh = files.length > 0 && state.files === files;
  return { X: fresh ? state.X : null, books: fresh ? state.books : [], error: fresh ? state.error : null, loading: files.length > 0 && !fresh };
}
