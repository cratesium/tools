// Local typing for the untyped imagetracerjs package (CommonJS singleton).
declare module "imagetracerjs" {
  const ImageTracer: {
    imagedataToSVG(img: { width: number; height: number; data: Uint8ClampedArray }, options?: Record<string, unknown> | string): string;
    optionpresets: Record<string, Record<string, unknown>>;
  };
  export default ImageTracer;
}
