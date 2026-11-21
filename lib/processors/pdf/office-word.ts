/**
 * PDF → Word (.docx). Text is read with PDF.js (see text.ts), grouped into lines and
 * paragraphs, headings are guessed from font size, and the result is written with `docx`.
 * Layout, images, tables and fonts are not reproduced.
 */
import { bodyFontSize, groupLines, linesToParagraphs, type PageText, type Paragraph } from "./text";

export interface WordParagraph {
  text: string;
  headingLevel: number;
  /** Font size in points (body text keeps its original size, rounded to half points). */
  fontSize: number;
  bullet: boolean;
}

export interface WordPage {
  page: number;
  width: number;
  height: number;
  paragraphs: WordParagraph[];
}

/** Turns extracted page text into a simple paragraph model. Pure, unit-tested. */
export function pagesToWordModel(pages: PageText[]): WordPage[] {
  const allLines = pages.map((p) => groupLines(p.items));
  const body = bodyFontSize(allLines.flat());
  return pages.map((p, i) => ({
    page: p.page,
    width: p.width,
    height: p.height,
    paragraphs: linesToParagraphs(allLines[i], body).map((para: Paragraph) => ({
      text: para.text,
      headingLevel: para.headingLevel,
      fontSize: Math.round(para.fontSize * 2) / 2,
      bullet: /^[•▪◦‣·]\s/.test(para.text),
    })),
  }));
}

export interface DocxOptions {
  /** Start each PDF page on a new Word page. */
  pageBreaks?: boolean;
  /** Keep the original font sizes (otherwise Word's default body size is used). */
  keepFontSizes?: boolean;
  title?: string;
}

/** Builds the .docx bytes. Works in the browser and in Node. */
export async function buildDocx(model: WordPage[], opts: DocxOptions = {}): Promise<Uint8Array> {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import("docx");
  const headingOf = [undefined, HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3] as const;
  const children: InstanceType<typeof Paragraph>[] = [];
  model.forEach((page, pi) => {
    page.paragraphs.forEach((p, i) => {
      const pageBreakBefore = !!opts.pageBreaks && pi > 0 && i === 0;
      const text = p.bullet ? p.text.replace(/^[•▪◦‣·]\s*/, "") : p.text;
      const run = new TextRun({
        text,
        size: opts.keepFontSizes && !p.headingLevel ? Math.max(12, Math.round(p.fontSize * 2)) : undefined,
      });
      children.push(
        new Paragraph({
          children: [run],
          heading: headingOf[p.headingLevel],
          bullet: p.bullet ? { level: 0 } : undefined,
          pageBreakBefore,
          spacing: { after: 120 },
        }),
      );
    });
    if (!page.paragraphs.length && opts.pageBreaks && pi > 0) children.push(new Paragraph({ children: [], pageBreakBefore: true }));
  });
  if (!children.length) children.push(new Paragraph({ children: [] }));
  const first = model[0];
  const doc = new Document({
    title: opts.title,
    creator: "UtilityHub",
    sections: [
      {
        properties: first
          ? { page: { size: { width: Math.round(first.width * 20), height: Math.round(first.height * 20) } } }
          : {},
        children,
      },
    ],
  });
  return Packer.pack(doc, "uint8array");
}

export function modelStats(model: WordPage[]) {
  const paragraphs = model.reduce((s, p) => s + p.paragraphs.length, 0);
  const headings = model.reduce((s, p) => s + p.paragraphs.filter((x) => x.headingLevel).length, 0);
  const chars = model.reduce((s, p) => s + p.paragraphs.reduce((t, x) => t + x.text.length, 0), 0);
  return { paragraphs, headings, chars };
}
