/**
 * Prettier-based formatting for HTML, CSS and JavaScript, plus csso/terser
 * minification and sql-formatter. All libraries are imported dynamically so they
 * only download when a tool actually runs.
 */

export type CodeLanguage = "html" | "css" | "javascript" | "yaml";

export interface CodeFormatOptions {
  tabWidth?: number;
  useTabs?: boolean;
  printWidth?: number;
  singleQuote?: boolean;
  semi?: boolean;
  /** HTML: how to treat whitespace in inline content. */
  htmlWhitespaceSensitivity?: "css" | "strict" | "ignore";
  /** CSS dialect. */
  cssParser?: "css" | "scss" | "less";
  /** JS: allow TypeScript-free modern syntax incl. JSX via Babel. */
  trailingComma?: "all" | "es5" | "none";
}

export class CodeError extends Error {
  constructor(
    message: string,
    public readonly line?: number,
    public readonly column?: number,
  ) {
    super(message);
    this.name = "CodeError";
  }
}

function toCodeError(e: unknown): CodeError {
  const err = e as { message?: string; loc?: { start?: { line: number; column: number } }; line?: number; col?: number; column?: number };
  const loc = err?.loc?.start;
  const first = String(err?.message ?? e).split("\n")[0].replace(/\s*\(\d+:\d+\)\s*$/, "");
  if (loc) return new CodeError(first, loc.line, loc.column);
  if (typeof err?.line === "number") return new CodeError(first, err.line, (err.col ?? err.column ?? 0) + (err.col != null ? 1 : 0));
  return new CodeError(first);
}

export async function formatCode(code: string, language: CodeLanguage, opts: CodeFormatOptions = {}): Promise<string> {
  const prettier = await import("prettier/standalone");
  const base = {
    tabWidth: opts.tabWidth ?? 2,
    useTabs: opts.useTabs ?? false,
    printWidth: opts.printWidth ?? 80,
  };
  try {
    if (language === "css") {
      const postcss = await import("prettier/plugins/postcss");
      return await prettier.format(code, { ...base, parser: opts.cssParser ?? "css", plugins: [postcss], singleQuote: opts.singleQuote ?? false });
    }
    if (language === "javascript") {
      const [babel, estree] = await Promise.all([import("prettier/plugins/babel"), import("prettier/plugins/estree")]);
      return await prettier.format(code, {
        ...base,
        parser: "babel",
        plugins: [babel, estree],
        singleQuote: opts.singleQuote ?? false,
        semi: opts.semi ?? true,
        trailingComma: opts.trailingComma ?? "all",
      });
    }
    if (language === "yaml") {
      const yaml = await import("prettier/plugins/yaml");
      return await prettier.format(code, { ...base, parser: "yaml", plugins: [yaml], singleQuote: opts.singleQuote ?? false });
    }
    const [html, postcss, babel, estree] = await Promise.all([
      import("prettier/plugins/html"),
      import("prettier/plugins/postcss"),
      import("prettier/plugins/babel"),
      import("prettier/plugins/estree"),
    ]);
    return await prettier.format(code, {
      ...base,
      parser: "html",
      plugins: [html, postcss, babel, estree],
      htmlWhitespaceSensitivity: opts.htmlWhitespaceSensitivity ?? "css",
    });
  } catch (e) {
    throw toCodeError(e);
  }
}

export interface CssMinifyOptions {
  /** Structural optimisations: merge rules, remove overridden declarations. */
  restructure?: boolean;
  /** Keep /*! license *\/ comments. */
  keepLicenseComments?: boolean;
}

export async function minifyCss(css: string, opts: CssMinifyOptions = {}): Promise<string> {
  const csso = await import("csso");
  try {
    return csso.minify(css, { restructure: opts.restructure ?? true, comments: opts.keepLicenseComments === false ? false : "exclamation" }).css;
  } catch (e) {
    throw toCodeError(e);
  }
}

export interface JsMinifyOptions {
  mangle?: boolean;
  compress?: boolean;
  /** Keep /*! and @license comments. */
  keepLicenseComments?: boolean;
  module?: boolean;
  ecma?: 5 | 2015 | 2020;
  dropConsole?: boolean;
}

export async function minifyJs(code: string, opts: JsMinifyOptions = {}): Promise<string> {
  const { minify } = await import("terser");
  try {
    const r = await minify(code, {
      mangle: opts.mangle ?? true,
      compress: opts.compress === false ? false : { drop_console: opts.dropConsole ?? false },
      module: opts.module ?? false,
      ecma: opts.ecma ?? 2020,
      format: { comments: opts.keepLicenseComments === false ? false : "some" },
    });
    return r.code ?? "";
  } catch (e) {
    throw toCodeError(e);
  }
}

export const SQL_FORMAT_DIALECTS = [
  { value: "sql", label: "Standard SQL" },
  { value: "mysql", label: "MySQL" },
  { value: "mariadb", label: "MariaDB" },
  { value: "postgresql", label: "PostgreSQL" },
  { value: "sqlite", label: "SQLite" },
  { value: "transactsql", label: "SQL Server (T-SQL)" },
  { value: "plsql", label: "Oracle PL/SQL" },
  { value: "bigquery", label: "BigQuery" },
  { value: "snowflake", label: "Snowflake" },
  { value: "redshift", label: "Redshift" },
  { value: "duckdb", label: "DuckDB" },
  { value: "clickhouse", label: "ClickHouse" },
  { value: "spark", label: "Spark SQL" },
  { value: "hive", label: "Hive" },
  { value: "trino", label: "Trino / Presto" },
  { value: "db2", label: "Db2" },
  { value: "n1ql", label: "Couchbase N1QL" },
  { value: "singlestoredb", label: "SingleStore" },
  { value: "tidb", label: "TiDB" },
] as const;

export type SqlFormatDialect = (typeof SQL_FORMAT_DIALECTS)[number]["value"];

export interface SqlFormatOptions {
  dialect?: SqlFormatDialect;
  keywordCase?: "preserve" | "upper" | "lower";
  tabWidth?: number;
  useTabs?: boolean;
  indentStyle?: "standard" | "tabularLeft" | "tabularRight";
  linesBetweenQueries?: number;
  denseOperators?: boolean;
}

export async function formatSql(sql: string, opts: SqlFormatOptions = {}): Promise<string> {
  const { format } = await import("sql-formatter");
  try {
    return format(sql, {
      language: opts.dialect ?? "sql",
      keywordCase: opts.keywordCase ?? "upper",
      tabWidth: opts.tabWidth ?? 2,
      useTabs: opts.useTabs ?? false,
      indentStyle: opts.indentStyle ?? "standard",
      linesBetweenQueries: opts.linesBetweenQueries ?? 1,
      denseOperators: opts.denseOperators ?? false,
    });
  } catch (e) {
    const msg = String((e as Error)?.message ?? e).split("\n")[0];
    const m = /line (\d+) column (\d+)/.exec(msg);
    throw new CodeError(msg, m ? Number(m[1]) : undefined, m ? Number(m[2]) : undefined);
  }
}
