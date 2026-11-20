import type { CategoryDefinition, CategorySlug } from "@/types/tool";

export const categories: CategoryDefinition[] = [
  {
    slug: "pdf",
    name: "Document and PDF Tools",
    shortName: "PDF",
    description:
      "Merge, split, compress, convert, sign and edit PDF documents directly in your browser. Most PDF operations never upload your file.",
    seoTitle: "Free Online PDF Tools – Merge, Split, Convert & Edit",
    seoDescription:
      "40 browser-based PDF tools: merge, split, compress, rotate, protect, sign, OCR and convert PDFs to and from Word, Excel, images and more.",
    icon: "FileText",
    range: [1, 40],
  },
  {
    slug: "image",
    name: "Image Tools",
    shortName: "Image",
    description:
      "Compress, resize, crop, convert and edit images with the Canvas API. Files are processed locally on your device.",
    seoTitle: "Free Online Image Tools – Compress, Resize & Convert",
    seoDescription:
      "30 private image tools: compress, resize, crop, rotate, convert JPG, PNG, WebP, HEIC and SVG, remove backgrounds and strip metadata.",
    icon: "Image",
    range: [41, 70],
  },
  {
    slug: "video",
    name: "Video Tools",
    shortName: "Video",
    description:
      "Trim, convert, compress and edit video using FFmpeg compiled to WebAssembly, running entirely inside your browser tab.",
    seoTitle: "Free Online Video Tools – Convert, Trim & Compress",
    seoDescription:
      "30 in-browser video tools powered by FFmpeg.wasm: convert MOV, MKV, AVI and WebM to MP4, trim, merge, crop, mute and make GIFs.",
    icon: "Video",
    range: [71, 100],
  },
  {
    slug: "audio",
    name: "Audio Tools",
    shortName: "Audio",
    description:
      "Convert, cut, merge and enhance audio with the Web Audio API and FFmpeg.wasm, plus recording and speech tools.",
    seoTitle: "Free Online Audio Tools – Convert, Cut & Record",
    seoDescription:
      "25 audio tools in your browser: convert MP3, WAV, M4A, FLAC and OGG, trim, merge, normalize, change speed, record and text to speech.",
    icon: "AudioLines",
    range: [101, 125],
  },
  {
    slug: "archive",
    name: "Archive and Compression Tools",
    shortName: "Archive",
    description:
      "Open ZIP, RAR, 7Z, TAR and GZIP archives, create ZIP files and verify archive integrity without installing software.",
    seoTitle: "Free Online Archive Tools – ZIP, RAR, 7Z & TAR",
    seoDescription:
      "Extract ZIP, RAR, 7Z, TAR and GZ files, create ZIP archives, compare archives and test integrity – all processed locally in your browser.",
    icon: "Archive",
    range: [126, 138],
  },
  {
    slug: "text",
    name: "Text Tools",
    shortName: "Text",
    description:
      "Count words, convert case, clean up whitespace, compare text and convert Markdown – instant results as you type.",
    seoTitle: "Free Online Text Tools – Word Counter, Case Converter & More",
    seoDescription:
      "22 instant text utilities: word and character counters, case converters, duplicate line remover, diff checker, slug generator and Markdown tools.",
    icon: "Type",
    range: [139, 160],
  },
  {
    slug: "developer",
    name: "Developer Tools",
    shortName: "Developer",
    description:
      "Format, validate, minify and convert JSON, XML, YAML, HTML, CSS, JavaScript and SQL, plus encoders, JWT, UUID and regex tools.",
    seoTitle: "Free Online Developer Tools – JSON, XML, Regex & More",
    seoDescription:
      "40 developer utilities: JSON formatter and validator, XML and YAML converters, code minifiers, Base64, JWT decoder, UUID, regex and hash tools.",
    icon: "Code",
    range: [161, 200],
  },
  {
    slug: "data",
    name: "Spreadsheet and Data Tools",
    shortName: "Data",
    description:
      "View, edit, merge, split and convert CSV, TSV, Excel and JSON data with SheetJS – no spreadsheet software required.",
    seoTitle: "Free Online CSV & Excel Tools – Convert, Merge & View",
    seoDescription:
      "19 spreadsheet tools: convert CSV, Excel, JSON, TSV and XML, view and edit CSV, merge and split files, dedupe, sort and filter data.",
    icon: "Sheet",
    range: [201, 219],
  },
  {
    slug: "security",
    name: "Security and Encryption Tools",
    shortName: "Security",
    description:
      "Generate hashes and checksums, encrypt text and files with AES, create strong passwords and RSA key pairs using the Web Crypto API.",
    seoTitle: "Free Online Security Tools – Hash, AES & Password Generator",
    seoDescription:
      "14 security tools using the Web Crypto API: MD5, SHA-1, SHA-256, SHA-512, file checksums, AES encryption, passwords and RSA key pairs.",
    icon: "ShieldCheck",
    range: [220, 233],
  },
  {
    slug: "qr",
    name: "QR Code and Barcode Tools",
    shortName: "QR & Barcode",
    description:
      "Create QR codes for URLs, Wi-Fi, contacts and more, add logos, generate barcodes and scan codes with your camera.",
    seoTitle: "Free QR Code & Barcode Generator and Scanner",
    seoDescription:
      "12 QR and barcode tools: create QR codes for links, Wi-Fi, vCards, email, SMS and locations, add a logo, generate and scan barcodes.",
    icon: "QrCode",
    range: [234, 245],
  },
  {
    slug: "calculators",
    name: "Calculators and Everyday Tools",
    shortName: "Calculators",
    description:
      "Percentage, GST, income tax, EMI, interest, age and date calculators plus unit, temperature and time zone converters.",
    seoTitle: "Free Online Calculators – EMI, GST, Tax, BMI & Converters",
    seoDescription:
      "23 calculators and converters: percentage, discount, GST, income tax, EMI, loan, interest, age, dates, time zones, units, BMI and calories.",
    icon: "Calculator",
    range: [246, 268],
  },
  {
    slug: "files",
    name: "File Management Tools",
    shortName: "Files",
    description:
      "Rename, inspect, hash, compare, split, merge and organize files and folders locally using the File System Access API.",
    seoTitle: "Free Online File Tools – Bulk Rename, Hash & Compare",
    seoDescription:
      "17 file management tools: bulk rename, file type and size checks, duplicate finder, folder size, compare files and folders, split and merge.",
    icon: "FolderOpen",
    range: [269, 285],
  },
  {
    slug: "web",
    name: "Web and Internet Tools",
    shortName: "Web",
    description:
      "Inspect websites, DNS, WHOIS, headers, SSL certificates, meta tags and links, generate robots.txt and sitemaps.",
    seoTitle: "Free Online Web Tools – DNS, WHOIS, SSL & SEO Checkers",
    seoDescription:
      "19 web tools: DNS and WHOIS lookup, HTTP header and status checks, SSL certificate checker, meta tag analyzer, link checker and generators.",
    icon: "Globe",
    range: [286, 304],
  },
];

export const categoryMap = Object.fromEntries(categories.map((c) => [c.slug, c])) as Record<
  CategorySlug,
  CategoryDefinition
>;

export function getCategory(slug: string): CategoryDefinition | undefined {
  return categoryMap[slug as CategorySlug];
}
