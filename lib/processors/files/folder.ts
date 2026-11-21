/** Folder analysis helpers (pure). Inputs are plain records so they are testable in Node. */

export interface FileRecord {
  /** Path relative to the selected folder root, "/" separated, e.g. "photos/2024/a.jpg". */
  path: string;
  size: number;
  lastModified: number;
  type?: string;
}

/** Relative path for a File chosen via webkitdirectory or FS Access (falls back to the name). */
export function relativePathOf(f: { name: string; webkitRelativePath?: string }, stripRoot = true): string {
  const rel = f.webkitRelativePath || f.name;
  if (!stripRoot || !f.webkitRelativePath) return rel;
  const i = rel.indexOf("/");
  return i >= 0 ? rel.slice(i + 1) : rel;
}

export function rootFolderName(files: { webkitRelativePath?: string }[]): string | null {
  const p = files.find((f) => f.webkitRelativePath)?.webkitRelativePath;
  return p ? p.split("/")[0] : null;
}

export function extOf(path: string): string {
  const name = path.split("/").pop() ?? path;
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(i + 1).toLowerCase() : "";
}

export interface FolderNode {
  name: string;
  path: string;
  directory: boolean;
  size: number;
  files: number;
  lastModified: number;
  children: FolderNode[];
}

export function buildFolderTree(records: FileRecord[], rootName = ""): FolderNode {
  const root: FolderNode = { name: rootName, path: "", directory: true, size: 0, files: 0, lastModified: 0, children: [] };
  const dirs = new Map<string, FolderNode>([["", root]]);
  const ensure = (path: string): FolderNode => {
    const hit = dirs.get(path);
    if (hit) return hit;
    const i = path.lastIndexOf("/");
    const parent = ensure(i >= 0 ? path.slice(0, i) : "");
    const node: FolderNode = { name: path.slice(i + 1), path, directory: true, size: 0, files: 0, lastModified: 0, children: [] };
    parent.children.push(node);
    dirs.set(path, node);
    return node;
  };
  for (const r of records) {
    const i = r.path.lastIndexOf("/");
    const parent = ensure(i >= 0 ? r.path.slice(0, i) : "");
    parent.children.push({ name: r.path.slice(i + 1), path: r.path, directory: false, size: r.size, files: 1, lastModified: r.lastModified, children: [] });
  }
  const total = (n: FolderNode) => {
    if (!n.directory) return;
    n.size = 0;
    n.files = 0;
    for (const c of n.children) {
      total(c);
      n.size += c.size;
      n.files += c.files;
      n.lastModified = Math.max(n.lastModified, c.lastModified);
    }
  };
  total(root);
  return root;
}

export type TreeSort = "size" | "name" | "files";

export function sortTree(node: FolderNode, by: TreeSort): FolderNode {
  const children = node.children.map((c) => sortTree(c, by));
  children.sort((a, b) => {
    if (by === "name") return a.directory === b.directory ? a.name.localeCompare(b.name) : a.directory ? -1 : 1;
    if (by === "files") return b.files - a.files || a.name.localeCompare(b.name);
    return b.size - a.size || a.name.localeCompare(b.name);
  });
  return { ...node, children };
}

export interface ExtensionStat {
  ext: string;
  files: number;
  size: number;
}

export function statsByExtension(records: FileRecord[]): ExtensionStat[] {
  const m = new Map<string, ExtensionStat>();
  for (const r of records) {
    const ext = extOf(r.path) || "(none)";
    const s = m.get(ext) ?? { ext, files: 0, size: 0 };
    s.files++;
    s.size += r.size;
    m.set(ext, s);
  }
  return [...m.values()].sort((a, b) => b.size - a.size);
}

/** Groups candidates for duplicate detection: only sizes shared by ≥2 files need hashing. */
export function groupBySize<T extends { size: number }>(items: T[]): T[][] {
  const m = new Map<number, T[]>();
  for (const it of items) {
    const g = m.get(it.size);
    if (g) g.push(it);
    else m.set(it.size, [it]);
  }
  return [...m.values()].filter((g) => g.length > 1);
}

