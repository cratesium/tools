"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import type { OpenedArchive } from "@/lib/processors/archive/reader";
import type { TaskContext } from "@/lib/utils/hooks";

export const ARCHIVE_ACCEPT: Record<string, string> = {
  zip: ".zip,.jar,.apk,.docx,.xlsx,.pptx,.epub,.odt,application/zip",
  rar: ".rar,application/vnd.rar",
  "7z": ".7z,application/x-7z-compressed",
  tar: ".tar,application/x-tar",
  gzip: ".gz,.tgz,.tar.gz,application/gzip",
  auto: "",
};

/** Opens any supported archive, loading libarchive (WASM, in a worker) only when needed. */
export async function openAny(file: File, password?: string): Promise<OpenedArchive> {
  const [{ openArchive }, { loadLibarchive }] = await Promise.all([import("@/lib/processors/archive/reader"), import("@/lib/processors/archive/libarchive")]);
  return openArchive(file, { password: password || undefined, libarchive: loadLibarchive });
}

export function isPasswordError(e: unknown): "required" | "wrong" | null {
  const name = (e as Error)?.name ?? "";
  const ctor = (e as object)?.constructor?.name ?? "";
  if (name === "PasswordRequiredError" || ctor === "PasswordRequiredError") return "required";
  if (name === "WrongPasswordError" || ctor === "WrongPasswordError") return "wrong";
  return null;
}

export interface Extracted {
  path: string;
  data: Uint8Array;
  mtime?: number;
}

/** Reads every file entry, skipping unsafe ("zip slip") paths, with real per-entry progress. */
export async function extractAll(arch: OpenedArchive, ctx?: TaskContext): Promise<{ files: Extracted[]; skipped: string[] }> {
  const { isSafePath } = await import("@/lib/processors/archive/reader");
  const items = arch.items.filter((i) => !i.directory);
  const total = items.reduce((s, i) => s + (i.size || 0), 0) || items.length || 1;
  let done = 0;
  const files: Extracted[] = [];
  const skipped: string[] = [];
  for (const it of items) {
    if (ctx?.signal.aborted) throw new DOMException("Cancelled", "AbortError");
    if (!isSafePath(it.path)) {
      skipped.push(it.path);
      continue;
    }
    files.push({ path: it.path, data: await it.read(), mtime: it.mtime });
    done += it.size || 1;
    ctx?.progress(Math.min(1, done / total), `Extracting ${it.path}`);
  }
  return { files, skipped };
}

export function PasswordPrompt({ wrong, onSubmit, busy }: { wrong?: boolean; onSubmit: (pw: string) => void; busy?: boolean }) {
  const [pw, setPw] = useState("");
  return (
    <Alert tone={wrong ? "danger" : "warning"} title={wrong ? "Wrong password – try again" : "This archive is password-protected"}>
      <form
        className="mt-2 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (pw) onSubmit(pw);
        }}
      >
        <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Archive password" aria-label="Archive password" autoComplete="off" className="w-64 bg-card" />
        <Button type="submit" loading={busy} icon={<KeyRound className="h-4 w-4" />} disabled={!pw}>
          Unlock
        </Button>
      </form>
      <p className="mt-2 text-xs opacity-80">The password is used only in your browser to decrypt the entries. UtilityHub cannot recover unknown passwords.</p>
    </Alert>
  );
}

export function mimeFor(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", avif: "image/avif",
    txt: "text/plain", md: "text/plain", csv: "text/plain", json: "text/plain", xml: "text/plain", html: "text/plain", css: "text/plain", js: "text/plain",
    ts: "text/plain", yml: "text/plain", yaml: "text/plain", log: "text/plain", ini: "text/plain", toml: "text/plain", py: "text/plain", sh: "text/plain",
    pdf: "application/pdf", mp3: "audio/mpeg", wav: "audio/wav", mp4: "video/mp4", webm: "video/webm",
  };
  return map[ext] ?? "application/octet-stream";
}
