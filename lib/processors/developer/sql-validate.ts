/**
 * SQL syntax validation with node-sql-parser. Each dialect grammar is a separate
 * ~250 KB build, imported on demand with a literal path so bundlers can split it.
 * This checks syntax only: it does not know your schema, so unknown tables or
 * columns are not reported.
 */

export const SQL_DIALECTS = [
  { value: "mysql", label: "MySQL" },
  { value: "mariadb", label: "MariaDB" },
  { value: "postgresql", label: "PostgreSQL" },
  { value: "sqlite", label: "SQLite" },
  { value: "transactsql", label: "SQL Server (T-SQL)" },
  { value: "bigquery", label: "BigQuery" },
  { value: "snowflake", label: "Snowflake" },
  { value: "redshift", label: "Redshift" },
  { value: "db2", label: "Db2" },
  { value: "hive", label: "Hive" },
  { value: "trino", label: "Trino" },
  { value: "athena", label: "Athena" },
  { value: "flinksql", label: "Flink SQL" },
] as const;

export type SqlDialect = (typeof SQL_DIALECTS)[number]["value"];

/** node-sql-parser's `database` option name for each dialect. */
const DB_NAME: Record<SqlDialect, string> = {
  mysql: "MySQL",
  mariadb: "MariaDB",
  postgresql: "PostgresQL",
  sqlite: "Sqlite",
  transactsql: "TransactSQL",
  bigquery: "BigQuery",
  snowflake: "Snowflake",
  redshift: "Redshift",
  db2: "DB2",
  hive: "Hive",
  trino: "Trino",
  athena: "Athena",
  flinksql: "FlinkSQL",
};

interface ParserLike {
  astify(sql: string, opt?: { database?: string }): unknown;
  tableList(sql: string, opt?: { database?: string }): string[];
}

type ParserModule = { Parser: new () => ParserLike };

async function loadParser(d: SqlDialect): Promise<ParserModule> {
  switch (d) {
    case "mysql":
      return (await import("node-sql-parser/build/mysql")) as unknown as ParserModule;
    case "mariadb":
      return (await import("node-sql-parser/build/mariadb")) as unknown as ParserModule;
    case "postgresql":
      return (await import("node-sql-parser/build/postgresql")) as unknown as ParserModule;
    case "sqlite":
      return (await import("node-sql-parser/build/sqlite")) as unknown as ParserModule;
    case "transactsql":
      return (await import("node-sql-parser/build/transactsql")) as unknown as ParserModule;
    case "bigquery":
      return (await import("node-sql-parser/build/bigquery")) as unknown as ParserModule;
    case "snowflake":
      return (await import("node-sql-parser/build/snowflake")) as unknown as ParserModule;
    case "redshift":
      return (await import("node-sql-parser/build/redshift")) as unknown as ParserModule;
    case "db2":
      return (await import("node-sql-parser/build/db2")) as unknown as ParserModule;
    case "hive":
      return (await import("node-sql-parser/build/hive")) as unknown as ParserModule;
    case "trino":
      return (await import("node-sql-parser/build/trino")) as unknown as ParserModule;
    case "athena":
      return (await import("node-sql-parser/build/athena")) as unknown as ParserModule;
    case "flinksql":
      return (await import("node-sql-parser/build/flinksql")) as unknown as ParserModule;
  }
}

function moduleParser(m: ParserModule): new () => ParserLike {
  const anyM = m as unknown as { Parser?: new () => ParserLike; default?: { Parser?: new () => ParserLike } };
  const P = anyM.Parser ?? anyM.default?.Parser;
  if (!P) throw new Error("SQL parser failed to load");
  return P;
}

export interface SqlValidation {
  valid: boolean;
  dialect: SqlDialect;
  statements: string[];
  tables: string[];
  message?: string;
  line?: number;
  column?: number;
  expected?: string[];
  found?: string | null;
}

export async function validateSql(sql: string, dialect: SqlDialect): Promise<SqlValidation> {
  const base = { dialect, statements: [] as string[], tables: [] as string[] };
  if (!sql.trim()) return { ...base, valid: false, message: "Input is empty" };
  const P = moduleParser(await loadParser(dialect));
  const parser = new P();
  const opt = { database: DB_NAME[dialect] };
  try {
    const ast = parser.astify(sql, opt);
    const list = (Array.isArray(ast) ? ast : [ast]) as { type?: string }[];
    let tables: string[] = [];
    try {
      tables = parser.tableList(sql, opt);
    } catch {
      /* table list is best-effort */
    }
    return {
      ...base,
      valid: true,
      statements: list.map((a) => String(a?.type ?? "statement").toUpperCase()),
      tables: [...new Set(tables.map(formatTableRef))],
    };
  } catch (e) {
    const err = e as { message?: string; location?: { start?: { line: number; column: number } }; expected?: { type: string; text?: string; description?: string }[]; found?: string | null };
    const loc = err.location?.start;
    const expected = (err.expected ?? [])
      .map((x) => (x.type === "literal" ? `"${x.text}"` : x.description ?? x.type))
      .filter((x, i, a) => a.indexOf(x) === i && !/^\[ \\t\\n\\r\]$|whitespace/.test(x))
      .slice(0, 12);
    return {
      ...base,
      valid: false,
      message: err.found !== undefined ? `Unexpected ${err.found === null ? "end of input" : `"${err.found}"`}` : err.message ?? "Syntax error",
      line: loc?.line,
      column: loc?.column,
      expected,
      found: err.found,
    };
  }
}

/** "select::db::table" → "SELECT db.table" */
function formatTableRef(ref: string): string {
  const [op, db, table] = ref.split("::");
  return `${(op ?? "").toUpperCase()} ${db && db !== "null" ? `${db}.` : ""}${table ?? ""}`.trim();
}
