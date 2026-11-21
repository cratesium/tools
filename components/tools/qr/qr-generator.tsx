"use client";

import { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, LocateFixed } from "lucide-react";
import type { ToolComponentProps } from "@/types/tool";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Segmented, Select, Textarea } from "@/components/ui/field";
import { Alert, Badge } from "@/components/ui/feedback";
import { ActionBar, CopyButton, DownloadButton, ErrorMessage, Panel } from "@/components/tools/shared";
import {
  buildEmail,
  buildGeo,
  buildMecard,
  buildPhone,
  buildSms,
  buildText,
  buildUrl,
  buildVcard,
  buildWifi,
  parseLatLng,
  type BuildResult,
  type ContactFields,
  type QrContentType,
  type WifiEncryption,
} from "@/lib/processors/qr/payload";
import { canvasToBlob, renderQrSvg, renderQrToCanvas } from "@/lib/processors/qr/render";
import { useDebounced, useObjectUrl, errorMessage } from "@/lib/utils/hooks";
import { defaultQrStyle, isHexColor, QrStyleSettings, type QrStyle } from "./qr-options";

const TYPES: { value: QrContentType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "url", label: "URL" },
  { value: "wifi", label: "Wi-Fi" },
  { value: "vcard", label: "Contact" },
  { value: "email", label: "Email" },
  { value: "sms", label: "SMS" },
  { value: "phone", label: "Phone" },
  { value: "geo", label: "Location" },
];

interface FormState {
  text: string;
  url: string;
  wifi: { ssid: string; password: string; encryption: WifiEncryption; hidden: boolean };
  contact: ContactFields & { format: "vcard" | "mecard" };
  email: { to: string; subject: string; body: string };
  sms: { number: string; message: string; format: "smsto" | "sms" };
  phone: string;
  geo: { latitude: string; longitude: string };
}

const emptyForm = (): FormState => ({
  text: "",
  url: "",
  wifi: { ssid: "", password: "", encryption: "WPA", hidden: false },
  contact: { format: "vcard" },
  email: { to: "", subject: "", body: "" },
  sms: { number: "", message: "", format: "smsto" },
  phone: "",
  geo: { latitude: "", longitude: "" },
});

function build(type: QrContentType, f: FormState): BuildResult {
  switch (type) {
    case "url":
      return buildUrl(f.url);
    case "wifi":
      return buildWifi(f.wifi);
    case "vcard":
      return f.contact.format === "mecard" ? buildMecard(f.contact) : buildVcard(f.contact);
    case "email":
      return buildEmail(f.email);
    case "sms":
      return buildSms(f.sms);
    case "phone":
      return buildPhone(f.phone);
    case "geo":
      return buildGeo(f.geo);
    default:
      return buildText(f.text);
  }
}

function isEmpty(type: QrContentType, f: FormState): boolean {
  switch (type) {
    case "url":
      return !f.url.trim();
    case "wifi":
      return !f.wifi.ssid;
    case "vcard": {
      const { format: _format, ...rest } = f.contact;
      void _format;
      return !Object.values(rest).some((v) => v && String(v).trim());
    }
    case "email":
      return !f.email.to.trim();
    case "sms":
      return !f.sms.number.trim();
    case "phone":
      return !f.phone.trim();
    case "geo":
      return !f.geo.latitude.trim() && !f.geo.longitude.trim();
    default:
      return !f.text;
  }
}

interface Rendered {
  png: Blob;
  svg: Blob;
  modules: number;
}

/**
 * Shared QR generator. processorOptions.type selects the content preset
 * (text, url, wifi, vcard, email, sms, phone, geo); the plain generator lets the user switch.
 */
