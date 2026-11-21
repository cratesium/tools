"use client";

import { useRef, useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { ActionBar, DataTable, Panel, Settings, TextOutput } from "@/components/tools/shared";
import { parseJson } from "@/lib/processors/developer/json";
import type { ArrayMode, CsvTable } from "@/lib/processors/developer/convert-csv";
import { CodeInput, LocatedError, useLiveAsync } from "./code-panels";

type Format = "json" | "xml" | "yaml" | "csv";

const SAMPLE_JSON = JSON.stringify(
  {
    orders: [
      { id: 501, customer: { name: "Ana Lima", email: "ana@example.com" }, items: ["keyboard", "mouse"], total: 89.5, paid: true },
      { id: 502, customer: { name: "Tom Berg", email: "tom@example.com" }, items: ["monitor"], total: 219, paid: false },
    ],
  },
  null,
  2,
);
const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<catalog>
  <book id="bk101" lang="en">
    <author>Gambardella, Matthew</author>
    <title>XML Developer's Guide</title>
    <price>44.95</price>
  </book>
  <book id="bk102" lang="en">
    <author>Ralls, Kim</author>
    <title>Midnight Rain</title>
    <price>5.95</price>
  </book>
</catalog>`;
const SAMPLE_YAML = `# docker-compose style file
services:
  web:
    image: nginx:1.27
    ports:
      - "8080:80"
    environment: &env
      LOG_LEVEL: info
  worker:
    image: app/worker:2
    environment: *env
`;

interface Out {
  text: string;
  table?: CsvTable;
  note?: string;
}

const EXT: Record<Format, [string, string]> = {
  json: ["json", "application/json"],
  xml: ["xml", "application/xml"],
  yaml: ["yaml", "application/yaml"],
  csv: ["csv", "text/csv"],
};

export default function ConvertTool({ tool }: ToolComponentProps) {
  const from = (tool.processorOptions?.from as Format) ?? "json";
  const to = (tool.processorOptions?.to as Format) ?? "yaml";
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // JSON output / YAML / XML options
  const [indent, setIndent] = useState(2);
  const [sortKeys, setSortKeys] = useState(false);
  // json → xml
  const [rootName, setRootName] = useState("root");
  const [itemName, setItemName] = useState("item");
  const [declaration, setDeclaration] = useState(true);
  // json → csv
  const [delimiter, setDelimiter] = useState(",");
  const [arrayMode, setArrayMode] = useState<ArrayMode>("join");
  const [header, setHeader] = useState(true);
  const [path, setPath] = useState("");
  // xml → json
  const [attributes, setAttributes] = useState(true);
  const [parseValues, setParseValues] = useState(false);
  const [keepRoot, setKeepRoot] = useState(true);
  // yaml → json
  const [multi, setMulti] = useState<"array" | "first">("array");

  const live = useLiveAsync<Out>(
    text,
    async (input) => {
      if (from === "json") {
        const value = parseJson(input);
        if (to === "xml") {
          const { jsonToXml } = await import("@/lib/processors/developer/xml");
          return { text: jsonToXml(value, { rootName: rootName.trim(), itemName, indent, declaration }) };
        }
        if (to === "yaml") {
          const { valueToYaml } = await import("@/lib/processors/developer/yaml");
          return { text: valueToYaml(value, { indent, sortKeys }) };
        }
        const { jsonToCsv } = await import("@/lib/processors/developer/convert-csv");
        const r = jsonToCsv(value, { delimiter: delimiter === "tab" ? "\t" : delimiter, arrayMode, header, path });
        return { text: r.csv, table: r.table, note: r.foundAt ? `Rows taken from the "${r.foundAt}" array.` : undefined };
      }
      if (from === "xml") {
        const { xmlToJson } = await import("@/lib/processors/developer/xml");
        const v = xmlToJson(input, { attributes, parseValues, keepRoot });
        return { text: JSON.stringify(sortKeys ? (await import("@/lib/processors/developer/json")).sortKeysDeep(v) : v, null, indent) };
      }
      const { yamlToValue } = await import("@/lib/processors/developer/yaml");
      const v = yamlToValue(input, multi);
      const { stringifyJson } = await import("@/lib/processors/developer/json");
      return { text: stringifyJson(v === undefined ? null : v, { indent: indent as 2 | 4, sortKeys }) };
    },
    [from, to, indent, sortKeys, rootName, itemName, declaration, delimiter, arrayMode, header, path, attributes, parseValues, keepRoot, multi],
  );

  const reset = () => {
    setText("");
    setIndent(2);
    setSortKeys(false);
    setRootName("root");
    setItemName("item");
    setDeclaration(true);
    setDelimiter(",");
    setArrayMode("join");
    setHeader(true);
    setPath("");
    setAttributes(true);
    setParseValues(false);
    setKeepRoot(true);
    setMulti("array");
  };

  const sample = from === "json" ? SAMPLE_JSON : from === "xml" ? SAMPLE_XML : SAMPLE_YAML;
  const label = from.toUpperCase();
  const [ext, mime] = EXT[to];

  return (
    <div className="space-y-4">
      <CodeInput
        value={text}
        onChange={setText}
        inputRef={inputRef}
        label={label}
        placeholder={`Paste ${label} here…`}
        sample={sample}
        accept={from === "json" ? ".json,application/json" : from === "xml" ? ".xml,text/xml,application/xml" : ".yaml,.yml"}
      />

      <Settings>
        {to !== "csv" ? (
          <Field label="Indentation">
            {(id) => (
              <Select id={id} value={indent} onChange={(e) => setIndent(Number(e.target.value))}>
                <option value={2}>2 spaces</option>
                <option value={4}>4 spaces</option>
              </Select>
            )}
          </Field>
        ) : null}
        {to === "xml" ? (
          <>
            <Field label="Root element" hint="Empty = use the single top-level key">
              {(id) => <Input id={id} value={rootName} onChange={(e) => setRootName(e.target.value)} />}
            </Field>
            <Field label="Array item element" hint="For top-level and nested arrays">
              {(id) => <Input id={id} value={itemName} onChange={(e) => setItemName(e.target.value)} />}
            </Field>
            <Checkbox label="XML declaration" description='Prepend <?xml version="1.0"?>' checked={declaration} onChange={setDeclaration} />
          </>
        ) : null}
        {to === "csv" ? (
          <>
            <Field label="Delimiter">
              {(id) => (
                <Select id={id} value={delimiter} onChange={(e) => setDelimiter(e.target.value)}>
                  <option value=",">Comma ,</option>
                  <option value=";">Semicolon ;</option>
                  <option value="tab">Tab</option>
                  <option value="|">Pipe |</option>
                </Select>
              )}
            </Field>
            <Field label="Arrays inside records">
              {(id) => (
                <Select id={id} value={arrayMode} onChange={(e) => setArrayMode(e.target.value as ArrayMode)}>
                  <option value="join">Join values with “; ”</option>
                  <option value="index">One column per index (tags.0, tags.1)</option>
                  <option value="json">Keep as JSON text</option>
                </Select>
              )}
            </Field>
            <Field label="Records path" hint="Optional, e.g. data.items">
              {(id) => <Input id={id} value={path} placeholder="auto-detect" onChange={(e) => setPath(e.target.value)} />}
            </Field>
            <Checkbox label="Header row" checked={header} onChange={setHeader} />
          </>
        ) : null}
        {from === "xml" ? (
          <>
            <Checkbox label="Include attributes" description='Written as "@name" keys' checked={attributes} onChange={setAttributes} />
            <Checkbox label="Convert numbers and booleans" description="Otherwise all text stays a string" checked={parseValues} onChange={setParseValues} />
            <Checkbox label="Keep root element" checked={keepRoot} onChange={setKeepRoot} />
          </>
        ) : null}
        {from === "yaml" ? (
          <Field label="Multiple documents (---)">
            {(id) => (
              <Select id={id} value={multi} onChange={(e) => setMulti(e.target.value as "array" | "first")}>
                <option value="array">Combine into a JSON array</option>
                <option value="first">First document only</option>
              </Select>
            )}
          </Field>
        ) : null}
        {to === "yaml" || to === "json" ? <Checkbox label="Sort keys alphabetically" checked={sortKeys} onChange={setSortKeys} /> : null}
      </Settings>

      <LocatedError error={live.error} inputRef={inputRef} title={`Could not convert ${label}`} />
      {live.result?.note ? <Alert tone="info">{live.result.note}</Alert> : null}

      {live.result ? (
        <TextOutput value={live.result.text} filename={`converted.${ext}`} mime={mime} label={`${to.toUpperCase()} output`} rows={14} />
      ) : null}
      {live.result?.table && live.result.table.headers.length ? (
        <Panel title={`Preview (${live.result.table.rows.length} rows × ${live.result.table.headers.length} columns)`}>
          <DataTable headers={live.result.table.headers} rows={live.result.table.rows} max={100} />
        </Panel>
      ) : null}

      <ActionBar onReset={reset} />
    </div>
  );
}
