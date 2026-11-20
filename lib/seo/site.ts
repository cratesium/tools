export const SITE_NAME = "UtilityHub";
/** Set NEXT_PUBLIC_SITE_URL in Cloudflare Pages (e.g. https://utilityhub.example.com). No trailing slash. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://utilityhub.pages.dev").replace(/\/+$/, "");
export const SITE_TAGLINE = "304 free online tools that run in your browser";
export const SITE_DESCRIPTION =
  "UtilityHub is a free collection of 304 privacy-first online tools for PDFs, images, video, audio, archives, text, code, data, security, QR codes, calculators, files and the web. Most tools process files locally in your browser.";

export function absoluteUrl(path = "/"): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
