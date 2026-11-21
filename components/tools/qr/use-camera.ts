"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function cameraSupported(): boolean {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && window.isSecureContext;
}

function cameraError(e: unknown): string {
  const name = e instanceof DOMException || e instanceof Error ? e.name : "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Camera permission was denied. Allow camera access in your browser's site settings, or upload a photo instead.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "No suitable camera was found on this device. Upload a photo instead.";
    case "NotReadableError":
      return "The camera is in use by another app or tab. Close it and try again.";
    default:
      return e instanceof Error && e.message ? e.message : "Could not start the camera.";
  }
}

/**
 * Manages a camera stream bound to a <video> element. Prefers the rear camera,
 * lists other cameras after permission is granted, and always stops every track
 * on stop, on camera switch and on unmount.
 */
export function useCamera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const tokenRef = useRef(0);
  const [active, setActive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState("");

  const release = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    const v = videoRef.current;
    if (v) {
      v.pause();
      v.srcObject = null;
    }
  }, []);

  const stop = useCallback(() => {
    tokenRef.current++;
    release();
    setActive(false);
    setStarting(false);
  }, [release]);

  const start = useCallback(
    async (id?: string) => {
      release();
      const token = ++tokenRef.current;
      setError(null);
      setStarting(true);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: id
            ? { deviceId: { exact: id } }
            : { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (token !== tokenRef.current) {
          // Stopped or restarted (or unmounted) while waiting for permission.
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          v.muted = true;
          v.playsInline = true;
          await v.play().catch(() => undefined);
        }
        setActive(true);
        const current = stream.getVideoTracks()[0]?.getSettings().deviceId;
        if (current) setDeviceId(current);
        const list = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
        if (token === tokenRef.current) setDevices(list);
      } catch (e) {
        if (token !== tokenRef.current) return;
        release();
        setActive(false);
        setError(cameraError(e));
      } finally {
        if (token === tokenRef.current) setStarting(false);
      }
    },
    [release],
  );

  useEffect(
    () => () => {
      tokenRef.current++;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    },
    [],
  );

  return { videoRef, active, starting, error, devices, deviceId, start, stop, setError };
}

/**
 * Runs `fn` on animation frames while `active`, at most every `minInterval` ms and
 * never concurrently (async detectors are awaited before the next attempt).
 */
export function useFrameLoop(active: boolean, fn: () => Promise<void> | void, minInterval = 120) {
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    let last = 0;
    let busy = false;
    let stopped = false;
    const tick = (t: number) => {
      if (stopped) return;
      raf = requestAnimationFrame(tick);
      if (busy || t - last < minInterval) return;
      last = t;
      busy = true;
      Promise.resolve()
        .then(() => fnRef.current())
        .catch(() => undefined)
        .finally(() => {
          busy = false;
        });
    };
    raf = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
    };
  }, [active, minInterval]);
}

/** Copies the current video frame into a reusable canvas, scaled to at most `maxSide`. */
export function grabFrame(video: HTMLVideoElement, canvas: HTMLCanvasElement, maxSide = 800): CanvasRenderingContext2D | null {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h || video.readyState < 2) return null;
  const s = Math.min(1, maxSide / Math.max(w, h));
  const cw = Math.round(w * s);
  const ch = Math.round(h * s);
  if (canvas.width !== cw) canvas.width = cw;
  if (canvas.height !== ch) canvas.height = ch;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, cw, ch);
  return ctx;
}
