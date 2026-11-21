/**
 * Magic-byte file type detection. Reads only the first few KB of a file.
 * Container formats (ZIP/OLE/RIFF/ISO-BMFF) are refined by looking inside the header.
 */

export interface FileTypeInfo {
  /** Canonical extension without dot, e.g. "png". */
  ext: string;
  mime: string;
  name: string;
  /** Other extensions that are legitimately the same format. */
  aliases?: string[];
}

interface Signature extends FileTypeInfo {
  bytes: (number | null)[]; // null = wildcard
  offset?: number;
}

const s = (str: string) => Array.from(str).map((c) => c.charCodeAt(0));

/** Ordered: more specific signatures first. */
export const SIGNATURES: Signature[] = [
  { ext: "png", mime: "image/png", name: "PNG image", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { ext: "jpg", mime: "image/jpeg", name: "JPEG image", aliases: ["jpeg", "jpe", "jfif"], bytes: [0xff, 0xd8, 0xff] },
  { ext: "gif", mime: "image/gif", name: "GIF image", bytes: s("GIF8") },
  { ext: "bmp", mime: "image/bmp", name: "BMP image", aliases: ["dib"], bytes: s("BM") },
  { ext: "tif", mime: "image/tiff", name: "TIFF image", aliases: ["tiff", "dng", "nef", "arw", "cr2"], bytes: [0x49, 0x49, 0x2a, 0x00] },
  { ext: "tif", mime: "image/tiff", name: "TIFF image (big-endian)", aliases: ["tiff"], bytes: [0x4d, 0x4d, 0x00, 0x2a] },
  { ext: "ico", mime: "image/x-icon", name: "Windows icon", bytes: [0x00, 0x00, 0x01, 0x00] },
  { ext: "cur", mime: "image/x-icon", name: "Windows cursor", bytes: [0x00, 0x00, 0x02, 0x00] },
  { ext: "psd", mime: "image/vnd.adobe.photoshop", name: "Photoshop document", bytes: s("8BPS") },
  { ext: "jxl", mime: "image/jxl", name: "JPEG XL image", bytes: [0xff, 0x0a] },
  { ext: "jxl", mime: "image/jxl", name: "JPEG XL image (container)", bytes: [0x00, 0x00, 0x00, 0x0c, 0x4a, 0x58, 0x4c, 0x20] },
  { ext: "pdf", mime: "application/pdf", name: "PDF document", bytes: s("%PDF-") },
  { ext: "ps", mime: "application/postscript", name: "PostScript", aliases: ["eps"], bytes: s("%!PS") },
  { ext: "rtf", mime: "application/rtf", name: "Rich Text Format", bytes: s("{\\rtf") },
  { ext: "zip", mime: "application/zip", name: "ZIP archive", bytes: [0x50, 0x4b, 0x03, 0x04] },
  { ext: "zip", mime: "application/zip", name: "ZIP archive (empty)", bytes: [0x50, 0x4b, 0x05, 0x06] },
  { ext: "zip", mime: "application/zip", name: "ZIP archive (spanned)", bytes: [0x50, 0x4b, 0x07, 0x08] },
  { ext: "rar", mime: "application/vnd.rar", name: "RAR archive (v5)", bytes: [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00] },
  { ext: "rar", mime: "application/vnd.rar", name: "RAR archive (v4)", bytes: [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00] },
  { ext: "7z", mime: "application/x-7z-compressed", name: "7-Zip archive", bytes: [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c] },
  { ext: "gz", mime: "application/gzip", name: "GZIP compressed", aliases: ["tgz", "gzip"], bytes: [0x1f, 0x8b, 0x08] },
  { ext: "bz2", mime: "application/x-bzip2", name: "BZIP2 compressed", aliases: ["tbz2", "tbz"], bytes: s("BZh") },
  { ext: "xz", mime: "application/x-xz", name: "XZ compressed", aliases: ["txz"], bytes: [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00] },
  { ext: "zst", mime: "application/zstd", name: "Zstandard compressed", bytes: [0x28, 0xb5, 0x2f, 0xfd] },
  { ext: "lz4", mime: "application/x-lz4", name: "LZ4 frame", bytes: [0x04, 0x22, 0x4d, 0x18] },
  { ext: "cab", mime: "application/vnd.ms-cab-compressed", name: "Microsoft Cabinet", bytes: s("MSCF") },
  { ext: "tar", mime: "application/x-tar", name: "TAR archive", bytes: s("ustar"), offset: 257 },
  { ext: "iso", mime: "application/x-iso9660-image", name: "ISO 9660 disc image", bytes: s("CD001"), offset: 0x8001 },
  { ext: "doc", mime: "application/msword", name: "Microsoft Office legacy (OLE2) document", aliases: ["xls", "ppt", "msg", "msi", "vsd"], bytes: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] },
  { ext: "exe", mime: "application/vnd.microsoft.portable-executable", name: "Windows executable / DLL", aliases: ["dll", "sys", "scr", "com", "ocx"], bytes: s("MZ") },
  { ext: "elf", mime: "application/x-elf", name: "ELF executable (Linux)", aliases: ["so", "o", "bin", ""], bytes: [0x7f, 0x45, 0x4c, 0x46] },
  { ext: "macho", mime: "application/x-mach-binary", name: "Mach-O binary (64-bit)", aliases: ["dylib", ""], bytes: [0xcf, 0xfa, 0xed, 0xfe] },
  { ext: "macho", mime: "application/x-mach-binary", name: "Mach-O binary (32-bit)", aliases: ["dylib", ""], bytes: [0xce, 0xfa, 0xed, 0xfe] },
  { ext: "macho", mime: "application/x-mach-binary", name: "Mach-O universal binary", aliases: ["dylib", "", "class"], bytes: [0xca, 0xfe, 0xba, 0xbe] },
  { ext: "wasm", mime: "application/wasm", name: "WebAssembly module", bytes: [0x00, 0x61, 0x73, 0x6d] },
  { ext: "dex", mime: "application/vnd.android.dex", name: "Android Dalvik executable", bytes: s("dex\n") },
  { ext: "sqlite", mime: "application/vnd.sqlite3", name: "SQLite database", aliases: ["db", "sqlite3", "db3"], bytes: s("SQLite format 3\0") },
  { ext: "mp3", mime: "audio/mpeg", name: "MP3 audio (ID3 tag)", bytes: s("ID3") },
  { ext: "mp3", mime: "audio/mpeg", name: "MP3 audio", bytes: [0xff, 0xfb] },
  { ext: "mp3", mime: "audio/mpeg", name: "MP3 audio", bytes: [0xff, 0xf3] },
  { ext: "mp3", mime: "audio/mpeg", name: "MP3 audio", bytes: [0xff, 0xf2] },
  { ext: "aac", mime: "audio/aac", name: "AAC audio (ADTS)", bytes: [0xff, 0xf1] },
  { ext: "aac", mime: "audio/aac", name: "AAC audio (ADTS)", bytes: [0xff, 0xf9] },
  { ext: "flac", mime: "audio/flac", name: "FLAC audio", bytes: s("fLaC") },
  { ext: "ogg", mime: "audio/ogg", name: "Ogg container", aliases: ["oga", "ogv", "opus", "ogx"], bytes: s("OggS") },
  { ext: "mid", mime: "audio/midi", name: "MIDI", aliases: ["midi"], bytes: s("MThd") },
  { ext: "amr", mime: "audio/amr", name: "AMR audio", bytes: s("#!AMR") },
  { ext: "mkv", mime: "video/x-matroska", name: "Matroska / WebM video", aliases: ["webm", "mka", "mk3d"], bytes: [0x1a, 0x45, 0xdf, 0xa3] },
  { ext: "flv", mime: "video/x-flv", name: "Flash video", bytes: s("FLV\x01") },
  { ext: "mpg", mime: "video/mpeg", name: "MPEG program stream", aliases: ["mpeg", "vob"], bytes: [0x00, 0x00, 0x01, 0xba] },
  { ext: "ts", mime: "video/mp2t", name: "MPEG transport stream", aliases: ["mts", "m2ts"], bytes: [0x47], offset: 0 },
  { ext: "woff", mime: "font/woff", name: "WOFF font", bytes: s("wOFF") },
  { ext: "woff2", mime: "font/woff2", name: "WOFF2 font", bytes: s("wOF2") },
  { ext: "otf", mime: "font/otf", name: "OpenType font (CFF)", bytes: s("OTTO") },
  { ext: "ttf", mime: "font/ttf", name: "TrueType font", bytes: [0x00, 0x01, 0x00, 0x00, 0x00] },
  { ext: "eot", mime: "application/vnd.ms-fontobject", name: "Embedded OpenType font", bytes: s("LP"), offset: 34 },
  { ext: "swf", mime: "application/x-shockwave-flash", name: "Flash SWF", bytes: s("FWS") },
  { ext: "swf", mime: "application/x-shockwave-flash", name: "Flash SWF (compressed)", bytes: s("CWS") },
  { ext: "class", mime: "application/java-vm", name: "Java class", bytes: [0xca, 0xfe, 0xba, 0xbe] },
  { ext: "pcap", mime: "application/vnd.tcpdump.pcap", name: "PCAP capture", bytes: [0xd4, 0xc3, 0xb2, 0xa1] },
  { ext: "pcapng", mime: "application/x-pcapng", name: "PCAPNG capture", bytes: [0x0a, 0x0d, 0x0d, 0x0a] },
  { ext: "deb", mime: "application/vnd.debian.binary-package", name: "Debian package", bytes: s("!<arch>\ndebian") },
  { ext: "a", mime: "application/x-archive", name: "Unix ar archive", aliases: ["lib"], bytes: s("!<arch>\n") },
  { ext: "rpm", mime: "application/x-rpm", name: "RPM package", bytes: [0xed, 0xab, 0xee, 0xdb] },
  { ext: "xml", mime: "application/xml", name: "XML document", aliases: ["svg", "rss", "atom", "xsd", "xsl", "plist", "kml", "gpx"], bytes: s("<?xml") },
  { ext: "pem", mime: "application/x-pem-file", name: "PEM (certificate/key)", aliases: ["crt", "cer", "key", "csr", "pub"], bytes: s("-----BEGIN ") },
  { ext: "ics", mime: "text/calendar", name: "iCalendar", bytes: s("BEGIN:VCALENDAR") },
  { ext: "vcf", mime: "text/vcard", name: "vCard", bytes: s("BEGIN:VCARD") },
  { ext: "sh", mime: "text/x-shellscript", name: "Script with shebang", aliases: ["bash", "py", "pl", "rb", "js", "zsh", ""], bytes: s("#!") },
  { ext: "lnk", mime: "application/x-ms-shortcut", name: "Windows shortcut", bytes: [0x4c, 0x00, 0x00, 0x00, 0x01, 0x14, 0x02, 0x00] },
  { ext: "torrent", mime: "application/x-bittorrent", name: "BitTorrent file", bytes: s("d8:announce") },
  { ext: "blend", mime: "application/x-blender", name: "Blender file", bytes: s("BLENDER") },
  { ext: "parquet", mime: "application/vnd.apache.parquet", name: "Apache Parquet", bytes: s("PAR1") },
];

