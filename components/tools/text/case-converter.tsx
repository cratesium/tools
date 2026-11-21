"use client";

import { useMemo, useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox, Field, Select } from "@/components/ui/field";
import { CASE_MODES, convertCase, type CaseMode, type TitleStyle } from "@/lib/processors/text/case";
import { cn } from "@/lib/utils/cn";
import { TransformLayout } from "./common";

const LOCALES = [
  { value: "", label: "Default (language-neutral)" },
  { value: "tr", label: "Turkish / Azerbaijani (i ↔ İ, ı ↔ I)" },
  { value: "lt", label: "Lithuanian" },
  { value: "el", label: "Greek" },
  { value: "de", label: "German" },
  { value: "nl", label: "Dutch" },
];

const TITLE_STYLES: { value: TitleStyle; label: string }[] = [
  { value: "chicago", label: "Chicago (lowercase all prepositions)" },
  { value: "ap", label: "AP (capitalise words of 4+ letters)" },
  { value: "apa", label: "APA (capitalise words of 4+ letters)" },
  { value: "simple", label: "Capitalise every word" },
];

/**
 * Case converter. Without processorOptions.mode it offers every case; with a fixed
 * mode (uppercase/lowercase/title converters) it shows only that mode's options.
 */
export default function CaseConverter({ tool }: ToolComponentProps) {
  const fixed = tool.processorOptions?.mode as CaseMode | undefined;
  const [text, setText] = useState("");
  const [mode, setMode] = useState<CaseMode>(fixed ?? "sentence");
  const [locale, setLocale] = useState("");
  const [titleStyle, setTitleStyle] = useState<TitleStyle>("chicago");
  const [preserveAcronyms, setPreserveAcronyms] = useState(true);

  const output = useMemo(
    () => convertCase(text, mode, { locale: locale || undefined, titleStyle, preserveAcronyms }),
    [text, mode, locale, titleStyle, preserveAcronyms],
  );

  const showLocale = ["upper", "lower", "sentence", "title", "capitalized", "inverse", "alternating"].includes(mode);
  const showTitle = mode === "title";
  const showAcronyms = mode === "title" || mode === "sentence";

  const options = (
    <div className="space-y-4">
      {!fixed ? (
        <div role="radiogroup" aria-label="Case" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {CASE_MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              role="radio"
              aria-checked={mode === m.value}
              onClick={() => setMode(m.value)}
              className={cn(
                "rounded-lg border px-3 py-2 text-left text-[13px] transition-colors",
                mode === m.value ? "border-border-strong bg-bg-muted text-fg" : "border-border text-fg-muted hover:text-fg",
              )}
            >
              <span className="block font-medium">{m.label}</span>
              <span className="block truncate font-mono text-[11px] text-fg-subtle">{m.example}</span>
            </button>
          ))}
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {showTitle ? (
          <Field label="Title case style">
            {(id) => (
              <Select id={id} value={titleStyle} onChange={(e) => setTitleStyle(e.target.value as TitleStyle)}>
                {TITLE_STYLES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : null}
        {showLocale ? (
          <Field label="Language rules" hint="Affects letters like i/İ">
            {(id) => (
              <Select id={id} value={locale} onChange={(e) => setLocale(e.target.value)}>
                {LOCALES.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : null}
        {showAcronyms ? (
          <div className="flex items-end pb-1.5">
            <Checkbox
              label="Keep acronyms and mixed case"
              description="NASA, iPhone, McDonald stay as written"
              checked={preserveAcronyms}
              onChange={setPreserveAcronyms}
            />
          </div>
        ) : null}
      </div>
    </div>
  );

  const hasOptions = !fixed || showTitle || showLocale || showAcronyms;
  const label = CASE_MODES.find((m) => m.value === mode)?.label ?? "Result";

  return (
    <TransformLayout
      input={text}
      onInput={setText}
      options={hasOptions ? options : undefined}
      output={output}
      outputLabel={label}
      filename={`${mode}-case.txt`}
      summary={text ? `${[...text].length.toLocaleString("en-US")} characters converted` : null}
      onReset={() => {
        setText("");
        setMode(fixed ?? "sentence");
        setLocale("");
        setTitleStyle("chicago");
        setPreserveAcronyms(true);
      }}
    />
  );
}
