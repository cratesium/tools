"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

/** Creates an object URL for a Blob and revokes it when the blob changes or the component unmounts. */
export function useObjectUrl(blob: Blob | null | undefined): string | null {
  const [entry, setEntry] = useState<{ blob: Blob; url: string } | null>(null);
  useEffect(() => {
    if (!blob) return;
    const u = URL.createObjectURL(blob);
    // Deferred so the effect doesn't set state synchronously; the URL is ready next tick.
    const t = setTimeout(() => setEntry({ blob, url: u }), 0);
    return () => {
      clearTimeout(t);
      URL.revokeObjectURL(u);
    };
  }, [blob]);
  return blob && entry?.blob === blob ? entry.url : null;
}

export type TaskStatus = "idle" | "running" | "done" | "error";

export interface TaskContext {
  signal: AbortSignal;
  /** Report real progress, 0–1. Pass null when progress is unknown. */
  progress: (value: number | null, label?: string) => void;
}

/**
 * Runs an async operation with status, real progress reporting, error capture and
 * cancellation. State is per component instance, so concurrent visitors and tabs
 * are fully isolated.
 */
export function useTask<T>() {
  const [status, setStatus] = useState<TaskStatus>("idle");
  const [result, setResult] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [progressLabel, setProgressLabel] = useState<string | undefined>();
  const ctrl = useRef<AbortController | null>(null);

  useEffect(() => () => ctrl.current?.abort(), []);

  const run = useCallback(async (fn: (ctx: TaskContext) => Promise<T>): Promise<T | null> => {
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setStatus("running");
    setError(null);
    setProgress(null);
    setProgressLabel(undefined);
    try {
      const r = await fn({
        signal: c.signal,
        progress: (v, label) => {
          if (c.signal.aborted) return;
          setProgress(v);
          if (label !== undefined) setProgressLabel(label);
        },
      });
      if (c.signal.aborted) return null;
      setResult(r);
      setStatus("done");
      return r;
    } catch (e) {
      if (c.signal.aborted) return null;
      setError(errorMessage(e));
      setStatus("error");
      return null;
    }
  }, []);

  const cancel = useCallback(() => {
    ctrl.current?.abort();
    setStatus("idle");
    setProgress(null);
  }, []);

  const reset = useCallback(() => {
    ctrl.current?.abort();
    ctrl.current = null;
    setStatus("idle");
    setResult(null);
    setError(null);
    setProgress(null);
    setProgressLabel(undefined);
  }, []);

  return { status, result, error, progress, progressLabel, run, cancel, reset, setError, running: status === "running" };
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message || e.name;
  if (typeof e === "string") return e;
  try {
    return JSON.stringify(e);
  } catch {
    return "Unknown error";
  }
}

/** Debounced value, for live processing of large text inputs. */
export function useDebounced<T>(value: T, ms = 200): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Feature detection that is safe during prerender (returns null until mounted). */
const noopSubscribe = () => () => {};

export function useSupport(check: () => boolean): boolean | null {
  return useSyncExternalStore(
    noopSubscribe,
    () => {
      try {
        return check();
      } catch {
        return false;
      }
    },
    () => null,
  );
}
