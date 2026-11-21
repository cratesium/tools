/** Segmentation models used by the background remover/changer (Transformers.js, Hugging Face Hub). */

export type BackgroundModelId = "modnet" | "birefnet";

export const backgroundModels: Record<
  BackgroundModelId,
  { label: string; repo: string; dtype: "fp32" | "fp16"; sizeLabel: string; license: string; requiresWebGpu: boolean; hint: string }
> = {
  modnet: {
    label: "Portrait (MODNet)",
    repo: "Xenova/modnet",
    dtype: "fp32",
    sizeLabel: "about 26 MB",
    license: "Apache-2.0",
    requiresWebGpu: false,
    hint: "Fast, works in every modern browser. Tuned for people: portraits, selfies, full-body shots.",
  },
  birefnet: {
    label: "Any subject (BiRefNet lite)",
    repo: "onnx-community/BiRefNet_lite-ONNX",
    dtype: "fp16",
    sizeLabel: "about 115 MB",
    license: "MIT",
    requiresWebGpu: true,
    hint: "Higher-quality general model for products, animals and objects. Requires WebGPU (recent Chrome or Edge).",
  },
};
