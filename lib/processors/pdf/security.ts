/** Password protection (encryption) and unlocking (decryption with the known password). */
import { loadPdf, savePdf } from "./load";

export interface Permissions {
  printing: "none" | "low" | "high";
  modifying: boolean;
  copying: boolean;
  annotating: boolean;
  fillingForms: boolean;
  contentAccessibility: boolean;
  documentAssembly: boolean;
}

export const ALL_PERMISSIONS: Permissions = {
  printing: "high",
  modifying: true,
  copying: true,
  annotating: true,
  fillingForms: true,
  contentAccessibility: true,
  documentAssembly: true,
};

export interface ProtectOptions {
  userPassword: string;
  /** Owner (permissions) password. Defaults to a random 32-character secret. */
  ownerPassword?: string;
  permissions?: Permissions;
  algorithm?: "AES-256" | "AES-128";
  /** Password of the input file, if it is already encrypted. */
  inputPassword?: string;
}

export function randomSecret(length = 32): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const buf = new Uint32Array(length);
  crypto.getRandomValues(buf);
  return Array.from(buf, (v) => chars[v % chars.length]).join("");
}

export async function protectPdf(bytes: Uint8Array, opts: ProtectOptions): Promise<{ bytes: Uint8Array; ownerPassword: string }> {
  if (!opts.userPassword && !opts.ownerPassword) throw new Error("Enter a password.");
  const doc = await loadPdf(bytes, { password: opts.inputPassword });
  const p = opts.permissions ?? ALL_PERMISSIONS;
  const ownerPassword = opts.ownerPassword || randomSecret();
  doc.encrypt({
    userPassword: opts.userPassword,
    ownerPassword,
    algorithm: opts.algorithm ?? "AES-256",
    permissions: {
      printing: p.printing === "none" ? false : p.printing === "low" ? "lowResolution" : "highResolution",
      modifying: p.modifying,
      copying: p.copying,
      annotating: p.annotating,
      fillingForms: p.fillingForms,
      contentAccessibility: p.contentAccessibility,
      documentAssembly: p.documentAssembly,
    },
  });
  return { bytes: await savePdf(doc, { objectStreams: false }), ownerPassword };
}

/** True when the raw file declares an /Encrypt dictionary in a trailer. */
export function looksEncrypted(bytes: Uint8Array): boolean {
  const tail = new TextDecoder("latin1").decode(bytes.length > 65536 ? bytes.subarray(bytes.length - 65536) : bytes);
  if (/\/Encrypt\s+\d+\s+\d+\s+R/.test(tail)) return true;
  return /\/Encrypt\s*(\d+\s+\d+\s+R|<<)/.test(new TextDecoder("latin1").decode(bytes.subarray(0, Math.min(bytes.length, 4096))));
}

/**
 * Removes encryption. Needs the open password when one is set; files restricted only by an
 * owner password open without it. Does not guess or crack passwords.
 */
export async function unlockPdf(bytes: Uint8Array, password?: string): Promise<Uint8Array> {
  const doc = await loadPdf(bytes, { password });
  return savePdf(doc);
}
