/**
 * 10-band graphic equalizer definitions, presets and RBJ biquad magnitude response
 * (used to draw the curve). The browser renders the same filters with BiquadFilterNode
 * in an OfflineAudioContext.
 */

export type BandType = "lowshelf" | "peaking" | "highshelf";

export interface EqBand {
  frequency: number;
  type: BandType;
  q: number;
  label: string;
}

/** ISO octave centres 31 Hz – 16 kHz. Q ≈ 1.41 gives one-octave bandwidth. */
export const EQ_BANDS: EqBand[] = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000].map((f, i, a) => ({
  frequency: f,
  type: i === 0 ? "lowshelf" : i === a.length - 1 ? "highshelf" : "peaking",
  q: 1.41,
  label: f >= 1000 ? `${f / 1000}k` : String(f),
}));

export const EQ_MIN_DB = -12;
export const EQ_MAX_DB = 12;

export const EQ_PRESETS: Record<string, { label: string; gains: number[] }> = {
  flat: { label: "Flat", gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  bass: { label: "Bass boost", gains: [6, 5, 4, 2, 0, 0, 0, 0, 0, 0] },
  bassCut: { label: "Bass cut", gains: [-8, -6, -4, -2, 0, 0, 0, 0, 0, 0] },
  treble: { label: "Treble boost", gains: [0, 0, 0, 0, 0, 1, 2, 4, 5, 6] },
  vocal: { label: "Vocal clarity", gains: [-3, -2, -1, 0, 2, 3, 4, 3, 1, 0] },
  podcast: { label: "Podcast / voice", gains: [-6, -4, -1, 1, 2, 3, 3, 2, 0, -2] },
  loudness: { label: "Loudness (smile)", gains: [5, 4, 2, 0, -1, -1, 0, 2, 4, 5] },
  telephone: { label: "Telephone", gains: [-12, -12, -8, 0, 4, 6, 4, 0, -10, -12] },
};

export function clampGain(db: number): number {
  return Math.max(EQ_MIN_DB, Math.min(EQ_MAX_DB, Number.isFinite(db) ? db : 0));
}

/** Biquad coefficients from the RBJ Audio EQ Cookbook (same formulas as Web Audio's BiquadFilterNode). */
export function biquadCoefficients(type: BandType, freq: number, q: number, gainDb: number, sampleRate: number) {
  const A = 10 ** (gainDb / 40);
  const w0 = (2 * Math.PI * freq) / sampleRate;
  const cos = Math.cos(w0);
  const sin = Math.sin(w0);
  let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;
  if (type === "peaking") {
    const alpha = sin / (2 * q);
    b0 = 1 + alpha * A;
    b1 = -2 * cos;
    b2 = 1 - alpha * A;
    a0 = 1 + alpha / A;
    a1 = -2 * cos;
    a2 = 1 - alpha / A;
  } else {
    // Shelves: Web Audio uses a fixed slope S = 1.
    const alpha = (sin / 2) * Math.SQRT2;
    const k = 2 * Math.sqrt(A) * alpha;
    if (type === "lowshelf") {
      b0 = A * (A + 1 - (A - 1) * cos + k);
      b1 = 2 * A * (A - 1 - (A + 1) * cos);
      b2 = A * (A + 1 - (A - 1) * cos - k);
      a0 = A + 1 + (A - 1) * cos + k;
      a1 = -2 * (A - 1 + (A + 1) * cos);
      a2 = A + 1 + (A - 1) * cos - k;
    } else {
      b0 = A * (A + 1 + (A - 1) * cos + k);
      b1 = -2 * A * (A - 1 + (A + 1) * cos);
      b2 = A * (A + 1 + (A - 1) * cos - k);
      a0 = A + 1 - (A - 1) * cos + k;
      a1 = 2 * (A - 1 - (A + 1) * cos);
      a2 = A + 1 - (A - 1) * cos - k;
    }
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

/** Magnitude (dB) of one biquad at frequency f. */
export function biquadMagnitudeDb(c: ReturnType<typeof biquadCoefficients>, f: number, sampleRate: number): number {
  const w = (2 * Math.PI * f) / sampleRate;
  const cos1 = Math.cos(w);
  const sin1 = Math.sin(w);
  const cos2 = Math.cos(2 * w);
  const sin2 = Math.sin(2 * w);
  const nr = c.b0 + c.b1 * cos1 + c.b2 * cos2;
  const ni = -(c.b1 * sin1 + c.b2 * sin2);
  const dr = 1 + c.a1 * cos1 + c.a2 * cos2;
  const di = -(c.a1 * sin1 + c.a2 * sin2);
  const mag = Math.sqrt((nr * nr + ni * ni) / (dr * dr + di * di));
  return 20 * Math.log10(mag);
}

/** Total response (dB) of the 10-band EQ at each frequency. */
export function eqResponse(gains: number[], freqs: number[], sampleRate = 48000): number[] {
  const coeffs = EQ_BANDS.map((b, i) => biquadCoefficients(b.type, b.frequency, b.q, clampGain(gains[i] ?? 0), sampleRate));
  return freqs.map((f) => coeffs.reduce((s, c) => s + biquadMagnitudeDb(c, f, sampleRate), 0));
}

/** Log-spaced frequencies for plotting. */
export function logFrequencies(n: number, lo = 20, hi = 20000): number[] {
  return Array.from({ length: n }, (_, i) => lo * (hi / lo) ** (i / (n - 1)));
}

/** Pre-gain (dB) that keeps the loudest boost from clipping. */
export function eqHeadroom(gains: number[]): number {
  const maxBoost = Math.max(0, ...eqResponse(gains, logFrequencies(200)));
  return -maxBoost;
}
