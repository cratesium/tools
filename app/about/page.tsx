import type { Metadata } from "next";
import Link from "next/link";
import { StaticPage } from "@/components/layout/static-page";
import { absoluteUrl } from "@/lib/seo/site";

export const metadata: Metadata = {
  title: "About UtilityHub",
  description: "Why UtilityHub exists, how its 304 browser-based tools work, and the principles behind the project: privacy, speed and honesty.",
  alternates: { canonical: absoluteUrl("/about") },
};

export default function About() {
  return (
    <StaticPage title="About UtilityHub">
      <p>
        UtilityHub is a collection of 304 focused online tools for documents, media, code, data and the web. It was built on a simple idea: the small tasks
        you do every day – merging a PDF, compressing a photo, formatting JSON – should not require installing software, creating an account, or handing
        your files to a stranger&apos;s server.
      </p>
      <h2>How it works</h2>
      <p>
        Every page on UtilityHub is a static file served from Cloudflare&apos;s global network. When you use a tool, the processing code runs inside your
        browser tab using modern web platform features: WebAssembly (FFmpeg, libarchive, Tesseract), Web Workers, the Canvas API, the Web Audio API
        and the Web Crypto API.
      </p>
      <p>
        A small number of tools genuinely need a server – for example checking a website&apos;s HTTP headers (browsers block cross-site requests),
        DNS and WHOIS lookups, or rendering a website screenshot. Those tools call a lightweight Cloudflare Pages Function and are clearly labelled.
      </p>
      <h2>Principles</h2>
      <ul>
        <li><strong>Privacy first.</strong> Files stay on your device whenever technically possible.</li>
        <li><strong>No fake results.</strong> Progress bars reflect real progress. Conversions that cannot preserve layout say so.</li>
        <li><strong>Fast.</strong> Heavy engines load only on the pages that need them.</li>
        <li><strong>Accessible.</strong> Keyboard navigation, screen-reader labels and light and dark themes throughout.</li>
      </ul>
      <p>
        Browse the <Link href="/tools">full catalogue</Link> or read our <Link href="/privacy">privacy policy</Link>.
      </p>
    </StaticPage>
  );
}
