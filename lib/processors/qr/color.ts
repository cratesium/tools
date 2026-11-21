/** Colour helpers for QR/barcode contrast checks (WCAG relative luminance). */

export function parseHex(hex: string): [number, number, number] | null {
  const m = hex.trim().replace(/^#/, "");
  const full = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}

export function relativeLuminance([r, g, b]: [number, number, number]): number {
  const ch = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

export function contrastRatio(a: string, b: string): number | null {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb) return null;
  const la = relativeLuminance(ca);
  const lb = relativeLuminance(cb);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Returns a human warning when colours are likely to hurt scanning, or null.
 * Scanners expect dark modules on a light background with strong contrast.
 */
export function scanContrastWarning(foreground: string, background: string): string | null {
  const fg = parseHex(foreground);
  const bg = parseHex(background);
  if (!fg || !bg) return "Enter colours as hex values such as #000000.";
  const ratio = contrastRatio(foreground, background)!;
  if (relativeLuminance(fg) > relativeLuminance(bg))
    return "The foreground is lighter than the background. Many scanners cannot read inverted codes; use dark modules on a light background.";
  if (ratio < 4)
    return `Contrast is low (${ratio.toFixed(1)}:1). Aim for at least 4:1, ideally close to black on white, so every scanner can read it.`;
  return null;
}
