/**
 * Spectral-gating noise reduction (STFT, Hann window, 75 % overlap).
 *
 * 1. A noise profile (per-frequency mean + standard deviation of magnitude) is learned from a
 *    noise-only region chosen by the user, or automatically from the quietest 10 % of frames.
 * 2. Each STFT bin whose magnitude is below `mean + sensitivity·std` is attenuated by
 *    `reductionDb`; the mask is smoothed across frequency and time to limit "musical noise".
 * 3. The signal is resynthesised with weighted overlap-add.
 *
 * This removes steady noise (hiss, hum, fan, room tone) well; it cannot separate noise that
 * overlaps speech in time and frequency the way ML denoisers do.
 */

export interface DenoiseOptions {
  /** Attenuation applied to noise bins, in dB (e.g. 12–30). */
  reductionDb: number;
  /** Threshold in standard deviations above the noise mean (1–3). Higher = more aggressive. */
  sensitivity: number;
  /** Noise-only region in samples [start, end). Auto-detected when omitted. */
  noiseRegion?: [number, number];
  /** FFT size (power of two). Default 2048. */
  fftSize?: number;
}

/** In-place iterative radix-2 complex FFT. `inverse` computes the unscaled inverse. */
export function fft(re: Float64Array, im: Float64Array, inverse = false): void {
  const n = re.length;
  if (n & (n - 1)) throw new Error("FFT size must be a power of two.");
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i];
      re[i] = re[j];
      re[j] = t;
      t = im[i];
      im[i] = im[j];
      im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k;
        const b = a + half;
        const xr = re[b] * cr - im[b] * ci;
        const xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr;
        im[b] = im[a] - xi;
        re[a] += xr;
        im[a] += xi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

export function hann(n: number): Float64Array {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
  return w;
}

export interface NoiseProfile {
  mean: Float64Array;
  std: Float64Array;
  frames: number;
}

/** Frame start offsets of the quietest `fraction` of frames (time-domain energy). */
export function quietestFrames(signal: Float32Array, size: number, hop: number, fraction = 0.1): number[] {
  const starts: { s: number; e: number }[] = [];
  for (let s = 0; s + size <= signal.length; s += hop) {
    let e = 0;
    for (let i = s; i < s + size; i++) e += signal[i] * signal[i];
    starts.push({ s, e });
  }
  if (!starts.length) return signal.length ? [0] : [];
  starts.sort((a, b) => a.e - b.e);
  const n = Math.max(1, Math.floor(starts.length * fraction));
  return starts.slice(0, n).map((x) => x.s);
}

export function noiseProfile(signal: Float32Array, frameStarts: number[], size: number): NoiseProfile {
  const bins = size / 2 + 1;
  const sum = new Float64Array(bins);
  const sq = new Float64Array(bins);
  const w = hann(size);
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  for (const s of frameStarts) {
    for (let i = 0; i < size; i++) {
      re[i] = (signal[s + i] ?? 0) * w[i];
      im[i] = 0;
    }
    fft(re, im);
    for (let k = 0; k < bins; k++) {
      const m = Math.hypot(re[k], im[k]);
      sum[k] += m;
      sq[k] += m * m;
    }
  }
  const n = Math.max(1, frameStarts.length);
  const mean = new Float64Array(bins);
  const std = new Float64Array(bins);
  for (let k = 0; k < bins; k++) {
    mean[k] = sum[k] / n;
    std[k] = Math.sqrt(Math.max(0, sq[k] / n - mean[k] * mean[k]));
  }
  return { mean, std, frames: frameStarts.length };
}

/**
 * Generator form so the UI can yield to the event loop and report real progress.
 * Yields progress 0–1; the return value is the denoised signal.
 */
export function* spectralGateSteps(signal: Float32Array, opts: DenoiseOptions): Generator<number, Float32Array> {
  const size = opts.fftSize ?? 2048;
  const hop = size / 4;
  const bins = size / 2 + 1;
  if (signal.length < size) return signal.slice();

  // Pad so every sample is covered by full overlap.
  const padded = new Float32Array(signal.length + 2 * size);
  padded.set(signal, size);

  let starts: number[];
  if (opts.noiseRegion && opts.noiseRegion[1] - opts.noiseRegion[0] >= size) {
    starts = [];
    for (let s = opts.noiseRegion[0] + size; s + size <= opts.noiseRegion[1] + size; s += hop) starts.push(s);
  } else starts = quietestFrames(padded.subarray(size, size + signal.length), size, hop, 0.1).map((s) => s + size);
  const profile = noiseProfile(padded, starts, size);

  const floor = 10 ** (-Math.abs(opts.reductionDb) / 20);
  const thresh = new Float64Array(bins);
  for (let k = 0; k < bins; k++) thresh[k] = profile.mean[k] + opts.sensitivity * profile.std[k];

  const w = hann(size);
  const out = new Float64Array(padded.length);
  const norm = new Float64Array(padded.length);
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  const mask = new Float64Array(bins);
  const smooth = new Float64Array(bins).fill(1);
  const total = Math.floor((padded.length - size) / hop) + 1;
  // Release is slower than attack so noise tails fade instead of chattering.
  const attack = 0.5;
  const release = 0.15;

  let frame = 0;
  for (let s = 0; s + size <= padded.length; s += hop, frame++) {
    for (let i = 0; i < size; i++) {
      re[i] = padded[s + i] * w[i];
      im[i] = 0;
    }
    fft(re, im);
    for (let k = 0; k < bins; k++) mask[k] = Math.hypot(re[k], im[k]) > thresh[k] ? 1 : floor;
    // Frequency smoothing (3-bin moving average) then time smoothing.
    for (let k = 0; k < bins; k++) {
      const m = (mask[Math.max(0, k - 1)] + mask[k] + mask[Math.min(bins - 1, k + 1)]) / 3;
      const coef = m > smooth[k] ? attack : release;
      smooth[k] += (m - smooth[k]) * coef;
    }
    for (let k = 0; k < bins; k++) {
      const g = smooth[k];
      re[k] *= g;
      im[k] *= g;
      if (k > 0 && k < size / 2) {
        re[size - k] *= g;
        im[size - k] *= g;
      }
    }
    fft(re, im, true);
    for (let i = 0; i < size; i++) {
      out[s + i] += (re[i] / size) * w[i];
      norm[s + i] += w[i] * w[i];
    }
    if (frame % 256 === 0) yield frame / total;
  }
  const result = new Float32Array(signal.length);
  for (let i = 0; i < signal.length; i++) {
    const n = norm[i + size];
    result[i] = n > 1e-8 ? out[i + size] / n : 0;
  }
  return result;
}

export function spectralGate(signal: Float32Array, opts: DenoiseOptions): Float32Array {
  const it = spectralGateSteps(signal, opts);
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
  }
}
