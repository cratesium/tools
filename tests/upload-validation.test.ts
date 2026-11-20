import { describe, expect, it } from "vitest";
import { matchesAccept, validateFiles } from "@/components/upload/dropzone";
import { formatBytes, replaceExtension, extensionOf, formatDuration } from "@/lib/utils/format";

const f = (name: string, type: string, size = 10) => new File([new Uint8Array(size)], name, { type });

describe("file input validation", () => {
  it("matches extensions, wildcards and exact MIME types", () => {
    expect(matchesAccept(f("a.PDF", ""), ".pdf")).toBe(true);
    expect(matchesAccept(f("a.png", "image/png"), "image/*")).toBe(true);
    expect(matchesAccept(f("a.txt", "text/plain"), "image/*,.pdf")).toBe(false);
    expect(matchesAccept(f("a.json", "application/json"), "application/json")).toBe(true);
    expect(matchesAccept(f("anything.bin", ""), undefined)).toBe(true);
  });
  it("rejects wrong types, oversize and empty files with messages", () => {
    const { valid, errors } = validateFiles(
      [f("ok.pdf", "application/pdf"), f("bad.txt", "text/plain"), f("big.pdf", "application/pdf", 2048), f("empty.pdf", "application/pdf", 0)],
      { accept: ".pdf", maxSize: 1024, multiple: true },
    );
    expect(valid.map((v) => v.name)).toEqual(["ok.pdf"]);
    expect(errors).toHaveLength(3);
    expect(errors.join(" ")).toMatch(/not a supported file type/);
    expect(errors.join(" ")).toMatch(/above the 1.0 KB limit/);
    expect(errors.join(" ")).toMatch(/empty/);
  });
  it("keeps only the first file when multiple is false", () => {
    const { valid } = validateFiles([f("a.pdf", ""), f("b.pdf", "")], { accept: ".pdf" });
    expect(valid).toHaveLength(1);
  });
});

describe("format utils", () => {
  it("formats bytes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });
  it("handles file names", () => {
    expect(replaceExtension("photo.final.jpg", "png")).toBe("photo.final.png");
    expect(replaceExtension("README", ".md")).toBe("README.md");
    expect(extensionOf("Archive.TAR.GZ")).toBe("gz");
    expect(extensionOf(".bashrc")).toBe("");
  });
  it("formats durations", () => {
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(3725)).toBe("1:02:05");
  });
});
