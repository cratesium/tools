"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Field, Segmented, Select } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { ActionBar, ErrorMessage, KeyValueTable, Panel, TaskProgress, TextOutput } from "@/components/tools/shared";
import { generateRsaKeyPair, type RsaAlgorithm, type RsaBits, type RsaHash, type RsaKeyPairResult } from "@/lib/processors/security/rsa";
import { useTask } from "@/lib/utils/hooks";

export default function RsaGenerator(_props: ToolComponentProps) {
  const [alg, setAlg] = useState<RsaAlgorithm>("RSASSA-PKCS1-v1_5");
  const [bits, setBits] = useState<RsaBits>(2048);
  const [hash, setHash] = useState<RsaHash>("SHA-256");
  const [format, setFormat] = useState<"pem" | "jwk">("pem");
  const task = useTask<RsaKeyPairResult>();
  const r = task.result;

  return (
    <div className="space-y-4">
      <Panel title="Key settings">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Algorithm">
            {(id) => (
              <Select id={id} value={alg} onChange={(e) => setAlg(e.target.value as RsaAlgorithm)}>
                <option value="RSASSA-PKCS1-v1_5">RSASSA-PKCS1-v1_5 (RS256 signatures)</option>
                <option value="RSA-PSS">RSA-PSS (PS256 signatures)</option>
                <option value="RSA-OAEP">RSA-OAEP (encryption)</option>
              </Select>
            )}
          </Field>
          <Field label="Key size">
            {(id) => (
              <Select id={id} value={bits} onChange={(e) => setBits(Number(e.target.value) as RsaBits)}>
                <option value={2048}>2048 bits</option>
                <option value={3072}>3072 bits</option>
                <option value={4096}>4096 bits (slow)</option>
              </Select>
            )}
          </Field>
          <Field label="Hash">
            {(id) => (
              <Select id={id} value={hash} onChange={(e) => setHash(e.target.value as RsaHash)}>
                <option value="SHA-256">SHA-256</option>
                <option value="SHA-384">SHA-384</option>
                <option value="SHA-512">SHA-512</option>
              </Select>
            )}
          </Field>
        </div>
      </Panel>
      <ActionBar onRun={() => task.run(async (ctx) => (ctx.progress(null, `Generating ${bits}-bit key pair…`), generateRsaKeyPair(alg, bits, hash)))} runLabel="Generate key pair" running={task.running} onReset={task.reset} />
      <TaskProgress running={task.running} progress={task.progress} label={task.progressLabel} />
      <ErrorMessage error={task.error} />
      {r ? (
        <>
          <Segmented label="Format" value={format} onChange={setFormat} options={[{ value: "pem", label: "PEM (SPKI / PKCS#8)" }, { value: "jwk", label: "JWK" }]} />
          <div className="grid gap-4 lg:grid-cols-2">
            <TextOutput label="Public key" value={format === "pem" ? r.publicPem : JSON.stringify(r.publicJwk, null, 2)} filename={format === "pem" ? "public.pem" : "public.jwk.json"} rows={10} />
            <TextOutput label="Private key – keep secret" value={format === "pem" ? r.privatePem : JSON.stringify(r.privateJwk, null, 2)} filename={format === "pem" ? "private.pem" : "private.jwk.json"} rows={10} />
          </div>
          <Panel title="Key details">
            <KeyValueTable rows={[["Algorithm", r.algorithm], ["Size", `${r.bits} bits`], ["Hash", r.hash], ["SPKI SHA-256 fingerprint", r.fingerprint]]} />
          </Panel>
          <Alert tone="warning" title="Store the private key safely">
            Keys are generated in your browser with the Web Crypto API and are never transmitted. Download them now – they are discarded when you reset or leave the page. The private key PEM is unencrypted PKCS#8.
          </Alert>
        </>
      ) : null}
    </div>
  );
}
