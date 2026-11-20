import type { Metadata } from "next";
import { StaticPage } from "@/components/layout/static-page";
import { absoluteUrl } from "@/lib/seo/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How UtilityHub handles your files and data: browser-side processing, no file storage, no accounts and minimal server requests.",
  alternates: { canonical: absoluteUrl("/privacy") },
};

export default function Privacy() {
  return (
    <StaticPage title="Privacy Policy" updated="21 November 2026">
      <h2>Summary</h2>
      <p>
        UtilityHub is designed so that we never need to see your files. Most tools process data entirely within your browser. We do not have user
        accounts, we do not store your files, and we do not sell data.
      </p>
      <h2>Files you process</h2>
      <p>
        For browser-based tools (the large majority, including all PDF, image, video, audio, archive, spreadsheet, text, developer, security and file
        tools), files are read into your browser&apos;s memory and processed on your device. They are not uploaded to UtilityHub. Temporary data is
        released when you click Reset, navigate away or close the tab.
      </p>
      <p>
        Some tools download an open-source processing engine or model the first time you use them (for example FFmpeg.wasm, Tesseract OCR language
        data or a speech or segmentation model) from a public CDN such as jsDelivr, unpkg or Hugging Face. Only the engine is downloaded; your files are
        not sent to these providers.
      </p>
      <h2>Tools that use a server</h2>
      <p>
        Web and Internet tools such as the HTTP header checker, website status checker, meta tag analyzer, link checkers, WHOIS lookup and SSL
        certificate checker must make network requests that browsers block for security reasons. For these, the URL or domain you enter is sent to a
        UtilityHub Cloudflare Pages Function, which makes the request and returns the result. Depending on the tool, the query may also be forwarded to a
        public data source (for example RDAP registries, Certificate Transparency logs or Cloudflare DNS-over-HTTPS). These tools are labelled
        &ldquo;Server&rdquo; in the catalogue.
      </p>
      <p>
        The URL shortener, if enabled by the site operator, stores the destination URL you submit together with the generated code so that the short
        link can redirect. It stores nothing else about you.
      </p>
      <h2>Logs and analytics</h2>
      <p>
        Like any website, Cloudflare processes standard request metadata (such as IP address and user agent) to deliver pages and protect against abuse.
        UtilityHub does not add third-party advertising or tracking scripts.
      </p>
      <h2>Local storage</h2>
      <p>We store your light/dark theme preference in your browser&apos;s local storage. Nothing else is persisted.</p>
      <h2>Contact</h2>
      <p>Questions about this policy can be raised through the project&apos;s GitHub repository.</p>
    </StaticPage>
  );
}
