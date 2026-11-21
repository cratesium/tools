/**
 * PCM operations on planar Float32 channel data (as returned by AudioBuffer.getChannelData).
 * All functions are pure and return new arrays.
 */

import type { TimeRange } from "@/lib/processors/media/timecode";

export type Channels = Float32Array[];

export const dbToGain = (db: number) => 10 ** (db / 20);
export const gainToDb = (g: number) => (g > 0 ? 20 * Math.log10(g) : -Infinity);

export function peak(channels: Channels): number {
  let p = 0;
  for (const c of channels)
    for (let i = 0; i < c.length; i++) {
      const a = Math.abs(c[i]);
      if (a > p) p = a;
    }
  return p;
}

/** RMS across all channels. */
export function rms(channels: Channels): number {
  let sum = 0;
  let n = 0;
  for (const c of channels) {
    for (let i = 0; i < c.length; i++) sum += c[i] * c[i];
    n += c.length;
  }
  return n ? Math.sqrt(sum / n) : 0;
}

export interface LevelStats {
  peak: number;
  peakDb: number;
  rms: number;
  rmsDb: number;
}

export function levels(channels: Channels): LevelStats {
  const p = peak(channels);
  const r = rms(channels);
  return { peak: p, peakDb: gainToDb(p), rms: r, rmsDb: gainToDb(r) };
}

export type NormalizeMode = "peak" | "rms";

export interface NormalizePlan {
  gain: number;
  gainDb: number;
  /** Peak after applying gain, before limiting. */
  resultingPeakDb: number;
  /** True if reaching the RMS target required more gain than the peak ceiling allows. */
  limitedByPeak: boolean;
}

/**
 * Gain needed to bring audio to `targetDb` (dBFS peak, or dBFS RMS). For RMS mode, the gain is
 * capped so the peak does not exceed `ceilingDb` unless `allowClipping` is set.
 */
export function normalizeGain(stats: LevelStats, mode: NormalizeMode, targetDb: number, ceilingDb = -1): NormalizePlan {
  const current = mode === "peak" ? stats.peakDb : stats.rmsDb;
  if (!Number.isFinite(current)) return { gain: 1, gainDb: 0, resultingPeakDb: stats.peakDb, limitedByPeak: false };
  let gainDb = targetDb - current;
  let limitedByPeak = false;
  if (mode === "rms" && stats.peakDb + gainDb > ceilingDb) {
    gainDb = ceilingDb - stats.peakDb;
    limitedByPeak = true;
  }
  return { gain: dbToGain(gainDb), gainDb, resultingPeakDb: stats.peakDb + gainDb, limitedByPeak };
}

/** Multiplies samples by `gain`. With `limit`, samples are soft-clipped above the ceiling instead of hard-clipped. */
export function applyGain(channels: Channels, gain: number, opts: { limit?: boolean; ceiling?: number } = {}): Channels {
  const ceiling = opts.ceiling ?? 1;
  return channels.map((c) => {
    const out = new Float32Array(c.length);
    for (let i = 0; i < c.length; i++) {
      let s = c[i] * gain;
      if (opts.limit) s = softLimit(s, ceiling);
      else if (s > 1) s = 1;
      else if (s < -1) s = -1;
      out[i] = s;
    }
    return out;
  });
}

/** Transparent below 90 % of the ceiling, smooth tanh knee above it. */
export function softLimit(s: number, ceiling = 1): number {
  const knee = ceiling * 0.9;
  const a = Math.abs(s);
  if (a <= knee) return s;
  const over = (a - knee) / (ceiling - knee);
  return Math.sign(s) * (knee + (ceiling - knee) * Math.tanh(over));
}

export function countClipped(channels: Channels, threshold = 0.9999): number {
  let n = 0;
  for (const c of channels) for (let i = 0; i < c.length; i++) if (Math.abs(c[i]) >= threshold) n++;
  return n;
}

export function reverse(channels: Channels): Channels {
  return channels.map((c) => {
    const out = new Float32Array(c.length);
    for (let i = 0, j = c.length - 1; i < c.length; i++, j--) out[i] = c[j];
    return out;
  });
}

export function toFrames(seconds: number, sampleRate: number): number {
  return Math.max(0, Math.round(seconds * sampleRate));
}

/** Copy of [start, end) seconds. */
export function slice(channels: Channels, sampleRate: number, range: TimeRange): Channels {
  const len = channels[0]?.length ?? 0;
  const a = Math.min(len, toFrames(range.start, sampleRate));
  const b = Math.min(len, Math.max(a, toFrames(range.end, sampleRate)));
  return channels.map((c) => c.slice(a, b));
}

/** Removes [start, end) seconds, optionally crossfading the join over `crossfadeSec`. */
export function removeRange(channels: Channels, sampleRate: number, range: TimeRange, crossfadeSec = 0): Channels {
  const len = channels[0]?.length ?? 0;
  const a = Math.min(len, toFrames(range.start, sampleRate));
  const b = Math.min(len, Math.max(a, toFrames(range.end, sampleRate)));
  const before = channels.map((c) => c.subarray(0, a));
  const after = channels.map((c) => c.subarray(b));
  return concat([before, after], sampleRate, { crossfadeSec });
}

/**
 * Concatenates clips (all at the same sample rate). Clips with fewer channels are upmixed by
 * duplicating their last channel. `gapSec` inserts silence; `crossfadeSec` overlaps clips with
 * an equal-power crossfade (ignored when a gap is set).
 */
