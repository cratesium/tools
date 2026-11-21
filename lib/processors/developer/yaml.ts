/**
 * YAML parsing/serialisation helpers built on js-yaml (YAML 1.2).
 * Import this module dynamically from UI code; js-yaml is ~130 KB.
 */
import { CORE_SCHEMA, dump, load, loadAll, mergeTag, YAMLException } from "js-yaml";

/** YAML 1.2 core schema plus "<<" merge keys (common in Docker Compose and CI files). */
const LOAD_SCHEMA = CORE_SCHEMA.withTags(mergeTag);

export class YamlError extends Error {
  constructor(
    message: string,
    public readonly line?: number,
    public readonly column?: number,
    public readonly snippet?: string,
  ) {
    super(line ? `${message} (line ${line}, column ${column})` : message);
    this.name = "YamlError";
  }
}

/** Converts js-yaml's exception (0-based mark) into a 1-based line/column error. */
function wrap(e: unknown): never {
  if (e instanceof YAMLException) {
    const m = e.mark;
    throw new YamlError(e.reason || "Invalid YAML", m ? m.line + 1 : undefined, m ? m.column + 1 : undefined, m?.snippet ?? undefined);
  }
  throw e;
}

export interface YamlValidation {
  valid: boolean;
  documents: unknown[];
  error?: YamlError;
}

export function validateYaml(text: string): YamlValidation {
  try {
    const documents = loadAll(text, { schema: LOAD_SCHEMA });
    return { valid: true, documents };
  } catch (e) {
    try {
      wrap(e);
    } catch (w) {
      if (w instanceof YamlError) return { valid: false, documents: [], error: w };
      return { valid: false, documents: [], error: new YamlError(String((w as Error)?.message ?? w)) };
    }
  }
  return { valid: false, documents: [] };
}

/** Parses YAML. Multi-document streams become an array unless `multi` is "first". */
export function yamlToValue(text: string, multi: "array" | "first" = "array"): unknown {
  try {
    const docs = loadAll(text, { schema: LOAD_SCHEMA });
    if (docs.length === 0) return null;
    if (docs.length === 1 || multi === "first") return docs[0];
    return docs;
  } catch (e) {
    wrap(e);
  }
}

export function parseYamlSingle(text: string): unknown {
  try {
    return load(text, { schema: LOAD_SCHEMA });
  } catch (e) {
    wrap(e);
  }
}

export interface ToYamlOptions {
  indent?: number;
  sortKeys?: boolean;
  /** Max line width before folding long strings; -1 disables. */
  lineWidth?: number;
  /** Inline duplicate objects instead of emitting &anchors / *aliases. */
  noRefs?: boolean;
}

export function valueToYaml(value: unknown, opts: ToYamlOptions = {}): string {
  return dump(value, {
    indent: opts.indent ?? 2,
    sortKeys: opts.sortKeys ?? false,
    lineWidth: opts.lineWidth ?? -1,
    noRefs: opts.noRefs ?? true,
  });
}
