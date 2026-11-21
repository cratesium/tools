"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox, Field, Select } from "@/components/ui/field";
import { ActionBar, Settings, TaskProgress, TextOutput } from "@/components/tools/shared";
import { SQL_FORMAT_DIALECTS, formatSql, type SqlFormatDialect } from "@/lib/processors/developer/code-format";
import { CodeInput, LocatedError, useLiveAsync } from "./code-panels";

const SAMPLE = `select o.id, c.name as customer, sum(i.qty * i.price) total from orders o join customers c on c.id = o.customer_id left join order_items i on i.order_id = o.id where o.created_at >= '2026-01-01' and o.status in ('paid','shipped') group by o.id, c.name having sum(i.qty * i.price) > 100 order by total desc limit 20;`;

export default function SqlFormatter(_props: ToolComponentProps) {
  const [text, setText] = useState("");
  const [dialect, setDialect] = useState<SqlFormatDialect>("sql");
  const [keywordCase, setKeywordCase] = useState<"preserve" | "upper" | "lower">("upper");
  const [indent, setIndent] = useState("2");
  const [indentStyle, setIndentStyle] = useState<"standard" | "tabularLeft" | "tabularRight">("standard");
  const [dense, setDense] = useState(false);

  const { result, error, busy } = useLiveAsync(
    text,
    (src) =>
      formatSql(src, {
        dialect,
        keywordCase,
        tabWidth: indent === "tab" ? 2 : Number(indent),
        useTabs: indent === "tab",
        indentStyle,
        denseOperators: dense,
        linesBetweenQueries: 1,
      }),
    [dialect, keywordCase, indent, indentStyle, dense],
    300,
  );

  return (
    <div className="space-y-4">
      <CodeInput value={text} onChange={setText} label="SQL" placeholder="Paste one or more SQL queries…" sample={SAMPLE} accept=".sql,text/plain" />
      <Settings>
        <Field label="Dialect">
          {(id) => (
            <Select id={id} value={dialect} onChange={(e) => setDialect(e.target.value as SqlFormatDialect)}>
              {SQL_FORMAT_DIALECTS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Keyword case">
          {(id) => (
            <Select id={id} value={keywordCase} onChange={(e) => setKeywordCase(e.target.value as "preserve" | "upper" | "lower")}>
              <option value="upper">UPPERCASE</option>
              <option value="lower">lowercase</option>
              <option value="preserve">Preserve</option>
            </Select>
          )}
        </Field>
        <Field label="Indentation">
          {(id) => (
            <Select id={id} value={indent} onChange={(e) => setIndent(e.target.value)}>
              <option value="2">2 spaces</option>
              <option value="4">4 spaces</option>
              <option value="tab">Tabs</option>
            </Select>
          )}
        </Field>
        <Field label="Layout">
          {(id) => (
            <Select id={id} value={indentStyle} onChange={(e) => setIndentStyle(e.target.value as "standard" | "tabularLeft" | "tabularRight")}>
              <option value="standard">Standard</option>
              <option value="tabularLeft">Tabular, keywords left</option>
              <option value="tabularRight">Tabular, keywords right</option>
            </Select>
          )}
        </Field>
        <Checkbox label="Dense operators" description="a+b instead of a + b" checked={dense} onChange={setDense} />
      </Settings>
      <TaskProgress running={busy} progress={null} label="Formatting…" />
      <LocatedError error={error} title="Could not format SQL" />
      {result != null && !error ? <TextOutput value={result} filename="formatted.sql" /> : null}
      <ActionBar onReset={() => setText("")} />
    </div>
  );
}
