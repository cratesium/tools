"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { ActionBar, ErrorMessage, Panel, TextOutput } from "@/components/tools/shared";
import { JWT_ALGS, parseJsonObject, signJwt, type JwtAlg, type SecretEncoding } from "@/lib/processors/developer/jwt";
import { useTask } from "@/lib/utils/hooks";

const nowSec = () => Math.floor(Date.now() / 1000);
const DEFAULT_PAYLOAD = () => JSON.stringify({ sub: "user_123", name: "Ana", role: "admin", iat: nowSec(), exp: nowSec() + 3600 }, null, 2);

function randomSecret() {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export default function JwtGenerator(_props: ToolComponentProps) {
  const [alg, setAlg] = useState<JwtAlg>("HS256");
  const [header, setHeader] = useState('{\n  "typ": "JWT"\n}');
  const [payload, setPayload] = useState(DEFAULT_PAYLOAD);
  const [key, setKey] = useState("");
  const [enc, setEnc] = useState<SecretEncoding>("utf8");
  const task = useTask<string>();
  const hmac = alg.startsWith("HS");

  const setClaim = (claim: "iat" | "exp" | "nbf", value: number | null) => {
    try {
      const p = parseJsonObject(payload, "Payload");
      if (value == null) delete p[claim];
      else p[claim] = value;
      setPayload(JSON.stringify(p, null, 2));
    } catch (e) {
      task.setError((e as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Header">
          <Field label="Algorithm" className="mb-3">
            {(id) => (
              <Select id={id} value={alg} onChange={(e) => setAlg(e.target.value as JwtAlg)}>
                {JWT_ALGS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                    {a.startsWith("HS") ? " (HMAC secret)" : a.startsWith("ES") ? " (ECDSA key)" : " (RSA key)"}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Textarea value={header} onChange={(e) => setHeader(e.target.value)} aria-label="Header JSON" className="min-h-[120px]" />
          <p className="mt-2 text-xs text-fg-subtle">The alg field is set automatically from the selection.</p>
        </Panel>
        <Panel title="Payload">
          <Textarea value={payload} onChange={(e) => setPayload(e.target.value)} aria-label="Payload JSON" data-testid="input" className="min-h-[200px]" />
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Button size="sm" variant="secondary" onClick={() => setClaim("iat", nowSec())}>iat = now</Button>
            <Button size="sm" variant="secondary" onClick={() => setClaim("exp", nowSec() + 3600)}>exp = +1 h</Button>
            <Button size="sm" variant="secondary" onClick={() => setClaim("exp", nowSec() + 86400)}>exp = +1 day</Button>
            <Button size="sm" variant="secondary" onClick={() => setClaim("exp", nowSec() + 30 * 86400)}>exp = +30 days</Button>
            <Button size="sm" variant="ghost" onClick={() => setClaim("exp", null)}>Remove exp</Button>
          </div>
        </Panel>
      </div>
      <Panel title={hmac ? "Secret" : "Private key"}>
        {hmac ? (
          <div className="grid gap-3 sm:grid-cols-[1fr_180px_auto] sm:items-end">
            <Field label="Shared secret" hint="Use at least 32 random bytes for HS256">
              {(id) => <Input id={id} value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" spellCheck={false} />}
            </Field>
            <Field label="Encoding">
              {(id) => (
                <Select id={id} value={enc} onChange={(e) => setEnc(e.target.value as SecretEncoding)}>
                  <option value="utf8">UTF-8 text</option>
                  <option value="base64">Base64</option>
                  <option value="base64url">Base64URL</option>
                </Select>
              )}
            </Field>
            <Button
              variant="secondary"
              onClick={() => {
                setKey(randomSecret());
                setEnc("base64url");
              }}
            >
              Generate secret
            </Button>
          </div>
        ) : (
          <Field label="PKCS#8 private key (PEM) or private JWK" hint="Generate one with the RSA Key Pair Generator">
            {(id) => <Textarea id={id} value={key} onChange={(e) => setKey(e.target.value)} placeholder="-----BEGIN PRIVATE KEY-----" className="min-h-[140px]" />}
          </Field>
        )}
      </Panel>
      <ErrorMessage error={task.error} />
      {task.result && task.status === "done" ? (
        <>
          <TextOutput value={task.result} filename="token.jwt" label="Signed token" rows={4} />
          <Alert tone="info">Anyone can read a JWT payload – it is signed, not encrypted. Do not put secrets in it.</Alert>
        </>
      ) : null}
      <ActionBar
        runLabel="Sign token"
        running={task.running}
        disabled={!key}
        onRun={() =>
          task.run(async () => signJwt({ alg, header: parseJsonObject(header, "Header"), payload: parseJsonObject(payload, "Payload"), key, secretEncoding: enc }))
        }
        onReset={() => {
          task.reset();
          setHeader('{\n  "typ": "JWT"\n}');
          setPayload(DEFAULT_PAYLOAD());
          setKey("");
          setAlg("HS256");
        }}
      />
    </div>
  );
}