function match(b: Uint8Array, sig: Signature): boolean {
  const off = sig.offset ?? 0;
  if (b.length < off + sig.bytes.length) return false;
  return sig.bytes.every((x, i) => x === null || b[off + i] === x);
}

function ascii(b: Uint8Array, off: number, len: number): string {
  let out = "";
  for (let i = off; i < Math.min(b.length, off + len); i++) out += String.fromCharCode(b[i]);
  return out;
}

const info = (ext: string, mime: string, name: string, aliases?: string[]): FileTypeInfo => ({ ext, mime, name, aliases });

/** Refines RIFF, ISO-BMFF, ZIP-based and text formats. */
function refine(b: Uint8Array): FileTypeInfo | null {
  // RIFF containers
  if (ascii(b, 0, 4) === "RIFF") {
    const kind = ascii(b, 8, 4);
    if (kind === "WEBP") return info("webp", "image/webp", "WebP image");
    if (kind === "WAVE") return info("wav", "audio/wav", "WAV audio", ["wave"]);
    if (kind === "AVI ") return info("avi", "video/x-msvideo", "AVI video");
    if (kind === "ACON") return info("ani", "application/x-navi-animation", "Animated cursor");
    return info("riff", "application/octet-stream", `RIFF container (${kind.trim()})`);
  }
  if (ascii(b, 0, 4) === "FORM" && (ascii(b, 8, 4) === "AIFF" || ascii(b, 8, 4) === "AIFC")) return info("aiff", "audio/aiff", "AIFF audio", ["aif", "aifc"]);
  // ISO base media (MP4/MOV/HEIC/AVIF/3GP/M4A)
  if (ascii(b, 4, 4) === "ftyp") {
    const brand = ascii(b, 8, 4);
    const brands = ascii(b, 8, Math.min(64, b.length - 8));
    if (/avif|avis/.test(brand)) return info("avif", "image/avif", "AVIF image");
    if (/heic|heix|hevc|hevx|heim|heis/.test(brand)) return info("heic", "image/heic", "HEIC image", ["heif"]);
    if (/mif1|msf1/.test(brand)) return brands.includes("avif") ? info("avif", "image/avif", "AVIF image") : info("heif", "image/heif", "HEIF image", ["heic"]);
    if (brand === "qt  ") return info("mov", "video/quicktime", "QuickTime movie", ["qt"]);
    if (/M4A |M4B /.test(brand)) return info("m4a", "audio/mp4", "MPEG-4 audio", ["m4b", "mp4"]);
    if (/M4V /.test(brand)) return info("m4v", "video/x-m4v", "MPEG-4 video", ["mp4"]);
    if (/^3g/.test(brand)) return info("3gp", "video/3gpp", "3GPP video", ["3g2"]);
    if (/crx /.test(brand)) return info("cr3", "image/x-canon-cr3", "Canon CR3 raw");
    return info("mp4", "video/mp4", `MPEG-4 (${brand.trim()})`, ["m4v", "m4a", "mov"]);
  }
  // ZIP-based documents: look for well-known entry names in the first local headers.
  if (b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) {
    const head = ascii(b, 0, Math.min(b.length, 8192));
    if (head.includes("mimetypeapplication/epub+zip")) return info("epub", "application/epub+zip", "EPUB e-book");
    if (head.includes("mimetypeapplication/vnd.oasis.opendocument.text")) return info("odt", "application/vnd.oasis.opendocument.text", "OpenDocument text");
    if (head.includes("mimetypeapplication/vnd.oasis.opendocument.spreadsheet"))
      return info("ods", "application/vnd.oasis.opendocument.spreadsheet", "OpenDocument spreadsheet");
    if (head.includes("mimetypeapplication/vnd.oasis.opendocument.presentation"))
      return info("odp", "application/vnd.oasis.opendocument.presentation", "OpenDocument presentation");
    if (head.includes("word/")) return info("docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Word document (DOCX)", ["docm", "dotx"]);
    if (head.includes("xl/")) return info("xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Excel workbook (XLSX)", ["xlsm", "xltx"]);
    if (head.includes("ppt/")) return info("pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "PowerPoint (PPTX)", ["pptm", "potx"]);
    if (head.includes("AndroidManifest.xml") || head.includes("classes.dex")) return info("apk", "application/vnd.android.package-archive", "Android package (APK)");
    if (head.includes("META-INF/MANIFEST.MF")) return info("jar", "application/java-archive", "Java archive (JAR)", ["war", "ear", "zip"]);
    if (head.includes("[Content_Types].xml")) return info("ooxml", "application/zip", "Office Open XML package", ["docx", "xlsx", "pptx", "vsdx"]);
  }
  return null;
}

/** Heuristic text detection: valid UTF-8 (or UTF-16 with BOM) without control bytes. */
export function looksLikeText(b: Uint8Array): { text: boolean; encoding?: string } {
  if (b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return { text: true, encoding: "UTF-8 (BOM)" };
  if (b.length >= 2 && ((b[0] === 0xff && b[1] === 0xfe) || (b[0] === 0xfe && b[1] === 0xff))) return { text: true, encoding: b[0] === 0xff ? "UTF-16 LE" : "UTF-16 BE" };
  if (!b.length) return { text: false };
  let control = 0;
  for (const x of b) if ((x < 0x09 || (x > 0x0d && x < 0x20)) && x !== 0x1b) control++;
  if (control > 0) return { text: false };
  try {
    // Trim a possibly cut multi-byte sequence at the end of the sample.
    let end = b.length;
    for (let k = 0; k < 3 && end > 0 && (b[end - 1] & 0xc0) === 0x80; k++) end--;
    if (end > 0 && b[end - 1] >= 0xc0) end--;
    new TextDecoder("utf-8", { fatal: true }).decode(b.subarray(0, end));
    return { text: true, encoding: b.every((x) => x < 0x80) ? "ASCII" : "UTF-8" };
  } catch {
    return { text: false };
  }
}

function refineText(b: Uint8Array): FileTypeInfo {
  const t = new TextDecoder().decode(b.subarray(0, 2048)).replace(/^﻿/, "").trimStart();
  const lower = t.slice(0, 256).toLowerCase();
  if (lower.startsWith("<!doctype html") || lower.startsWith("<html")) return info("html", "text/html", "HTML document", ["htm", "xhtml"]);
  if (lower.startsWith("<svg") || (lower.startsWith("<?xml") && lower.includes("<svg"))) return info("svg", "image/svg+xml", "SVG image");
  if (/^[{[]/.test(t)) {
    try {
      JSON.parse(new TextDecoder().decode(b));
      return info("json", "application/json", "JSON", ["geojson", "webmanifest", "map"]);
    } catch {
      /* fall through */
    }
  }
  return info("txt", "text/plain", "Plain text", ["text", "md", "csv", "tsv", "log", "ini", "cfg", "conf", "yaml", "yml", "toml", "js", "ts", "css", "py", "java", "c", "h", "cpp", "go", "rs", "sql", "json", "xml", "html", "svg", "srt", "vtt"]);
}

/** Detects the type from the first bytes (pass ≥ 8 KiB for best results; 32 KiB+ for ISO). */
export function detectFileType(b: Uint8Array): FileTypeInfo | null {
  const refined = refine(b);
  if (refined) return refined;
  for (const sig of SIGNATURES) {
    if (sig.ext === "ts") {
      // MPEG-TS: sync byte 0x47 repeating every 188 bytes.
      if (b.length >= 377 && b[0] === 0x47 && b[188] === 0x47 && b[376] === 0x47) return { ext: sig.ext, mime: sig.mime, name: sig.name, aliases: sig.aliases };
      continue;
    }
    if (match(b, sig)) return { ext: sig.ext, mime: sig.mime, name: sig.name, aliases: sig.aliases };
  }
  const txt = looksLikeText(b);
  if (txt.text) return refineText(b);
  return null;
}

export type ExtensionVerdict = "match" | "alias" | "mismatch" | "unknown" | "no-extension";

/** Compares a detected type with the file's extension. */
export function compareExtension(fileName: string, detected: FileTypeInfo | null): ExtensionVerdict {
  const i = fileName.lastIndexOf(".");
  const ext = i > 0 ? fileName.slice(i + 1).toLowerCase() : "";
  if (!detected) return "unknown";
  if (!ext) return detected.aliases?.includes("") ? "match" : "no-extension";
  if (ext === detected.ext) return "match";
  if (detected.aliases?.includes(ext)) return "alias";
  // ZIP-based formats legitimately carry their own extension.
  if (detected.ext === "zip" && ["docx", "xlsx", "pptx", "odt", "ods", "odp", "epub", "jar", "apk", "xpi", "ipa", "kmz", "cbz", "vsix", "nupkg", "whl", "aar"].includes(ext))
    return "alias";
  if (detected.ext === "gz" && ext === "tgz") return "alias";
  if (detected.ext === "xml" && ["svg", "plist", "xaml", "csproj", "config"].includes(ext)) return "alias";
  return "mismatch";
}

/** Reads the first `n` bytes of a Blob. */
export async function readHead(blob: Blob, n = 0x8806): Promise<Uint8Array> {
  return new Uint8Array(await blob.slice(0, n).arrayBuffer());
}
