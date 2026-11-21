"use client";

import { useEffect, useMemo, useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Alert, Badge } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { ActionBar, CopyButton, ErrorMessage, Panel } from "@/components/tools/shared";
import { decodeJwt, describeClaims, humanDuration, timeStatus, verifyJwt, type SecretEncoding } from "@/lib/processors/developer/jwt";
import { errorMessage } from "@/lib/utils/hooks";

const SAMPLE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

export default function JwtDecoder(_props: ToolComponentProps) {
  const [token, setToken] = useState("");
  const [now, setNow] = useState(() => Date.now() / 1000);
  const [key, setKey] = useState("");
  const [enc, setEnc] = useState<SecretEncoding>("utf8");
  const [verify, setVerify] = useState<{ ok: boolean; msg: string } | null>(null);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(t);
  }, []);

  const decoded = useMemo(() => {
    const t = token.trim().replace(/^Bearer\s+/i, "");
    if (!t) return null;
    try {
      return { ok: true as const, d: decodeJwt(t), raw: t };
    } catch (e) {
      return { ok: false as const, error: errorMessage(e) };
    }
  }, [token]);

  const status = decoded?.ok ? timeStatus(decoded.d.payload, now) : null;
  const claims = decoded?.ok ? describeClaims(decoded.d.payload, now) : [];
  const exp = decoded?.ok ? (decoded.d.payload as { exp?: number })?.exp : undefined;
  const isHmac = decoded?.ok && decoded.d.alg?.startsWith("HS");

  return (
    <div className="space-y-4">
      <Panel title="Encoded token" actions={<Button size="sm" variant="ghost" onClick={() => setToken(SAMPLE)}>Sample</Button>}>
        <Textarea
          value={token}
          onChange={(e) => {
            setToken(e.target.value);
            setVerify(null);
          }}
          placeholder="Paste a JWT (header.payload.signature) – a leading “Bearer ” is ignored"
          aria-label="JWT"
          data-testid="input"
          className="min-h-[120px] break-all"
        />
      </Panel>

      {decoded && !decoded.ok ? <ErrorMessage error={decoded.error} /> : null}

      {decoded?.ok ? (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge>alg: {decoded.d.alg ?? "none"}</Badge>
            {status === "valid" ? <Badge className="text-success">Active{exp ? ` · expires in ${humanDuration(exp - now)}` : ""}</Badge> : null}
            {status === "expired" ? <Badge className="text-danger">Expired {exp ? `${humanDuration(now - exp)} ago` : ""}</Badge> : null}
            {status === "not-yet-valid" ? <Badge className="text-warning">Not yet valid (nbf in the future)</Badge> : null}
            {status === "no-exp" ? <Badge>No expiry (exp) claim</Badge> : null}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Header" actions={<CopyButton text={JSON.stringify(decoded.d.header, null, 2)} />}>
              <pre className="overflow-x-auto font-mono text-[13px] text-fg">{JSON.stringify(decoded.d.header, null, 2)}</pre>
            </Panel>
            <Panel title="Payload" actions={<CopyButton text={decoded.d.payloadText} />}>
              <pre data-testid="output" className="overflow-x-auto font-mono text-[13px] text-fg">
                {typeof decoded.d.payload === "string" ? decoded.d.payload : JSON.stringify(decoded.d.payload, null, 2)}
              </pre>
            </Panel>
          </div>
          {claims.length ? (
            <Panel title="Registered claims">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-border">
                    {claims.map((c) => (
                      <tr key={c.claim}>
                        <th className="w-28 py-2 pr-3 text-left font-mono font-medium text-fg">{c.claim}</th>
                        <td className="py-2 pr-3 text-fg-muted">{c.label}</td>
                        <td className="py-2 font-mono text-[13px] break-all text-fg">
                          {c.date ?? String(typeof c.value === "object" ? JSON.stringify(c.value) : c.value)}
                          {c.note ? <span className="ml-2 text-fg-subtle">({c.note})</span> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          ) : null}
          <Panel title="Verify signature (optional)">
            <div className="space-y-3">
              {isHmac ? (
                <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
                  <Field label="Shared secret">{(id) => <Input id={id} value={key} onChange={(e) => setKey(e.target.value)} type="password" autoComplete="off" />}</Field>
                  <Field label="Secret encoding">
                    {(id) => (
                      <Select id={id} value={enc} onChange={(e) => setEnc(e.target.value as SecretEncoding)}>
                        <option value="utf8">UTF-8 text</option>
                        <option value="base64">Base64</option>
                        <option value="base64url">Base64URL</option>
                      </Select>
                    )}
                  </Field>
                </div>
              ) : (
                <Field label="Public key (SPKI PEM or JWK)">
                  {(id) => <Textarea id={id} value={key} onChange={(e) => setKey(e.target.value)} className="min-h-[110px]" placeholder="-----BEGIN PUBLIC KEY-----" />}
                </Field>
              )}
              <Button
                variant="secondary"
                loading={verifying}
                disabled={!key}
                onClick={async () => {
                  setVerifying(true);
                  try {
                    const ok = await verifyJwt(decoded.raw, key, enc);
                    setVerify({ ok, msg: ok ? "Signature is valid for this key." : "Signature does NOT match this key." });
                  } catch (e) {
                    setVerify({ ok: false, msg: errorMessage(e) });
                  } finally {
                    setVerifying(false);
                  }
                }}
              >
                Verify
              </Button>
              {verify ? <Alert tone={verify.ok ? "success" : "danger"}>{verify.msg}</Alert> : null}
              <p className="text-xs text-fg-subtle">Verification uses the Web Crypto API in your browser. Keys and tokens are never sent anywhere.</p>
            </div>
          </Panel>
        </>
      ) : null}
      <ActionBar
        onReset={() => {
          setToken("");
          setKey("");
          setVerify(null);
        }}
      />
    </div>
  );
}