export function concat(clips: Channels[], sampleRate: number, opts: { gapSec?: number; crossfadeSec?: number } = {}): Channels {
  const clipsNonEmpty = clips.filter((c) => c.length && c[0].length > 0);
  if (!clipsNonEmpty.length) return [new Float32Array(0)];
  const numCh = Math.max(...clipsNonEmpty.map((c) => c.length));
  const gap = toFrames(opts.gapSec ?? 0, sampleRate);
  let xf = gap > 0 ? 0 : toFrames(opts.crossfadeSec ?? 0, sampleRate);
  for (const c of clipsNonEmpty) xf = Math.min(xf, Math.floor(c[0].length / 2));
  const total = clipsNonEmpty.reduce((s, c) => s + c[0].length, 0) + gap * (clipsNonEmpty.length - 1) - xf * (clipsNonEmpty.length - 1);
  const out = Array.from({ length: numCh }, () => new Float32Array(Math.max(0, total)));
  let pos = 0;
  clipsNonEmpty.forEach((clip, k) => {
    const n = clip[0].length;
    for (let ch = 0; ch < numCh; ch++) {
      const src = clip[Math.min(ch, clip.length - 1)];
      const dst = out[ch];
      for (let i = 0; i < n; i++) {
        let s = src[i];
        if (xf && k > 0 && i < xf) s *= Math.sin(((i + 0.5) / xf) * (Math.PI / 2)); // fade in
        if (xf && k < clipsNonEmpty.length - 1 && i >= n - xf) s *= Math.cos(((i - (n - xf) + 0.5) / xf) * (Math.PI / 2)); // fade out
        dst[pos + i] += s;
      }
    }
    pos += n - xf + gap;
  });
  return out;
}

/** Linear (or equal-power) fades at the start and end. */
export function fade(channels: Channels, sampleRate: number, fadeInSec: number, fadeOutSec: number): Channels {
  const len = channels[0]?.length ?? 0;
  const fi = Math.min(len, toFrames(fadeInSec, sampleRate));
  const fo = Math.min(len, toFrames(fadeOutSec, sampleRate));
  return channels.map((c) => {
    const out = c.slice();
    for (let i = 0; i < fi; i++) out[i] *= i / fi;
    for (let i = 0; i < fo; i++) out[len - 1 - i] *= i / fo;
    return out;
  });
}

export function mixToMono(channels: Channels): Float32Array {
  if (channels.length === 1) return channels[0].slice();
  const len = channels[0].length;
  const out = new Float32Array(len);
  for (const c of channels) for (let i = 0; i < len; i++) out[i] += c[i];
  for (let i = 0; i < len; i++) out[i] /= channels.length;
  return out;
}

/** Linear-interpolation resampler (used for tests and as a fallback; browsers use OfflineAudioContext). */
export function resampleLinear(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return input.slice();
  const outLen = Math.max(1, Math.round((input.length * toRate) / fromRate));
  const out = new Float32Array(outLen);
  const ratio = fromRate / toRate;
  for (let i = 0; i < outLen; i++) {
    const x = i * ratio;
    const i0 = Math.floor(x);
    const i1 = Math.min(input.length - 1, i0 + 1);
    const t = x - i0;
    out[i] = (input[i0] ?? 0) * (1 - t) + (input[i1] ?? 0) * t;
  }
  return out;
}

/** Min/max pairs per bucket for drawing a waveform. Returns [min0, max0, min1, max1, ...]. */
export function waveformPeaks(channel: Float32Array, buckets: number): Float32Array {
  const out = new Float32Array(buckets * 2);
  const step = channel.length / buckets;
  for (let b = 0; b < buckets; b++) {
    const a = Math.floor(b * step);
    const e = Math.max(a + 1, Math.floor((b + 1) * step));
    let mn = 1;
    let mx = -1;
    for (let i = a; i < e && i < channel.length; i++) {
      const s = channel[i];
      if (s < mn) mn = s;
      if (s > mx) mx = s;
    }
    if (mn > mx) mn = mx = 0;
    out[b * 2] = mn;
    out[b * 2 + 1] = mx;
  }
  return out;
}

/**
 * Splits a long mono signal into chunks of at most `maxSec`, cutting at the quietest
 * 50 ms window within the last `searchSec` of each chunk so words are rarely split.
 * Returns sample offsets [start, end).
 */
export function quietChunks(signal: Float32Array, sampleRate: number, maxSec = 30, searchSec = 5): [number, number][] {
  const max = Math.floor(maxSec * sampleRate);
  const search = Math.floor(Math.min(searchSec, maxSec / 2) * sampleRate);
  const win = Math.max(1, Math.floor(0.05 * sampleRate));
  const out: [number, number][] = [];
  let start = 0;
  while (start < signal.length) {
    if (signal.length - start <= max) {
      out.push([start, signal.length]);
      break;
    }
    const hardEnd = start + max;
    let best = hardEnd;
    let bestE = Infinity;
    for (let w = hardEnd - search; w + win <= hardEnd; w += win) {
      let e = 0;
      for (let i = w; i < w + win; i++) e += signal[i] * signal[i];
      if (e < bestE) {
        bestE = e;
        best = w + Math.floor(win / 2);
      }
    }
    out.push([start, best]);
    start = best;
  }
  return out;
}
