/**
 * SQL minifier: removes comments and collapses whitespace while leaving string
 * literals, quoted identifiers and dollar-quoted bodies untouched. Dialect-agnostic
 * tokenizer; no parsing, so it never rejects SQL it does not understand.
 */

export interface SqlMinifyOptions {
  /** Keep optimizer hints and MySQL executable comments (/*+ ... *\/, /*! ... *\/). */
  keepHints?: boolean;
  /** Treat # as a line comment (MySQL/MariaDB). Off by default because # is an operator in PostgreSQL. */
  hashComments?: boolean;
  /** Put each statement on its own line. */
  statementPerLine?: boolean;
}

type Tok = { t: "ws" | "comment" | "str" | "word" | "punct" | "semi"; v: string };

export function tokenizeSql(sql: string, opts: SqlMinifyOptions = {}): Tok[] {
  const toks: Tok[] = [];
  const n = sql.length;
  let i = 0;
  while (i < n) {
    const c = sql[i];
    const c2 = sql[i + 1];
    if (/\s/.test(c)) {
      let j = i + 1;
      while (j < n && /\s/.test(sql[j])) j++;
      toks.push({ t: "ws", v: sql.slice(i, j) });
      i = j;
    } else if ((c === "-" && c2 === "-") || (c === "#" && opts.hashComments)) {
      let j = sql.indexOf("\n", i);
      if (j < 0) j = n;
      toks.push({ t: "comment", v: sql.slice(i, j) });
      i = j;
    } else if (c === "/" && c2 === "*") {
      // Block comments may nest in PostgreSQL; track depth.
      let depth = 1;
      let j = i + 2;
      while (j < n && depth > 0) {
        if (sql[j] === "/" && sql[j + 1] === "*") {
          depth++;
          j += 2;
        } else if (sql[j] === "*" && sql[j + 1] === "/") {
          depth--;
          j += 2;
        } else j++;
      }
      toks.push({ t: "comment", v: sql.slice(i, j) });
      i = j;
    } else if (c === "'" || c === '"' || c === "`") {
      // Quotes are escaped by doubling; backslash escapes are honoured for '…' (MySQL style).
      let j = i + 1;
      while (j < n) {
        if (sql[j] === "\\" && c === "'") {
          j += 2;
          continue;
        }
        if (sql[j] === c) {
          if (sql[j + 1] === c) {
            j += 2;
            continue;
          }
          j++;
          break;
        }
        j++;
      }
      toks.push({ t: "str", v: sql.slice(i, Math.min(j, n)) });
      i = Math.min(j, n);
    } else if (c === "[") {
      const j = sql.indexOf("]", i);
      const stop = j < 0 ? n : j + 1;
      toks.push({ t: "str", v: sql.slice(i, stop) });
      i = stop;
    } else if (c === "$" && /^\$[A-Za-z_]?\w*\$/.test(sql.slice(i, i + 64))) {
      const tag = /^\$[A-Za-z_]?\w*\$/.exec(sql.slice(i, i + 64))![0];
      const end = sql.indexOf(tag, i + tag.length);
      const stop = end < 0 ? n : end + tag.length;
      toks.push({ t: "str", v: sql.slice(i, stop) });
      i = stop;
    } else if (/[\w$@#]/.test(c) || c.charCodeAt(0) > 127) {
      let j = i + 1;
      while (j < n && (/[\w$@#]/.test(sql[j]) || sql.charCodeAt(j) > 127)) j++;
      toks.push({ t: "word", v: sql.slice(i, j) });
      i = j;
    } else if (c === ";") {
      toks.push({ t: "semi", v: c });
      i++;
    } else {
      toks.push({ t: "punct", v: c });
      i++;
    }
  }
  return toks;
}

/** Characters next to which a separating space is never needed. */
const TIGHT = new Set(["(", ")", ",", ";", "="]);

export function minifySql(sql: string, opts: SqlMinifyOptions = {}): string {
  const toks = tokenizeSql(sql, opts);
  const out: string[] = [];
  let pendingSpace = false;
  const last = () => (out.length ? out[out.length - 1] : "");
  for (const tk of toks) {
    if (tk.t === "ws") {
      pendingSpace = true;
      continue;
    }
    if (tk.t === "comment") {
      const hint = /^\/\*[+!]/.test(tk.v);
      if (opts.keepHints && hint) {
        if (out.length && pendingSpace) out.push(" ");
        out.push(tk.v);
        pendingSpace = false;
      } else pendingSpace = true;
      continue;
    }
    if (pendingSpace && out.length) {
      const prev = last();
      const prevCh = prev[prev.length - 1];
      const nextCh = tk.v[0];
      const needed = !(TIGHT.has(prevCh) || TIGHT.has(nextCh)) || (prevCh === "-" && nextCh === "-") || (prevCh === "/" && nextCh === "*");
      if (needed && prev !== "\n") out.push(" ");
    } else if (out.length) {
      // Never glue tokens into a new comment opener (e.g. "-" "-" or "/" "*").
      const prevCh = last().slice(-1);
      if ((prevCh === "-" && tk.v[0] === "-") || (prevCh === "/" && tk.v[0] === "*")) out.push(" ");
    }
    pendingSpace = false;
    out.push(tk.v);
    if (tk.t === "semi" && opts.statementPerLine) out.push("\n");
  }
  return out.join("").replace(/\n+$/, "").trim();
}
