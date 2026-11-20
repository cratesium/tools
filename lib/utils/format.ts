export function formatBytes(bytes: number, decimals = 1): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 ? 0 : decimals)} ${units[i]}`;
}

export function formatNumber(n: number, maxFractionDigits = 2, locale = "en-US"): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(locale, { maximumFractionDigits: maxFractionDigits });
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const ss = s.toFixed(s % 1 ? 2 : 0).padStart(s < 10 ? (s % 1 ? 5 : 2) : 0, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

export function percentChange(from: number, to: number): number {
  if (from === 0) return to === 0 ? 0 : Infinity;
  return ((to - from) / Math.abs(from)) * 100;
}

/** Replace the extension of a filename (or append one). */
export function replaceExtension(name: string, ext: string): string {
  const clean = ext.replace(/^\./, "");
  const i = name.lastIndexOf(".");
  const base = i > 0 ? name.slice(0, i) : name;
  return `${base}.${clean}`;
}

export function baseName(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(0, i) : name;
}

export function extensionOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(i + 1).toLowerCase() : "";
}
