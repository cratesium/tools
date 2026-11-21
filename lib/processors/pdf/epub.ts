/**
 * EPUB 3 building (PDF → EPUB) and reading (EPUB → PDF). Uses JSZip, imported lazily.
 */
import { escapeHtml } from "./html-export";
import { bodyFontSize, groupLines, linesToParagraphs, type PageText } from "./text";

export interface EpubChapter {
  title: string;
  /** XHTML body content (already escaped markup). */
  body: string;
}

export interface EpubMeta {
  title: string;
  author?: string;
  language?: string;
  identifier?: string;
  modified?: Date;
}

/** Splits extracted pages into chapters: at level-1/2 headings, or every N pages. */
export function pagesToChapters(
  pages: PageText[],
  { split = "headings", pagesPerChapter = 10 }: { split?: "headings" | "pages"; pagesPerChapter?: number } = {},
): EpubChapter[] {
  const body = bodyFontSize(pages.flatMap((p) => groupLines(p.items)));
  const chapters: { title: string; parts: string[] }[] = [];
  const per = Math.max(1, Math.floor(pagesPerChapter));
  pages.forEach((page, idx) => {
    const paras = linesToParagraphs(groupLines(page.items), body);
    if (split === "pages" && idx % per === 0) {
      const last = Math.min(pages.length, idx + per);
      chapters.push({ title: per === 1 ? `Page ${page.page}` : `Pages ${page.page}–${pages[last - 1].page}`, parts: [] });
    }
    for (const p of paras) {
      const text = escapeHtml(p.text);
      if (split === "headings" && p.headingLevel && p.headingLevel <= 2 && p.text.length <= 150) {
        chapters.push({ title: p.text, parts: [`<h1>${text}</h1>`] });
        continue;
      }
      if (!chapters.length) chapters.push({ title: "Start", parts: [] });
      const c = chapters[chapters.length - 1];
      c.parts.push(p.headingLevel ? `<h${p.headingLevel + 1}>${text}</h${p.headingLevel + 1}>` : `<p>${text}</p>`);
    }
  });
  const nonEmpty = chapters.filter((c) => c.parts.length);
  return (nonEmpty.length ? nonEmpty : [{ title: "Document", parts: ["<p></p>"] }]).map((c) => ({ title: c.title, body: c.parts.join("\n") }));
}

function uuid(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === "x" ? r : (r & 3) | 8).toString(16);
  });
}

