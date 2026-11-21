"use client";

import { useEffect, useRef, useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/field";
import { Badge } from "@/components/ui/feedback";
import { ActionBar, ErrorMessage, KeyValueTable, Panel, TaskProgress, UnsupportedNotice } from "@/components/tools/shared";
import { Dropzone } from "@/components/upload/dropzone";
import { isValidGs1 } from "@/lib/processors/qr/barcode";
import { createEngine, createZxing, type DetectedCode, type Engine } from "@/lib/processors/qr/detect";
import { drawScaled, loadImage } from "@/lib/processors/qr/render";
import { errorMessage, useSupport, useTask } from "@/lib/utils/hooks";
import { CameraView } from "./camera-view";
import { PayloadView } from "./payload-view";
import { cameraSupported, grabFrame, useCamera, useFrameLoop } from "./use-camera";

type Mode = "camera" | "image";

const GS1 = new Set(["EAN-13", "EAN-8", "UPC-A", "ITF"]);

async function detectInFile(file: File, engine: Engine): Promise<DetectedCode | null> {
  const img = await loadImage(file);
  try {
    let zx: Engine | null = engine.name === "zxing" ? engine : null;
    for (const side of [1600, 1000, 2400, 600]) {
      const c = drawScaled(img.source, img.width, img.height, side);
      const r = await engine.detect(c);
      if (r) return r;
      // Native detectors miss some symbologies; ZXing is a second opinion.
      zx ??= await createZxing();
      if (zx !== engine) {
        const z = await zx.detect(c);
        if (z) return z;
      }
    }
    return null;
  } finally {
    img.close();
  }
}

export default function BarcodeScanner({ tool }: ToolComponentProps) {
  void tool;
  const camOk = useSupport(cameraSupported);
  const [mode, setMode] = useState<Mode>("camera");
  const [result, setResult] = useState<DetectedCode | null>(null);
  const [engine, setEngine] = useState<Engine | null>(null);
  const [engineError, setEngineError] = useState<string | null>(null);
  const { videoRef, ...cam } = useCamera();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const task = useTask<DetectedCode>();

  useEffect(() => {
    let alive = true;
    createEngine()
      .then((e) => alive && setEngine(e))
      .catch((e) => alive && setEngineError(errorMessage(e)));
    return () => {
      alive = false;
    };
  }, []);

  useFrameLoop(
    cam.active && !result && !!engine,
    async () => {
      const video = videoRef.current;
      if (!video || !engine) return;
      canvasRef.current ??= document.createElement("canvas");
      // 1D barcodes need horizontal resolution; keep frames fairly large.
      if (!grabFrame(video, canvasRef.current, 1280)) return;
      const found = await engine.detect(canvasRef.current);
      if (found) {
        setResult(found);
        cam.stop();
        if ("vibrate" in navigator) navigator.vibrate?.(60);
      }
    },
    engine?.name === "native" ? 120 : 250,
  );

  const onFile = async (files: File[]) => {
    setResult(null);
    const r = await task.run(async () => {
      const e = engine ?? (await createEngine());
      const found = await detectInFile(files[0], e);
      if (!found) throw new Error("No barcode found. Crop closer to the barcode, keep it sharp and well lit, and make sure the quiet zone either side is visible.");
      return found;
    });
    if (r) setResult(r);
  };

  const switchMode = (m: Mode) => {
    cam.stop();
    setMode(m);
    setResult(null);
    task.reset();
  };

  const reset = () => {
    cam.stop();
    cam.setError(null);
    setResult(null);
    task.reset();
  };

  const isQrLike = result && ["QR Code", "Data Matrix", "Aztec", "PDF417"].includes(result.format);
  const checksum =
    result && GS1.has(result.format) && /^\d+$/.test(result.text) ? (isValidGs1(result.text) ? "Valid" : "Invalid") : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented
          label="Scan source"
          value={mode}
          onChange={switchMode}
          options={[
            { value: "camera", label: "Camera" },
            { value: "image", label: "Image file" },
          ]}
        />
        {engine ? (
          <Badge>{engine.name === "native" ? "Native BarcodeDetector" : "ZXing decoder"}</Badge>
        ) : null}
      </div>
      <ErrorMessage error={engineError} />
      {mode === "camera" ? (
        <Panel title="Camera">
          {camOk === false ? (
            <UnsupportedNotice feature="Camera access">
              Camera scanning needs a secure (https) page and a browser with camera support. Upload a photo of the barcode instead.
            </UnsupportedNotice>
          ) : (
            <CameraView
              videoRef={videoRef}
              active={cam.active}
              starting={cam.starting}
              error={cam.error}
              devices={cam.devices}
              deviceId={cam.deviceId}
              start={cam.start}
              stop={cam.stop}
              hint="Start the camera and hold the barcode horizontally inside the frame, about 10–20 cm away."
            />
          )}
          {result && !cam.active ? (
            <div className="mt-3">
              <Button
                variant="secondary"
                onClick={() => {
                  setResult(null);
                  cam.start(cam.deviceId || undefined);
                }}
              >
                Scan another
              </Button>
            </div>
          ) : null}
        </Panel>
      ) : (
        <Panel title="Image">
          <Dropzone
            onFiles={onFile}
            accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
            maxSize={25 * 1024 * 1024}
            formatsLabel="PNG, JPG, WebP, GIF or BMP"
          />
          <div className="mt-3">
            <TaskProgress running={task.running} progress={null} label="Looking for a barcode…" />
          </div>
        </Panel>
      )}
      <ErrorMessage error={task.error} />
      {result ? (
        isQrLike ? (
          <PayloadView text={result.text} format={result.format} />
        ) : (
          <PayloadView
            text={result.text}
            format={result.format}
            extra={
              <KeyValueTable
                rows={[
                  ["Format", result.format],
                  ["Value", result.text],
                  ["Length", `${result.text.length} characters`],
                  ...(checksum ? ([["GS1 check digit", checksum]] as [string, string][]) : []),
                ]}
              />
            }
          />
        )
      ) : null}
      <ActionBar onReset={reset} />
    </div>
  );
}
