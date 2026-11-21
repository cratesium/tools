"use client";

import { Camera, CameraOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import type { RefObject } from "react";

/** Video viewport + start/stop + camera picker for the scanner tools. */
export interface CameraViewProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  active: boolean;
  starting: boolean;
  error: string | null;
  devices: MediaDeviceInfo[];
  deviceId: string;
  start: (deviceId?: string) => void;
  stop: () => void;
  hint: string;
}

export function CameraView({ videoRef, active, starting, error, devices, deviceId, start, stop, hint }: CameraViewProps) {
  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-lg border border-border bg-black">
        <video
          ref={videoRef}
          muted
          playsInline
          aria-label="Camera preview"
          className={active ? "block max-h-[420px] w-full object-contain" : "hidden"}
        />
        {active ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
            <div className="h-1/2 w-1/2 max-w-[260px] rounded-xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.25)]" />
          </div>
        ) : (
          <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 px-6 text-center text-sm text-white/70">
            <Camera className="h-6 w-6" aria-hidden />
            <span>{starting ? "Waiting for camera permission…" : hint}</span>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {active ? (
          <Button variant="secondary" onClick={stop} icon={<CameraOff className="h-4 w-4" />}>
            Stop camera
          </Button>
        ) : (
          <Button onClick={() => start()} loading={starting} icon={<Camera className="h-4 w-4" />} data-testid="run">
            Start camera
          </Button>
        )}
        {active && devices.length > 1 ? (
          <Select
            aria-label="Choose camera"
            className="w-auto max-w-[260px]"
            value={deviceId}
            onChange={(e) => start(e.target.value)}
          >
            {devices.map((d, i) => (
              <option key={d.deviceId || i} value={d.deviceId}>
                {d.label || `Camera ${i + 1}`}
              </option>
            ))}
          </Select>
        ) : null}
      </div>
      {error ? <Alert tone="warning">{error}</Alert> : null}
    </div>
  );
}