export default function QrGenerator({ tool }: ToolComponentProps) {
  const preset = (tool.processorOptions?.type as QrContentType | undefined) ?? "text";
  const switchable = tool.processorOptions?.switchable === true;
  const [type, setType] = useState<QrContentType>(preset);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [style, setStyle] = useState<QrStyle>(defaultQrStyle);
  const [rendered, setRendered] = useState<Rendered | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [showPw, setShowPw] = useState(false);
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const built = useMemo(() => build(type, form), [type, form]);
  const empty = isEmpty(type, form);
  const payload = built.ok ? built.payload : "";
  const debouncedPayload = useDebounced(payload, 150);
  const debouncedStyle = useDebounced(style, 150);
  const renderable = !!debouncedPayload && isHexColor(debouncedStyle.foreground) && isHexColor(debouncedStyle.background);
  const shown = renderable && !empty && built.ok ? rendered : null;
  const shownError = renderable ? renderError : null;
  const previewUrl = useObjectUrl(shown?.png);

  useEffect(() => {
    let alive = true;
    if (!renderable) return;
    (async () => {
      try {
        const canvas = document.createElement("canvas");
        const modules = await renderQrToCanvas(canvas, debouncedPayload, debouncedStyle);
        const png = await canvasToBlob(canvas);
        const svgText = await renderQrSvg(debouncedPayload, debouncedStyle);
        if (!alive) return;
        setRendered({ png, svg: new Blob([svgText], { type: "image/svg+xml" }), modules });
        setRenderError(null);
      } catch (e) {
        if (!alive) return;
        setRendered(null);
        setRenderError(errorMessage(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, [renderable, debouncedPayload, debouncedStyle]);

  const reset = () => {
    setForm(emptyForm());
    setStyle(defaultQrStyle);
    setType(preset);
    setRendered(null);
    setRenderError(null);
    setGeoError(null);
  };

  const upd = <K extends keyof FormState>(k: K, v: Partial<FormState[K]> | FormState[K]) =>
    setForm((f) => ({ ...f, [k]: typeof v === "object" && v !== null ? { ...(f[k] as object), ...v } : v }));

  const locate = () => {
    if (!("geolocation" in navigator)) {
      setGeoError("Geolocation is not available in this browser.");
      return;
    }
    setGeoBusy(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoBusy(false);
        upd("geo", { latitude: pos.coords.latitude.toFixed(6), longitude: pos.coords.longitude.toFixed(6) });
      },
      (err) => {
        setGeoBusy(false);
        setGeoError(err.code === err.PERMISSION_DENIED ? "Location permission was denied." : "Could not get your location.");
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  const c = form.contact;
  const contactInput = (key: keyof ContactFields, label: string, props: Record<string, string> = {}) => (
    <Field label={label}>
      {(id) => <Input id={id} value={c[key] ?? ""} onChange={(e) => upd("contact", { [key]: e.target.value })} {...props} />}
    </Field>
  );

  return (
    <div className="space-y-4">
      {switchable ? (
        <Segmented label="Content type" value={type} onChange={setType} options={TYPES} />
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <Panel title="Content">
            {type === "text" ? (
              <Textarea
                value={form.text}
                onChange={(e) => upd("text", e.target.value)}
                placeholder="Type any text, a link, or a code…"
                aria-label="QR content"
                data-testid="input"
                className="min-h-[140px]"
              />
            ) : null}

            {type === "url" ? (
              <Field label="Website URL" hint="https:// is added if missing">
                {(id) => (
                  <Input
                    id={id}
                    value={form.url}
                    onChange={(e) => upd("url", e.target.value)}
                    placeholder="example.com/page"
                    inputMode="url"
                    data-testid="input"
                  />
                )}
              </Field>
            ) : null}

            {type === "wifi" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Network name (SSID)">
                  {(id) => (
                    <Input id={id} value={form.wifi.ssid} onChange={(e) => upd("wifi", { ssid: e.target.value })} data-testid="input" autoComplete="off" />
                  )}
                </Field>
                <Field label="Security">
                  {(id) => (
                    <Select id={id} value={form.wifi.encryption} onChange={(e) => upd("wifi", { encryption: e.target.value as WifiEncryption })}>
                      <option value="WPA">WPA / WPA2 / WPA3</option>
                      <option value="WEP">WEP (legacy)</option>
                      <option value="nopass">No password (open)</option>
                    </Select>
                  )}
                </Field>
                {form.wifi.encryption !== "nopass" ? (
                  <Field label="Password">
                    {(id) => (
                      <div className="flex gap-2">
                        <Input
                          id={id}
                          type={showPw ? "text" : "password"}
                          value={form.wifi.password}
                          onChange={(e) => upd("wifi", { password: e.target.value })}
                          autoComplete="off"
                        />
                        <Button
                          variant="secondary"
                          size="icon"
                          aria-label={showPw ? "Hide password" : "Show password"}
                          onClick={() => setShowPw((s) => !s)}
                          icon={showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        />
                      </div>
                    )}
                  </Field>
                ) : null}
                <div className="flex items-end pb-2">
                  <Checkbox label="Hidden network" checked={form.wifi.hidden} onChange={(v) => upd("wifi", { hidden: v })} />
                </div>
              </div>
            ) : null}

            {type === "vcard" ? (
              <div className="space-y-4">
                <Segmented
                  label="Contact format"
                  value={c.format}
                  onChange={(v) => upd("contact", { format: v })}
                  options={[
                    { value: "vcard", label: "vCard 3.0" },
                    { value: "mecard", label: "MECARD (smaller)" },
                  ]}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  {contactInput("firstName", "First name", { "data-testid": "input" })}
                  {contactInput("lastName", "Last name")}
                  {contactInput("organization", "Organisation")}
                  {c.format === "vcard" ? contactInput("title", "Job title") : null}
                  {contactInput("phone", "Mobile phone", { inputMode: "tel" })}
                  {contactInput("workPhone", "Work phone", { inputMode: "tel" })}
                  {contactInput("email", "Email", { inputMode: "email" })}
                  {contactInput("website", "Website", { inputMode: "url" })}
                  {contactInput("street", "Street")}
                  {contactInput("city", "City")}
                  {contactInput("region", "State / region")}
                  {contactInput("postcode", "Postcode")}
                  {contactInput("country", "Country")}
                  {contactInput("note", "Note")}
                </div>
              </div>
            ) : null}

            {type === "email" ? (
              <div className="space-y-4">
                <Field label="To" hint="Separate several with commas">
                  {(id) => (
                    <Input id={id} value={form.email.to} onChange={(e) => upd("email", { to: e.target.value })} inputMode="email" data-testid="input" />
                  )}
                </Field>
                <Field label="Subject">
                  {(id) => <Input id={id} value={form.email.subject} onChange={(e) => upd("email", { subject: e.target.value })} />}
                </Field>
                <Field label="Message">
                  {(id) => (
                    <Textarea id={id} value={form.email.body} onChange={(e) => upd("email", { body: e.target.value })} className="min-h-[100px] font-sans text-sm" />
                  )}
                </Field>
              </div>
            ) : null}

            {type === "sms" ? (
              <div className="space-y-4">
                <Field label="Phone number" hint="Include the country code, e.g. +91">
                  {(id) => (
                    <Input id={id} value={form.sms.number} onChange={(e) => upd("sms", { number: e.target.value })} inputMode="tel" data-testid="input" />
                  )}
                </Field>
                <Field label="Message" hint={`${form.sms.message.length} characters`}>
                  {(id) => (
                    <Textarea id={id} value={form.sms.message} onChange={(e) => upd("sms", { message: e.target.value })} className="min-h-[100px] font-sans text-sm" />
                  )}
                </Field>
                <div>
                  <p className="mb-1.5 text-[13px] font-medium text-fg">Encoding</p>
                  <Segmented
                    label="SMS format"
                    value={form.sms.format}
                    onChange={(v) => upd("sms", { format: v })}
                    options={[
                      { value: "smsto", label: "SMSTO: (widest support)" },
                      { value: "sms", label: "sms: URI" },
                    ]}
                  />
                </div>
              </div>
            ) : null}

            {type === "phone" ? (
              <Field label="Phone number" hint="Include the country code, e.g. +44">
                {(id) => <Input id={id} value={form.phone} onChange={(e) => upd("phone", e.target.value)} inputMode="tel" data-testid="input" />}
              </Field>
            ) : null}

            {type === "geo" ? (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Latitude" hint="−90 to 90">
                    {(id) => (
                      <Input
                        id={id}
                        value={form.geo.latitude}
                        inputMode="decimal"
                        data-testid="input"
                        placeholder="28.6139"
                        onChange={(e) => {
                          const pair = parseLatLng(e.target.value);
                          if (pair) upd("geo", { latitude: String(pair.lat), longitude: String(pair.lng) });
                          else upd("geo", { latitude: e.target.value });
                        }}
                      />
                    )}
                  </Field>
                  <Field label="Longitude" hint="−180 to 180">
                    {(id) => (
                      <Input id={id} value={form.geo.longitude} inputMode="decimal" placeholder="77.2090" onChange={(e) => upd("geo", { longitude: e.target.value })} />
                    )}
                  </Field>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button variant="secondary" size="sm" loading={geoBusy} onClick={locate} icon={<LocateFixed className="h-3.5 w-3.5" />}>
                    Use my location
                  </Button>
                  <span className="text-xs text-fg-subtle">Tip: paste “lat, lng” from a map into the latitude box to fill both.</span>
                </div>
                {geoError ? <Alert tone="warning">{geoError}</Alert> : null}
              </div>
            ) : null}
          </Panel>

          <Panel title="Appearance">
            <QrStyleSettings value={style} onChange={setStyle} />
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel
            title="Preview"
            actions={shown ? <Badge>{`${shown.modules}×${shown.modules} modules`}</Badge> : null}
          >
            <div className="space-y-3">
              <div className="flex aspect-square items-center justify-center rounded-lg border border-border bg-bg-subtle">
                {previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previewUrl} alt="Generated QR code" data-testid="output" className="h-full w-full object-contain p-2" />
                ) : (
                  <p className="px-6 text-center text-sm text-fg-subtle">
                    {empty ? "Fill in the content to see your QR code." : "Fix the highlighted problem to update the preview."}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <DownloadButton blob={shown?.png} filename={`qr-${type}.png`} label="PNG" />
                <DownloadButton blob={shown?.svg} filename={`qr-${type}.svg`} label="SVG" variant="secondary" />
              </div>
            </div>
          </Panel>
          {!empty && !built.ok ? <ErrorMessage error={built.error} /> : null}
          <ErrorMessage error={shownError} />
          {payload ? (
            <Panel title="Encoded data" actions={<CopyButton text={payload} />}>
              <pre className="max-h-48 overflow-auto font-mono text-xs break-all whitespace-pre-wrap text-fg-muted">{payload}</pre>
              <p className="mt-2 text-xs text-fg-subtle">{new TextEncoder().encode(payload).length} bytes</p>
            </Panel>
          ) : null}
        </div>
      </div>
      <ActionBar onReset={reset} />
    </div>
  );
}
