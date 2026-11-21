export const SITE_NAME = "UtilityHub";
/** Set NEXT_PUBLIC_SITE_URL in Cloudflare Pages (e.g. https://utilityhub.example.com). No trailing slash. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://utilityhub-4kt.pages.dev").replace(/\/+$/, "");
export const SITE_TAGLINE = "304 free online tools that run in your browser";
export const SITE_DESCRIPTION =
  "304 free online tools for PDF, image, video, audio, text and code. Most run privately in your browser – no uploads, no sign-up.";

export function absoluteUrl(path = "/"): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
