"use client";

import { useRef, useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Select } from "@/components/ui/field";
import { Alert, Badge } from "@/components/ui/feedback";
import { ActionBar, KeyValueTable, Panel, TaskProgress } from "@/components/tools/shared";
import { SQL_DIALECTS, validateSql, type SqlDialect } from "@/lib/processors/developer/sql-validate";
import { CodeInput, LocatedError, useLiveAsync } from "./code-panels";

const SAMPLE = `SELECT id, name, email
FROM users
WHERE created_at > '2026-01-01'
  AND status = 'active'
ORDER BY name
LIMIT 50;

UPDATE users SET status = 'inactive' WHERE last_login < NOW() - INTERVAL 1 YEAR;`;

export default function SqlValidator(_props: ToolComponentProps) {
  const [text, setText] = useState("");
  const [dialect, setDialect] = useState<SqlDialect>("mysql");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { result, busy } = useLiveAsync(text, (src) => validateSql(src, dialect), [dialect], 400);

  return (
    <div className="space-y-4">
      <CodeInput
        value={text}
        onChange={setText}
        inputRef={inputRef}
        label="SQL"
        placeholder="Paste SQL to validate…"
        sample={SAMPLE}
        accept=".sql,text/plain"
        actions={
          <Select aria-label="SQL dialect" value={dialect} onChange={(e) => setDialect(e.target.value as SqlDialect)} className="h-8 w-44">
            {SQL_DIALECTS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </Select>
        }
      />
      <TaskProgress running={busy} progress={null} label="Parsing…" />
      {result && !result.valid ? (
        <>
          <LocatedError error={{ message: result.message ?? "Syntax error", line: result.line, column: result.column }} inputRef={inputRef} title="Syntax error" />
          {result.expected?.length ? (
            <Panel title="Expected one of">
              <div className="flex flex-wrap gap-1">
                {result.expected.slice(0, 40).map((x) => (
                  <Badge key={x}>{x}</Badge>
                ))}
              </div>
            </Panel>
          ) : null}
        </>
      ) : null}
      {result?.valid ? (
        <>
          <Alert tone="success" title="Valid syntax">
            {result.statements.length} statement{result.statements.length === 1 ? "" : "s"} parsed as {SQL_DIALECTS.find((d) => d.value === result.dialect)?.label}. Table and column names
            are not checked against a real schema.
          </Alert>
          <Panel title="Summary">
            <KeyValueTable
              rows={[
                ["Statement types", result.statements.join(", ") || "—"],
                ["Tables referenced", result.tables.join(", ") || "—"],
              ]}
            />
          </Panel>
        </>
      ) : null}
      <ActionBar onReset={() => setText("")} />
    </div>
  );
}
