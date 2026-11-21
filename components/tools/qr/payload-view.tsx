"use client";

import { useMemo, type ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/feedback";
import { CopyButton, DownloadButton, KeyValueTable, Panel } from "@/components/tools/shared";
import { parseQrPayload, payloadKindLabel } from "@/lib/processors/qr/parse";

function ExtLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="inline-flex items-center gap-1 break-all text-fg underline underline-offset-4 hover:opacity-80"
    >
      {children}
      <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
    </a>
  );
}

/** Shows a decoded payload with type-aware fields (link, Wi-Fi, contact, …) plus the raw text. */
export function PayloadView({ text, format, extra }: { text: string; format?: string; extra?: ReactNode }) {
  const parsed = useMemo(() => parseQrPayload(text), [text]);
  let body: ReactNode = null;

  switch (parsed.kind) {
    case "url":
      body = (
        <div className="space-y-2 text-sm">
          <ExtLink href={parsed.url}>{parsed.url}</ExtLink>
          <p className="text-xs text-fg-subtle">Check the address before opening it. QR codes can point to look-alike phishing sites.</p>
        </div>
      );
      break;
    case "wifi":
      body = (
        <div className="space-y-2">
          <KeyValueTable
            rows={[
              ["Network (SSID)", parsed.ssid || "—"],
              ["Security", parsed.encryption === "nopass" ? "Open (no password)" : parsed.encryption],
              ["Password", parsed.password || "—"],
              ["Hidden", parsed.hidden ? "Yes" : "No"],
            ]}
          />
          {parsed.password ? <CopyButton text={parsed.password} label="Copy password" /> : null}
        </div>
      );
      break;
    case "vcard":
    case "mecard":
      body = (
        <div className="space-y-2">
          <KeyValueTable rows={parsed.fields.map(([k, v]) => [k, <span key={k} className="whitespace-pre-wrap">{v}</span>])} />
          {parsed.kind === "vcard" ? (
            <DownloadButton text={text} filename="contact.vcf" mime="text/vcard;charset=utf-8" label="Save as .vcf" size="sm" variant="secondary" />
          ) : null}
        </div>
      );
      break;
    case "email": {
      const href = `mailto:${parsed.to}?subject=${encodeURIComponent(parsed.subject)}&body=${encodeURIComponent(parsed.body)}`;
      body = (
        <div className="space-y-2">
          <KeyValueTable rows={[["To", parsed.to], ["Subject", parsed.subject || "—"], ["Message", <span key="b" className="whitespace-pre-wrap">{parsed.body || "—"}</span>]]} />
          <a href={href} className="text-sm underline underline-offset-4">
            Open in mail app
          </a>
        </div>
      );
      break;
    }
    case "sms":
      body = (
        <div className="space-y-2">
          <KeyValueTable rows={[["Number", parsed.number], ["Message", <span key="b" className="whitespace-pre-wrap">{parsed.body || "—"}</span>]]} />
          <a href={`sms:${parsed.number}${parsed.body ? `?body=${encodeURIComponent(parsed.body)}` : ""}`} className="text-sm underline underline-offset-4">
            Open in messages
          </a>
        </div>
      );
      break;
    case "phone":
      body = (
        <a href={`tel:${parsed.number}`} className="font-mono text-sm underline underline-offset-4">
          {parsed.number}
        </a>
      );
      break;
    case "geo": {
      const { latitude: la, longitude: lo } = parsed;
      body = (
        <div className="space-y-2">
          <KeyValueTable
            rows={[
              ["Latitude", String(la)],
              ["Longitude", String(lo)],
              ...(parsed.altitude != null ? ([["Altitude", `${parsed.altitude} m`]] as [string, string][]) : []),
              ...(parsed.query ? ([["Label", parsed.query]] as [string, string][]) : []),
            ]}
          />
          <ExtLink href={`https://www.openstreetmap.org/?mlat=${la}&mlon=${lo}#map=17/${la}/${lo}`}>Open in OpenStreetMap</ExtLink>
        </div>
      );
      break;
    }
    default:
      body = null;
  }

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          Result <Badge>{payloadKindLabel[parsed.kind]}</Badge>
          {format ? <Badge>{format}</Badge> : null}
        </span>
      }
      actions={<CopyButton text={text} />}
    >
      <div className="space-y-4">
        {body}
        {extra}
        <div>
          <p className="mb-1 text-xs text-fg-subtle">Raw content</p>
          <pre
            data-testid="output"
            className="max-h-56 overflow-auto rounded-lg border border-border bg-bg-subtle px-3 py-2 font-mono text-[13px] break-all whitespace-pre-wrap text-fg"
          >
            {text}
          </pre>
        </div>
      </div>
    </Panel>
  );
}
