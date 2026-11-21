import type { ComponentType } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { lazyTool } from "../lazy";

type Mod = Record<string, unknown>;
/** Lazy-loads a named export from a module as its own chunk. */
const named = <M extends Mod>(load: () => Promise<M>, name: keyof M) =>
  lazyTool(() => load().then((m) => ({ default: m[name] as ComponentType<ToolComponentProps> })));

/** Processor id → UI component for the "video" category (each a separate chunk). */
const components: Record<string, ComponentType<ToolComponentProps>> = {
  "video.compress": lazyTool(() => import("./compress")),
  "video.convert": lazyTool(() => import("./convert")),
  "video.trim": lazyTool(() => import("./trim")),
  "video.merge": lazyTool(() => import("./merge")),
  "video.split": lazyTool(() => import("./split")),
  "video.crop": lazyTool(() => import("./crop")),
  "video.resize": named(() => import("./transform"), "VideoResize"),
  "video.rotate": named(() => import("./transform"), "VideoRotate"),
  "video.speed": named(() => import("./transform"), "VideoSpeed"),
  "video.reverse": named(() => import("./transform"), "VideoReverse"),
  "video.mute": named(() => import("./transform"), "VideoMute"),
  "video.fps": named(() => import("./transform"), "VideoFps"),
  "video.extract-audio": lazyTool(() => import("./extract-audio")),
  "video.to-gif": named(() => import("./gif"), "VideoToGif"),
  "video.gif-to-video": named(() => import("./gif"), "GifToVideo"),
  "video.thumbnails": named(() => import("./frames"), "VideoThumbnails"),
  "video.screenshot": named(() => import("./frames"), "VideoScreenshot"),
  "video.watermark": lazyTool(() => import("./watermark")),
  "video.metadata": named(() => import("./metadata"), "VideoMetadataViewer"),
  "video.strip-metadata": named(() => import("./metadata"), "VideoMetadataRemover"),
  "video.subtitle-extract": named(() => import("./subtitles"), "SubtitleExtract"),
  "video.subtitle-merge": named(() => import("./subtitles"), "SubtitleMerge"),
};

export default components;
