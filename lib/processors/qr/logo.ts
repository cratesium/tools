/** Geometry for placing a centre logo on a QR code without breaking it. */

/** Hard cap: the logo box (including its backing pad) may cover at most 22% of the QR symbol area. */
export const MAX_LOGO_AREA = 0.22;

export interface LogoBox {
  /** Backing pad (white square behind the logo). */
  pad: { x: number; y: number; size: number };
  /** Logo image rectangle, aspect ratio preserved, inside the pad. */
  image: { x: number; y: number; w: number; h: number };
}

/**
 * @param canvasSize   total rendered size in px (includes quiet zone)
 * @param moduleCount  number of modules per side (QR version size)
 * @param margin       quiet zone in modules
 * @param areaFraction requested share of the symbol area (clamped to MAX_LOGO_AREA)
 * @param imgW,imgH    natural logo dimensions
 * @param padRatio     share of the pad side used as padding around the image
 */
export function computeLogoBox(
  canvasSize: number,
  moduleCount: number,
  margin: number,
  areaFraction: number,
  imgW: number,
  imgH: number,
  padRatio = 0.1,
): LogoBox {
  const frac = Math.min(Math.max(areaFraction, 0), MAX_LOGO_AREA);
  const scale = canvasSize / (moduleCount + 2 * margin);
  const symbol = moduleCount * scale;
  const padSize = Math.sqrt(frac) * symbol;
  const inner = padSize * (1 - 2 * padRatio);
  const ratio = imgW > 0 && imgH > 0 ? imgW / imgH : 1;
  const w = ratio >= 1 ? inner : inner * ratio;
  const h = ratio >= 1 ? inner / ratio : inner;
  const c = canvasSize / 2;
  return {
    pad: { x: c - padSize / 2, y: c - padSize / 2, size: padSize },
    image: { x: c - w / 2, y: c - h / 2, w, h },
  };
}