function xhtml(title: string, body: string, lang: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${lang}" lang="${lang}">
<head>
<meta charset="utf-8"/>
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
${body}
</body>
</html>
`;
}

/** Builds a valid EPUB 3 container (mimetype first and stored, OPF, nav, NCX for EPUB 2 readers). */
export async function buildEpub(meta: EpubMeta, chapters: EpubChapter[]): Promise<Uint8Array> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const lang = meta.language || "en";
  const id = meta.identifier || `urn:uuid:${uuid()}`;
  const modified = (meta.modified ?? new Date()).toISOString().replace(/\.\d{3}Z$/, "Z");
  const title = escapeHtml(meta.title || "Untitled");
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>
`,
  );
  zip.file("OEBPS/style.css", "body{font-family:serif;line-height:1.5;margin:0 5%}h1,h2,h3,h4{font-family:sans-serif;line-height:1.25}p{margin:0 0 .8em;text-align:justify}\n");
  const items = chapters.map((c, i) => ({ id: `ch${i + 1}`, href: `chapter-${i + 1}.xhtml`, title: c.title || `Chapter ${i + 1}` }));
  chapters.forEach((c, i) => zip.file(`OEBPS/${items[i].href}`, xhtml(items[i].title, c.body, lang)));
  zip.file(
    "OEBPS/nav.xhtml",
    xhtml(
      "Contents",
      `<nav epub:type="toc" id="toc"><h1>Contents</h1><ol>\n${items.map((it) => `<li><a href="${it.href}">${escapeHtml(it.title)}</a></li>`).join("\n")}\n</ol></nav>`,
      lang,
    ),
  );
  zip.file(
    "OEBPS/toc.ncx",
    `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
<head><meta name="dtb:uid" content="${escapeHtml(id)}"/></head>
<docTitle><text>${title}</text></docTitle>
<navMap>
${items.map((it, i) => `<navPoint id="np${i + 1}" playOrder="${i + 1}"><navLabel><text>${escapeHtml(it.title)}</text></navLabel><content src="${it.href}"/></navPoint>`).join("\n")}
</navMap>
</ncx>
`,
  );
  zip.file(
    "OEBPS/content.opf",
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${lang}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="bookid">${escapeHtml(id)}</dc:identifier>
<dc:title>${title}</dc:title>
<dc:language>${escapeHtml(lang)}</dc:language>
${meta.author ? `<dc:creator>${escapeHtml(meta.author)}</dc:creator>\n` : ""}<meta property="dcterms:modified">${modified}</meta>
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
<item id="css" href="style.css" media-type="text/css"/>
${items.map((it) => `<item id="${it.id}" href="${it.href}" media-type="application/xhtml+xml"/>`).join("\n")}
</manifest>
<spine toc="ncx">
${items.map((it) => `<itemref idref="${it.id}"/>`).join("\n")}
</spine>
</package>
`,
  );
  return zip.generateAsync({ type: "uint8array", mimeType: "application/epub+zip", compression: "DEFLATE" });
}

/** Resolves a relative href against the directory of a base path inside the zip. */
export function resolveZipPath(base: string, href: string): string {
  const clean = decodeURIComponent(href.split("#")[0].split("?")[0]);
  if (clean.startsWith("/")) return clean.slice(1);
  const parts = base.split("/").slice(0, -1);
  for (const seg of clean.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg && seg !== ".") parts.push(seg);
  }
  return parts.join("/");
}

export interface ParsedEpub {
  title?: string;
  author?: string;
  /** Spine documents in reading order. */
  documents: { path: string; html: string }[];
  readFile(path: string): Promise<Uint8Array | null>;
  mediaType(path: string): string | undefined;
}

function attr(tag: string, name: string): string | undefined {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"));
  return m ? (m[2] ?? m[3]) : undefined;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");
}

/** Reads container.xml → OPF → manifest + spine. Regex-based so it runs without a DOM. */
export async function parseEpub(data: Uint8Array | ArrayBuffer): Promise<ParsedEpub> {
  const { default: JSZip } = await import("jszip");
  let zip: InstanceType<typeof JSZip>;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    throw new Error("This file is not a valid EPUB (it is not a ZIP archive).");
  }
  const container = await zip.file("META-INF/container.xml")?.async("string");
  if (!container) throw new Error("This EPUB has no META-INF/container.xml.");
  const rootTag = container.match(/<rootfile\b[^>]*>/i)?.[0];
  const opfPath = rootTag ? attr(rootTag, "full-path") : undefined;
  if (!opfPath) throw new Error("The EPUB container does not point to a package (OPF) file.");
  const opf = await zip.file(opfPath)?.async("string");
  if (!opf) throw new Error(`The package file ${opfPath} is missing.`);
  const manifest = new Map<string, { href: string; type: string; props?: string }>();
  for (const tag of opf.match(/<(?:opf:)?item\b[^>]*>/gi) ?? []) {
    const id = attr(tag, "id");
    const href = attr(tag, "href");
    if (id && href) manifest.set(id, { href: resolveZipPath(opfPath, decodeEntities(href)), type: attr(tag, "media-type") ?? "", props: attr(tag, "properties") });
  }
  const spine = (opf.match(/<(?:opf:)?itemref\b[^>]*>/gi) ?? [])
    .filter((t) => attr(t, "linear") !== "no")
    .map((t) => manifest.get(attr(t, "idref") ?? ""))
    .filter((x): x is { href: string; type: string; props?: string } => !!x && /html|xml/i.test(x.type));
  if (!spine.length) throw new Error("The EPUB spine lists no readable documents.");
  const documents: { path: string; html: string }[] = [];
  for (const item of spine) {
    const html = await zip.file(item.href)?.async("string");
    if (html) documents.push({ path: item.href, html });
  }
  const types = new Map([...manifest.values()].map((v) => [v.href, v.type]));
  const pick = (re: RegExp) => {
    const m = opf.match(re);
    return m ? decodeEntities(m[1].replace(/<[^>]+>/g, "")).trim() || undefined : undefined;
  };
  return {
    title: pick(/<dc:title\b[^>]*>([\s\S]*?)<\/dc:title>/i),
    author: pick(/<dc:creator\b[^>]*>([\s\S]*?)<\/dc:creator>/i),
    documents,
    readFile: async (path) => (zip.file(path) ? zip.file(path)!.async("uint8array") : null),
    mediaType: (path) => types.get(path),
  };
}
