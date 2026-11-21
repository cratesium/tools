"use client";

import { useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import type { ToolComponentProps } from "@/types/tool";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Segmented, Select } from "@/components/ui/field";
import { ActionBar, Panel, TextOutput } from "@/components/tools/shared";
import { generateLorem, LOREM_LIMITS, type LoremFormat, type LoremUnit } from "@/lib/processors/text/lorem";
import { countWords } from "@/lib/processors/text/counters";

const DEFAULTS = { unit: "paragraphs" as LoremUnit, count: 3, startWithLorem: true, format: "text" as LoremFormat, seed: 1 };

export default function LoremIpsum(_props: ToolComponentProps) {
  const [unit, setUnit] = useState<LoremUnit>(DEFAULTS.unit);
  const [count, setCount] = useState(DEFAULTS.count);
  const [startWithLorem, setStart] = useState(DEFAULTS.startWithLorem);
  const [format, setFormat] = useState<LoremFormat>(DEFAULTS.format);
  const [seed, setSeed] = useState(DEFAULTS.seed);

  const output = useMemo(() => generateLorem({ unit, count, startWithLorem, format, seed }), [unit, count, startWithLorem, format, seed]);
  const max = LOREM_LIMITS[unit];
  const ext = format === "html" ? "html" : format === "markdown" ? "md" : "txt";

  return (
    <div className="space-y-4">
      <Panel title="Generate">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Type">
            {(id) => (
              <Select id={id} value={unit} onChange={(e) => setUnit(e.target.value as LoremUnit)}>
                <option value="paragraphs">Paragraphs</option>
                <option value="sentences">Sentences</option>
                <option value="words">Words</option>
                <option value="list">List items</option>
              </Select>
            )}
          </Field>
          <Field label="How many" hint={`max ${max.toLocaleString("en-US")}`}>
            {(id) => (
              <Input id={id} type="number" min={1} max={max} value={count} onChange={(e) => setCount(Math.max(1, Math.min(max, Number(e.target.value) || 1)))} />
            )}
          </Field>
          <Field label="Format">
            {() => (
              <Segmented
                label="Format"
                value={format}
                onChange={setFormat}
                options={[
                  { value: "text", label: "Plain" },
                  { value: "html", label: "HTML" },
                  { value: "markdown", label: "Markdown" },
                ]}
              />
            )}
          </Field>
          <div className="flex flex-col justify-end gap-2">
            <Checkbox label="Start with “Lorem ipsum dolor sit amet…”" checked={startWithLorem} onChange={setStart} />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button icon={<RefreshCw className="h-4 w-4" />} onClick={() => setSeed(crypto.getRandomValues(new Uint32Array(1))[0])} data-testid="run">
            Generate new text
          </Button>
          <Field label="Seed" hint="same seed → same text" className="w-48">
            {(id) => <Input id={id} type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value) || 0)} />}
          </Field>
        </div>
      </Panel>
      <TextOutput
        value={output}
        label={`Placeholder text · ${countWords(output.replace(/<[^>]+>/g, " ")).toLocaleString("en-US")} words`}
        filename={`lorem-ipsum.${ext}`}
        rows={14}
      />
      <ActionBar
        onReset={() => {
          setUnit(DEFAULTS.unit);
          setCount(DEFAULTS.count);
          setStart(DEFAULTS.startWithLorem);
          setFormat(DEFAULTS.format);
          setSeed(DEFAULTS.seed);
        }}
      />
    </div>
  );
}