/** Final duplicate groups from (item, digest) pairs. */
export function groupByDigest<T>(pairs: { item: T; digest: string }[]): T[][] {
  const m = new Map<string, T[]>();
  for (const p of pairs) {
    const g = m.get(p.digest);
    if (g) g.push(p.item);
    else m.set(p.digest, [p.item]);
  }
  return [...m.values()].filter((g) => g.length > 1);
}

export interface FolderDiffRow {
  path: string;
  status: "only-a" | "only-b" | "changed" | "same" | "maybe-same";
  sizeA?: number;
  sizeB?: number;
  modifiedA?: number;
  modifiedB?: number;
}

/**
 * Compares two folder listings by relative path. Without digests, equal sizes are "maybe-same";
 * pass digest maps (path → hash) to confirm "same" vs "changed".
 */
export function compareFolders(
  a: FileRecord[],
  b: FileRecord[],
  digestsA?: Map<string, string>,
  digestsB?: Map<string, string>,
): FolderDiffRow[] {
  const mb = new Map(b.map((r) => [r.path, r]));
  const rows: FolderDiffRow[] = [];
  const seen = new Set<string>();
  for (const ra of a) {
    seen.add(ra.path);
    const rb = mb.get(ra.path);
    if (!rb) {
      rows.push({ path: ra.path, status: "only-a", sizeA: ra.size, modifiedA: ra.lastModified });
      continue;
    }
    let status: FolderDiffRow["status"];
    if (ra.size !== rb.size) status = "changed";
    else {
      const da = digestsA?.get(ra.path);
      const db = digestsB?.get(rb.path);
      status = da && db ? (da === db ? "same" : "changed") : "maybe-same";
    }
    rows.push({ path: ra.path, status, sizeA: ra.size, sizeB: rb.size, modifiedA: ra.lastModified, modifiedB: rb.lastModified });
  }
  for (const rb of b) if (!seen.has(rb.path)) rows.push({ path: rb.path, status: "only-b", sizeB: rb.size, modifiedB: rb.lastModified });
  const order = { changed: 0, "only-a": 1, "only-b": 2, "maybe-same": 3, same: 4 } as const;
  return rows.sort((x, y) => order[x.status] - order[y.status] || x.path.localeCompare(y.path));
}

// ---------- File list generation ----------

export type ListFormat = "txt" | "csv" | "json" | "md";

export interface ListOptions {
  format: ListFormat;
  includePath: boolean;
  includeSize: boolean;
  includeDate: boolean;
  includeExtension?: boolean;
  humanSize?: boolean;
  sort?: "path" | "name" | "size" | "date";
}

