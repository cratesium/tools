/** CSS gradient model → CSS string. Pure. */

export type GradientType = "linear" | "radial" | "conic";

export interface GradientStop {
  id: string;
  color: string;
  /** Position in percent, 0–100. */
  position: number;
}

export interface GradientState {
  type: GradientType;
  /** Angle in degrees for linear (direction) and conic (from). */
  angle: number;
  shape: "circle" | "ellipse";
  /** Position for radial/conic center, in percent. */
  centerX: number;
  centerY: number;
  repeating: boolean;
  stops: GradientStop[];
}

export const DEFAULT_GRADIENT: GradientState = {
  type: "linear",
  angle: 135,
  shape: "ellipse",
  centerX: 50,
  centerY: 50,
  repeating: false,
  stops: [
    { id: "a", color: "#0f172a", position: 0 },
    { id: "b", color: "#475569", position: 55 },
    { id: "c", color: "#e2e8f0", position: 100 },
  ],
};

const r = (n: number) => Math.round(n * 10) / 10;

function centerStr(s: GradientState): string {
  if (s.centerX === 50 && s.centerY === 50) return "";
  return `at ${r(s.centerX)}% ${r(s.centerY)}%`;
}

export function gradientCss(s: GradientState): string {
  const stops = [...s.stops].sort((a, b) => a.position - b.position).map((st) => `${st.color} ${r(st.position)}%`);
  const prefix = s.repeating ? "repeating-" : "";
  let head = "";
  if (s.type === "linear") head = `${r(s.angle)}deg`;
  else if (s.type === "radial") head = [s.shape, centerStr(s)].filter(Boolean).join(" ");
  else head = [`from ${r(s.angle)}deg`, centerStr(s)].filter(Boolean).join(" ");
  return `${prefix}${s.type}-gradient(${[head, ...stops].join(", ")})`;
}

/** A full CSS rule with a solid fallback (first stop) for very old browsers. */
export function gradientRule(s: GradientState, selector = ".element"): string {
  const first = [...s.stops].sort((a, b) => a.position - b.position)[0]?.color ?? "#000";
  return `${selector} {\n  background-color: ${first};\n  background-image: ${gradientCss(s)};\n}`;
}
