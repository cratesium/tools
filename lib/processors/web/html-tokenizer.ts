/**
 * Small, forgiving HTML tokenizer for syntax highlighting. It never throws and the tokens
 * always concatenate back to the exact input, so the highlighted view is a faithful copy.
 */

export type HtmlTokenType =
  | "text"
  | "comment"
  | "doctype"
  | "cdata"
  | "punct" // < </ > />
  | "tag"
  | "attr"
  | "eq"
  | "value"
  | "entity"
  | "raw"; // contents of <script>/<style>/<textarea>/<title>

export interface HtmlToken {
  type: HtmlTokenType;
  text: string;
}

const RAW_TEXT = new Set(["script", "style", "textarea", "title", "xmp"]);

export function tokenizeHtml(src: string): HtmlToken[] {
  const out: HtmlToken[] = [];
  const push = (type: HtmlTokenType, text: string) => {
    if (!text) return;
    const last = out[out.length - 1];
    if (last && last.type === type && (type === "text" || type === "raw")) last.text += text;
    else out.push({ type, text });
  };
  const pushText = (text: string) => {
    let last = 0;
    const re = /&(?:#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      push("text", text.slice(last, m.index));
      push("entity", m[0]);
      last = m.index + m[0].length;
    }
    push("text", text.slice(last));
  };
  let i = 0;
  const n = src.length;
  while (i < n) {
    const lt = src.indexOf("<", i);
    if (lt < 0) {
      pushText(src.slice(i));
      break;
    }
    pushText(src.slice(i, lt));
    i = lt;
    if (src.startsWith("<!--", i)) {
      const end = src.indexOf("-->", i + 4);
      const stop = end < 0 ? n : end + 3;
      push("comment", src.slice(i, stop));
      i = stop;
      continue;
    }
    if (src.startsWith("<![CDATA[", i)) {
      const end = src.indexOf("]]>", i);
      const stop = end < 0 ? n : end + 3;
      push("cdata", src.slice(i, stop));
      i = stop;
      continue;
    }
    if (/^<![a-z]/i.test(src.slice(i, i + 3)) || src.startsWith("<?", i)) {
      const end = src.indexOf(">", i);
      const stop = end < 0 ? n : end + 1;
      push("doctype", src.slice(i, stop));
      i = stop;
      continue;
    }
    const tagMatch = /^<(\/?)([a-zA-Z][\w:.-]*)/.exec(src.slice(i, i + 256));
    if (!tagMatch) {
      push("text", "<");
      i++;
      continue;
    }
    const closing = tagMatch[1] === "/";
    const name = tagMatch[2].toLowerCase();
    push("punct", closing ? "</" : "<");
    push("tag", tagMatch[2]);
    i += tagMatch[0].length;
    // attributes
    while (i < n) {
      const ws = /^\s+/.exec(src.slice(i, i + 4096));
      if (ws) {
        push("text", ws[0]);
        i += ws[0].length;
        continue;
      }
      if (src.startsWith("/>", i)) {
        push("punct", "/>");
        i += 2;
        break;
      }
      if (src[i] === ">") {
        push("punct", ">");
        i++;
        break;
      }
      const attr = /^[^\s"'>/=]+/.exec(src.slice(i, i + 1024));
      if (attr) {
        push("attr", attr[0]);
        i += attr[0].length;
        const eq = /^(\s*)=(\s*)/.exec(src.slice(i, i + 256));
        if (eq) {
          push("text", eq[1]);
          push("eq", "=");
          push("text", eq[2]);
          i += eq[0].length;
          const q = src[i];
          if (q === '"' || q === "'") {
            const end = src.indexOf(q, i + 1);
            const stop = end < 0 ? n : end + 1;
            push("value", src.slice(i, stop));
            i = stop;
          } else {
            const uq = /^[^\s>]+/.exec(src.slice(i, i + 4096));
            if (uq) {
              push("value", uq[0]);
              i += uq[0].length;
            }
          }
        }
        continue;
      }
      // stray character such as a lone "/" or quote
      push("text", src[i]);
      i++;
    }
    if (!closing && RAW_TEXT.has(name)) {
      const re = new RegExp(`</${name}\\s*>`, "i");
      const rest = src.slice(i);
      const m = re.exec(rest);
      const stop = m ? i + m.index : n;
      push("raw", src.slice(i, stop));
      i = stop;
    }
  }
  return out;
}

/** Basic statistics shown next to the source view. */
export function htmlSourceStats(src: string) {
  const tokens = tokenizeHtml(src);
  const tags = new Map<string, number>();
  let prevPunct = "";
  for (const t of tokens) {
    if (t.type === "punct") prevPunct = t.text;
    else if (t.type === "tag" && prevPunct === "<") tags.set(t.text.toLowerCase(), (tags.get(t.text.toLowerCase()) ?? 0) + 1);
  }
  return {
    lines: src ? src.split(/\r\n|\r|\n/).length : 0,
    bytes: new TextEncoder().encode(src).length,
    elements: [...tags.values()].reduce((a, b) => a + b, 0),
    comments: tokens.filter((t) => t.type === "comment").length,
    topTags: [...tags.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12),
  };
}
