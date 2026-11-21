/**
 * Markdown ⇄ HTML. markdownToHtml returns UNSANITIZED HTML; callers that render it
 * must pass it through sanitizeHtml (DOMPurify) first. Both directions run locally.
 */
import { Marked } from "marked";

export interface MarkdownOptions {
  /** GitHub Flavored Markdown: tables, task lists, strikethrough, autolinks. */
  gfm: boolean;
  /** Treat single line breaks as <br>. */
  breaks: boolean;
}

export const defaultMarkdownOptions: MarkdownOptions = { gfm: true, breaks: false };

export function markdownToHtml(md: string, o: MarkdownOptions = defaultMarkdownOptions): string {
  const m = new Marked({ gfm: o.gfm, breaks: o.breaks, async: false });
  return m.parse(md, { async: false }) as string;
}

/** Sanitizes HTML with DOMPurify. Needs a DOM (browser or jsdom). */
export async function sanitizeHtml(html: string): Promise<string> {
  const { default: DOMPurify } = await import("dompurify");
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Wraps an HTML fragment in a minimal standalone document with readable default styles. */
export function htmlDocument(body: string, title = "Document"): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
body{font:16px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif;max-width:46rem;margin:2rem auto;padding:0 1rem;color:#1a1a1a}
pre{background:#f4f4f5;padding:.75rem;border-radius:6px;overflow-x:auto}
code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.9em}
table{border-collapse:collapse}th,td{border:1px solid #d4d4d8;padding:.35rem .6rem}
blockquote{border-left:3px solid #d4d4d8;margin-left:0;padding-left:1rem;color:#52525b}
img{max-width:100%}
</style>
</head>
<body>
${body}
</body>
</html>
`;
}

/** First heading text, used as a download title. */
export function firstHeading(md: string): string | null {
  const m = md.match(/^#{1,6}\s+(.+?)\s*#*\s*$/m);
  return m ? m[1] : null;
}

export interface TurndownOptions {
  headingStyle: "atx" | "setext";
  bulletListMarker: "-" | "*" | "+";
  codeBlockStyle: "fenced" | "indented";
  emDelimiter: "_" | "*";
  /** Convert <table> to GFM pipe tables and <del>/<s> to ~~strike~~. */
  gfm: boolean;
}

export const defaultTurndownOptions: TurndownOptions = {
  headingStyle: "atx",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  emDelimiter: "_",
  gfm: true,
};

/**
 * HTML → Markdown with Turndown. Turndown parses into an inert document
 * (DOMParser in browsers), so scripts in the input never run.
 */
export async function htmlToMarkdown(html: string, o: TurndownOptions = defaultTurndownOptions): Promise<string> {
  const { default: TurndownService } = await import("turndown");
  const td = new TurndownService({
    headingStyle: o.headingStyle,
    bulletListMarker: o.bulletListMarker,
    codeBlockStyle: o.codeBlockStyle,
    emDelimiter: o.emDelimiter,
    hr: "---",
  });
  td.remove(["script", "style", "noscript", "iframe", "object", "embed", "template"]);
  if (o.gfm) {
    td.addRule("strikethrough", {
      filter: ["del", "s"],
      replacement: (content) => `~~${content}~~`,
    });
    td.addRule("taskListItems", {
      filter: (node) => node.nodeName === "INPUT" && (node as HTMLInputElement).getAttribute("type") === "checkbox",
      replacement: (_c, node) => ((node as HTMLInputElement).hasAttribute("checked") ? "[x] " : "[ ] "),
    });
    td.addRule("tableCell", {
      filter: ["th", "td"],
      replacement: (content, node) => {
        const cell = content.replace(/\n+/g, " ").replace(/\|/g, "\\|").trim();
        const first = !(node as Element).previousElementSibling;
        return (first ? "| " : " ") + cell + " |";
      },
    });
    td.addRule("tableRow", {
      filter: "tr",
      replacement: (content, node) => {
        const tr = node as HTMLTableRowElement;
        let out = "\n" + content.trim();
        const parent = tr.parentNode as Element | null;
        const isFirstRow =
          (parent?.nodeName === "THEAD" && !tr.previousElementSibling) ||
          (parent && parent.nodeName !== "THEAD" && !tr.previousElementSibling && !parent.previousElementSibling);
        if (isFirstRow) {
          const cells = tr.children.length;
          out += "\n|" + " --- |".repeat(cells);
        }
        return out;
      },
    });
    td.addRule("table", {
      filter: "table",
      replacement: (content) => "\n\n" + content.replace(/\n+/g, "\n").trim() + "\n\n",
    });
    td.addRule("tableSection", {
      filter: ["thead", "tbody", "tfoot"],
      replacement: (content) => content,
    });
  }
  return td.turndown(html).trim() + "\n";
}
