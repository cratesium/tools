"use client";

import { useRef, useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/field";
import { ActionBar, ErrorMessage, Panel, TaskProgress, UnsupportedNotice } from "@/components/tools/shared";
import { Dropzone } from "@/components/upload/dropzone";
import { decodeQrFromFile, decodeQrImageData } from "@/lib/processors/qr/render";
import { useSupport, useTask } from "@/lib/utils/hooks";
import { CameraView } from "./camera-view";
import { PayloadView } from "./payload-view";
import { cameraSupported, grabFrame, useCamera, useFrameLoop } from "./use-camera";

type Mode = "camera" | "image";

export default function QrScanner({ tool }: ToolComponentProps) {
  void tool;
  const camOk = useSupport(cameraSupported);
  const [mode, setMode] = useState<Mode>("camera");
  const [result, setResult] = useState<string | null>(null);
  const { videoRef, ...cam } = useCamera();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const task = useTask<string | null>();

  useFrameLoop(
    cam.active && !result,
    async () => {
      const video = videoRef.current;
      if (!video) return;
      canvasRef.current ??= document.createElement("canvas");
      const ctx = grabFrame(video, canvasRef.current, 800);
      if (!ctx) return;
      const c = canvasRef.current;
      const found = await decodeQrImageData(ctx.getImageData(0, 0, c.width, c.height), false);
      if (found != null) {
        setResult(found);
        cam.stop();
        if ("vibrate" in navigator) navigator.vibrate?.(60);
      }
    },
    120,
  );

  const onFile = async (files: File[]) => {
    setResult(null);
    const r = await task.run(async () => {
      const found = await decodeQrFromFile(files[0]);
      if (found == null) throw new Error("No QR code found in this image. Make sure the whole code is visible, in focus and not too small.");
      return found;
    });
    if (r != null) setResult(r);
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

  return (
    <div className="space-y-4">
      <Segmented
        label="Scan source"
        value={mode}
        onChange={switchMode}
        options={[
          { value: "camera", label: "Camera" },
          { value: "image", label: "Image file" },
        ]}
      />
      {mode === "camera" ? (
        <Panel title="Camera">
          {camOk === false ? (
            <UnsupportedNotice feature="Camera access">
              Camera scanning needs a secure (https) page and a browser with camera support. Upload a photo of the code instead.
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
              hint="Start the camera and point it at a QR code. Frames are analysed on your device only."
            />
          )}
          {result && !cam.active ? (
            <div className="mt-3">
              <Button variant="secondary" onClick={() => { setResult(null); cam.start(cam.deviceId || undefined); }}>
                Scan another
              </Button>
            </div>
          ) : null}
        </Panel>
      ) : (
        <Panel title="Image">
          <Dropzone
            onFiles={onFile}
            accept="image/png,image/jpeg,image/webp,image/gif,image/bmp,image/svg+xml"
            maxSize={25 * 1024 * 1024}
            formatsLabel="PNG, JPG, WebP, GIF, BMP or SVG"
          />
          <div className="mt-3">
            <TaskProgress running={task.running} progress={null} label="Looking for a QR code…" />
          </div>
        </Panel>
      )}
      <ErrorMessage error={task.error} />
      {result != null ? <PayloadView text={result} format="QR Code" /> : null}
      <ActionBar onReset={reset} />
    </div>
  );
}
