import type { ComponentType } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { lazyTool } from "../lazy";

type Mod = Record<string, unknown>;
const named = <M extends Mod>(load: () => Promise<M>, name: keyof M) =>
  lazyTool(() => load().then((m) => ({ default: m[name] as ComponentType<ToolComponentProps> })));

/** Processor id → UI component for the "audio" category (each a separate chunk). */
const components: Record<string, ComponentType<ToolComponentProps>> = {
  "audio.convert": lazyTool(() => import("./convert")),
  "audio.compress": lazyTool(() => import("./compress")),
  "audio.trim": named(() => import("./edit"), "AudioTrim"),
  "audio.merge": named(() => import("./edit"), "AudioMerge"),
  "audio.split": named(() => import("./edit"), "AudioSplit"),
  "audio.speed": named(() => import("./effects"), "AudioSpeed"),
  "audio.volume": named(() => import("./effects"), "AudioVolume"),
  "audio.normalize": named(() => import("./effects"), "AudioNormalize"),
  "audio.reverse": named(() => import("./effects"), "AudioReverse"),
  "audio.equalizer": named(() => import("./effects"), "AudioEqualizer"),
  "audio.denoise": lazyTool(() => import("./denoise")),
  "audio.record": lazyTool(() => import("./recorder")),
  "audio.transcribe": lazyTool(() => import("./transcribe")),
  "audio.tts": lazyTool(() => import("./tts")),
  "audio.metadata-edit": named(() => import("./metadata"), "AudioMetadataEditor"),
  "audio.metadata-strip": named(() => import("./metadata"), "AudioMetadataRemover"),
};

export default components;