function human(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const u = ["KB", "MB", "GB", "TB"];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${u[i]}`;
}

function csvCell(v: string | number): string {
  const s = String(v);
  // Neutralise spreadsheet formula injection and quote when needed.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function mdCell(s: string): string {
  return s.replace(/\|/g, "\\|");
}

export function generateFileList(records: FileRecord[], o: ListOptions): string {
  const rows = records.slice();
  const nameOf = (p: string) => p.split("/").pop() ?? p;
  switch (o.sort ?? "path") {
    case "name":
      rows.sort((a, b) => nameOf(a.path).localeCompare(nameOf(b.path)));
      break;
    case "size":
      rows.sort((a, b) => b.size - a.size);
      break;
    case "date":
      rows.sort((a, b) => b.lastModified - a.lastModified);
      break;
    default:
      rows.sort((a, b) => a.path.localeCompare(b.path));
  }
  const cols: { key: string; get: (r: FileRecord) => string | number }[] = [{ key: o.includePath ? "path" : "name", get: (r) => (o.includePath ? r.path : nameOf(r.path)) }];
  if (o.includeExtension) cols.push({ key: "extension", get: (r) => extOf(r.path) });
  if (o.includeSize) cols.push({ key: "size", get: (r) => (o.humanSize ? human(r.size) : r.size) });
  if (o.includeSize && o.humanSize && o.format !== "txt") cols.push({ key: "bytes", get: (r) => r.size });
  if (o.includeDate) cols.push({ key: "modified", get: (r) => new Date(r.lastModified).toISOString() });

  if (o.format === "json") {
    return JSON.stringify(
      rows.map((r) => Object.fromEntries(cols.map((c) => [c.key, c.get(r)]))),
      null,
      2,
    );
  }
  if (o.format === "csv") return [cols.map((c) => c.key).join(","), ...rows.map((r) => cols.map((c) => csvCell(c.get(r))).join(","))].join("\n");
  if (o.format === "md") {
    const head = `| ${cols.map((c) => c.key).join(" | ")} |\n| ${cols.map(() => "---").join(" | ")} |`;
    return [head, ...rows.map((r) => `| ${cols.map((c) => mdCell(String(c.get(r)))).join(" | ")} |`)].join("\n");
  }
  return rows.map((r) => cols.map((c) => c.get(r)).join("\t")).join("\n");
}

// ---------- Organizer ----------

export type OrganizeMode = "category" | "extension" | "year" | "month" | "size";

export const CATEGORY_EXTENSIONS: Record<string, string[]> = {
  Images: ["jpg", "jpeg", "png", "gif", "webp", "bmp", "tif", "tiff", "svg", "heic", "heif", "avif", "ico", "raw", "cr2", "nef", "arw", "dng", "psd"],
  Videos: ["mp4", "mov", "mkv", "avi", "webm", "wmv", "flv", "m4v", "3gp", "mpg", "mpeg", "ts"],
  Audio: ["mp3", "wav", "flac", "aac", "m4a", "ogg", "opus", "wma", "aiff", "mid", "midi"],
  Documents: ["pdf", "doc", "docx", "odt", "rtf", "txt", "md", "pages", "tex", "epub", "mobi"],
  Spreadsheets: ["xls", "xlsx", "ods", "csv", "tsv", "numbers"],
  Presentations: ["ppt", "pptx", "odp", "key"],
  Archives: ["zip", "rar", "7z", "tar", "gz", "tgz", "bz2", "xz", "zst", "iso", "dmg"],
  Code: ["js", "ts", "jsx", "tsx", "py", "java", "c", "cpp", "h", "cs", "go", "rs", "rb", "php", "html", "css", "scss", "json", "xml", "yaml", "yml", "sh", "sql", "swift", "kt"],
  Fonts: ["ttf", "otf", "woff", "woff2", "eot"],
  Executables: ["exe", "msi", "apk", "app", "deb", "rpm", "bin", "jar"],
};

const EXT_TO_CATEGORY = new Map<string, string>(Object.entries(CATEGORY_EXTENSIONS).flatMap(([cat, exts]) => exts.map((e) => [e, cat] as [string, string])));

export function sizeBucket(bytes: number): string {
  if (bytes < 100 * 1024) return "Tiny (under 100 KB)";
  if (bytes < 1024 * 1024) return "Small (100 KB - 1 MB)";
  if (bytes < 100 * 1024 * 1024) return "Medium (1 - 100 MB)";
  if (bytes < 1024 * 1024 * 1024) return "Large (100 MB - 1 GB)";
  return "Huge (over 1 GB)";
}

/** Destination folder for a file under the chosen organising scheme. */
export function organizeFolder(r: FileRecord, mode: OrganizeMode): string {
  const ext = extOf(r.path);
  const d = new Date(r.lastModified);
  switch (mode) {
    case "category":
      return EXT_TO_CATEGORY.get(ext) ?? "Other";
    case "extension":
      return ext ? ext.toUpperCase() : "No extension";
    case "year":
      return String(d.getFullYear());
    case "month":
      return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}`;
    case "size":
      return sizeBucket(r.size);
  }
}

/** Plans the reorganisation: original path → new path (flattened per group, de-duplicated names). */
export function planOrganize(records: FileRecord[], mode: OrganizeMode): { from: string; to: string; folder: string }[] {
  const used = new Set<string>();
  return records.map((r) => {
    const folder = organizeFolder(r, mode);
    const name = r.path.split("/").pop() ?? r.path;
    let to = `${folder}/${name}`;
    let k = 2;
    while (used.has(to.toLowerCase())) {
      const i = name.lastIndexOf(".");
      to = i > 0 ? `${folder}/${name.slice(0, i)} (${k})${name.slice(i)}` : `${folder}/${name} (${k})`;
      k++;
    }
    used.add(to.toLowerCase());
    return { from: r.path, to, folder };
  });
}
