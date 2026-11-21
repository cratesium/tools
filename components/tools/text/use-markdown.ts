"use client";

import { useEffect, useState } from "react";
import { markdownToHtml, sanitizeHtml, type MarkdownOptions } from "@/lib/processors/text/markdown";
import { errorMessage } from "@/lib/utils/hooks";

/**
 * Renders Markdown to HTML and sanitizes it with DOMPurify (loaded on demand).
 * Returns both the raw marked output (for code export) and the sanitized HTML,
 * which is the only version that may be injected into the page.
 */
export function useMarkdown(md: string, opts: MarkdownOptions) {
  const [state, setState] = useState<{ raw: string; safe: string; error: string | null }>({ raw: "", safe: "", error: null });
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const raw = markdownToHtml(md, opts);
        const safe = await sanitizeHtml(raw);
        if (alive) setState({ raw, safe, error: null });
      } catch (e) {
        if (alive) setState({ raw: "", safe: "", error: errorMessage(e) });
      }
    })();
    return () => {
      alive = false;
    };
    // opts is a small object literal; compare by value
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [md, opts.gfm, opts.breaks]);
  return state;
}
