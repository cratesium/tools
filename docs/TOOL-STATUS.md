# Tool implementation status

Generated from the registry (`npm run status`).

| Status | Count |
| --- | --- |
| ✅ Full | 263 |
| 🟡 Partial | 26 |
| 🔌 API / server | 15 |
| ⏳ Planned | 0 |
| **Total** | **304** |

- **Full**: works end to end in the browser.
- **Partial**: works with documented limitations.
- **API / server**: needs a Cloudflare Pages Function, binding or external service.
- **Planned**: registered, not yet implemented.

## Document and PDF Tools (1–40)

| # | Tool | Status | Notes |
| --- | --- | --- | --- |
| 1 | [PDF to Word](../app/tools/[slug]/page.tsx) `/tools/pdf-to-word` | 🟡 Partial | Text-based conversion: paragraphs, headings and lists become editable Word text, but images, tables, columns, exact fonts and positions are not preserved. Works from the PDF's text layer: scanned PDFs need OCR PDF first. |
| 2 | [Word to PDF](../app/tools/[slug]/page.tsx) `/tools/word-to-pdf` | 🟡 Partial | Structure-based conversion in the browser: text, headings, lists, tables and images are kept, but exact fonts, headers/footers, columns, text boxes and Word's precise page layout are not reproduced. Legacy .doc files aren't supported. |
| 3 | [PDF to Excel](../app/tools/[slug]/page.tsx) `/tools/pdf-to-excel` | 🟡 Partial | Tables are inferred from text positions, which works well for clean tables but can misalign merged cells, multi-line cells or unusual layouts. Works from the PDF's text layer: scanned PDFs need OCR PDF first. |
| 4 | [Excel to PDF](../app/tools/[slug]/page.tsx) `/tools/excel-to-pdf` | 🟡 Partial | Produces clean data tables: cell values and number formats are kept, but cell colours, borders styling, charts, images, merged cells and Excel print areas are not reproduced. |
| 5 | [PDF to PowerPoint](../app/tools/[slug]/page.tsx) `/tools/pdf-to-powerpoint` | 🟡 Partial | Each slide is an image of the PDF page – visually faithful, but slide text and shapes are not editable in PowerPoint. |
| 6 | [PowerPoint to PDF](../app/tools/[slug]/page.tsx) `/tools/powerpoint-to-pdf` | 🟡 Partial | Slides are rebuilt in the browser from text boxes, basic shapes and pictures with standard fonts. Charts, SmartArt, gradients, theme effects, custom fonts and animations are not rendered, so complex decks will look simplified. Legacy .ppt isn't supported. |
| 7 | [PDF to JPG](../app/tools/[slug]/page.tsx) `/tools/pdf-to-jpg` | ✅ Full |  |
| 8 | [JPG to PDF](../app/tools/[slug]/page.tsx) `/tools/jpg-to-pdf` | ✅ Full |  |
| 9 | [PDF to PNG](../app/tools/[slug]/page.tsx) `/tools/pdf-to-png` | ✅ Full |  |
| 10 | [PNG to PDF](../app/tools/[slug]/page.tsx) `/tools/png-to-pdf` | ✅ Full |  |
| 11 | [Merge PDF](../app/tools/[slug]/page.tsx) `/tools/merge-pdf` | ✅ Full |  |
| 12 | [Split PDF](../app/tools/[slug]/page.tsx) `/tools/split-pdf` | ✅ Full |  |
| 13 | [Compress PDF](../app/tools/[slug]/page.tsx) `/tools/compress-pdf` | ✅ Full |  |
| 14 | [Rotate PDF](../app/tools/[slug]/page.tsx) `/tools/rotate-pdf` | ✅ Full |  |
| 15 | [Delete PDF Pages](../app/tools/[slug]/page.tsx) `/tools/delete-pdf-pages` | ✅ Full |  |
| 16 | [Extract PDF Pages](../app/tools/[slug]/page.tsx) `/tools/extract-pdf-pages` | ✅ Full |  |
| 17 | [Reorder PDF Pages](../app/tools/[slug]/page.tsx) `/tools/reorder-pdf-pages` | ✅ Full |  |
| 18 | [Protect PDF](../app/tools/[slug]/page.tsx) `/tools/protect-pdf` | ✅ Full |  |
| 19 | [Unlock PDF](../app/tools/[slug]/page.tsx) `/tools/unlock-pdf` | ✅ Full |  |
| 20 | [Add Watermark to PDF](../app/tools/[slug]/page.tsx) `/tools/add-watermark-to-pdf` | ✅ Full |  |
| 21 | [Remove PDF Watermark](../app/tools/[slug]/page.tsx) `/tools/remove-pdf-watermark` | 🟡 Partial | Removes watermarks that are stored as separate, identifiable objects (annotations, tagged artifacts, Acrobat watermark objects, layers or distinct text). Watermarks flattened into page graphics or baked into scanned images cannot be removed. |
| 22 | [Add Page Numbers to PDF](../app/tools/[slug]/page.tsx) `/tools/add-page-numbers-to-pdf` | ✅ Full |  |
| 23 | [Add Header and Footer to PDF](../app/tools/[slug]/page.tsx) `/tools/add-header-and-footer-to-pdf` | ✅ Full |  |
| 24 | [Crop PDF](../app/tools/[slug]/page.tsx) `/tools/crop-pdf` | ✅ Full |  |
| 25 | [Edit PDF](../app/tools/[slug]/page.tsx) `/tools/edit-pdf` | 🟡 Partial | You can add new text, shapes, whiteout and images on top of pages. Changing or deleting the PDF's existing text in place isn't supported, and whiteout only hides content visually (the original text remains in the file). |
| 26 | [Sign PDF](../app/tools/[slug]/page.tsx) `/tools/sign-pdf` | 🟡 Partial | Adds a visual (electronic) signature image, like signing a printout. It is not a certificate-based digital signature (PAdES/PKI), so it doesn't cryptographically prove identity or detect later changes. |
| 27 | [Fill PDF Forms](../app/tools/[slug]/page.tsx) `/tools/fill-pdf-forms` | 🟡 Partial | Supports standard AcroForm fields. XFA forms (used by some government and tax PDFs) aren't supported; for flat forms without fields, use Edit PDF to type on the page. |
| 28 | [Flatten PDF](../app/tools/[slug]/page.tsx) `/tools/flatten-pdf` | ✅ Full |  |
| 29 | [Repair PDF](../app/tools/[slug]/page.tsx) `/tools/repair-pdf` | 🟡 Partial | Recovers what is still present in the file: structural damage and truncated files are often fixable, but missing or corrupted page data cannot be restored, and the fallback produces image-only pages. |
| 30 | [OCR PDF](../app/tools/[slug]/page.tsx) `/tools/ocr-pdf` | ✅ Full | Depends on: Tesseract.js engine and language data (downloaded once from jsDelivr) |
| 31 | [Search PDF](../app/tools/[slug]/page.tsx) `/tools/search-pdf` | ✅ Full |  |
| 32 | [Compare PDF](../app/tools/[slug]/page.tsx) `/tools/compare-pdf` | ✅ Full |  |
| 33 | [Extract Images from PDF](../app/tools/[slug]/page.tsx) `/tools/extract-images-from-pdf` | ✅ Full |  |
| 34 | [Extract Text from PDF](../app/tools/[slug]/page.tsx) `/tools/extract-text-from-pdf` | ✅ Full |  |
| 35 | [Extract Tables from PDF](../app/tools/[slug]/page.tsx) `/tools/extract-tables-from-pdf` | 🟡 Partial | Table structure is inferred from text positions; clean tables extract well, while merged cells, wrapped text and borderless complex layouts may need cleanup. Works from the PDF's text layer: scanned PDFs need OCR PDF first. |
| 36 | [PDF Metadata Editor](../app/tools/[slug]/page.tsx) `/tools/pdf-metadata-editor` | ✅ Full |  |
| 37 | [PDF to HTML](../app/tools/[slug]/page.tsx) `/tools/pdf-to-html` | 🟡 Partial | Semantic mode keeps text structure but not layout; positioned mode reproduces text positions (and page images if chosen) but text isn't reflowable. Works from the PDF's text layer: scanned PDFs need OCR PDF first. |
| 38 | [HTML to PDF](../app/tools/[slug]/page.tsx) `/tools/html-to-pdf` | 🟡 Partial | Structural HTML is rendered with standard fonts; CSS layout (flexbox, grid, columns, custom fonts, backgrounds), JavaScript and remote images are not supported. |
| 39 | [PDF to EPUB](../app/tools/[slug]/page.tsx) `/tools/pdf-to-epub` | 🟡 Partial | Creates a text e-book: paragraphs, headings and chapters are kept, but images, tables and the original page design are not. Works from the PDF's text layer: scanned PDFs need OCR PDF first. |
| 40 | [EPUB to PDF](../app/tools/[slug]/page.tsx) `/tools/epub-to-pdf` | 🟡 Partial | Book text, headings, lists and images are laid out with standard fonts; the EPUB's CSS styling and embedded fonts are simplified, and DRM-protected books can't be opened. |

## Image Tools (41–70)

| # | Tool | Status | Notes |
| --- | --- | --- | --- |
| 41 | [Image Compressor](../app/tools/[slug]/page.tsx) `/tools/image-compressor` | ✅ Full |  |
| 42 | [Image Resizer](../app/tools/[slug]/page.tsx) `/tools/image-resizer` | ✅ Full |  |
| 43 | [Image Cropper](../app/tools/[slug]/page.tsx) `/tools/image-cropper` | ✅ Full |  |
| 44 | [Image Rotator](../app/tools/[slug]/page.tsx) `/tools/image-rotator` | ✅ Full |  |
| 45 | [Image Flipper](../app/tools/[slug]/page.tsx) `/tools/image-flipper` | ✅ Full |  |
| 46 | [Image Converter](../app/tools/[slug]/page.tsx) `/tools/image-converter` | ✅ Full |  |
| 47 | [JPG to PNG](../app/tools/[slug]/page.tsx) `/tools/jpg-to-png` | ✅ Full |  |
| 48 | [PNG to JPG](../app/tools/[slug]/page.tsx) `/tools/png-to-jpg` | ✅ Full |  |
| 49 | [WebP to JPG](../app/tools/[slug]/page.tsx) `/tools/webp-to-jpg` | ✅ Full |  |
| 50 | [JPG to WebP](../app/tools/[slug]/page.tsx) `/tools/jpg-to-webp` | ✅ Full |  |
| 51 | [PNG to WebP](../app/tools/[slug]/page.tsx) `/tools/png-to-webp` | ✅ Full |  |
| 52 | [WebP to PNG](../app/tools/[slug]/page.tsx) `/tools/webp-to-png` | ✅ Full |  |
| 53 | [HEIC to JPG](../app/tools/[slug]/page.tsx) `/tools/heic-to-jpg` | ✅ Full |  |
| 54 | [SVG to PNG](../app/tools/[slug]/page.tsx) `/tools/svg-to-png` | ✅ Full |  |
| 55 | [PNG to SVG](../app/tools/[slug]/page.tsx) `/tools/png-to-svg` | 🟡 Partial | Tracing approximates the image with vector shapes. Results are excellent for flat logos and line art; photos become stylised, posterised vectors rather than faithful copies. |
| 56 | [Image Background Remover](../app/tools/[slug]/page.tsx) `/tools/image-background-remover` | ✅ Full | Depends on: Transformers.js segmentation model from Hugging Face (MODNet ~26 MB or BiRefNet lite ~115 MB, downloaded once) |
| 57 | [Image Background Changer](../app/tools/[slug]/page.tsx) `/tools/image-background-changer` | ✅ Full | Depends on: Transformers.js segmentation model from Hugging Face (downloaded once) |
| 58 | [Image Watermark Tool](../app/tools/[slug]/page.tsx) `/tools/image-watermark-tool` | ✅ Full |  |
| 59 | [Remove Image Watermark](../app/tools/[slug]/page.tsx) `/tools/remove-image-watermark` | 🟡 Partial | Classic inpainting (no generative AI): it fills small marks on simple or textured backgrounds well, but large or semi-transparent watermarks over detailed areas may leave visible smudges. |
| 60 | [Image Blur Tool](../app/tools/[slug]/page.tsx) `/tools/image-blur-tool` | ✅ Full |  |
| 61 | [Image Sharpen Tool](../app/tools/[slug]/page.tsx) `/tools/image-sharpen-tool` | ✅ Full |  |
| 62 | [Image Brightness Adjuster](../app/tools/[slug]/page.tsx) `/tools/image-brightness-adjuster` | ✅ Full |  |
| 63 | [Image Contrast Adjuster](../app/tools/[slug]/page.tsx) `/tools/image-contrast-adjuster` | ✅ Full |  |
| 64 | [Image Color Adjuster](../app/tools/[slug]/page.tsx) `/tools/image-color-adjuster` | ✅ Full |  |
| 65 | [Image Grayscale Converter](../app/tools/[slug]/page.tsx) `/tools/image-grayscale-converter` | ✅ Full |  |
| 66 | [Image Pixelate Tool](../app/tools/[slug]/page.tsx) `/tools/image-pixelate-tool` | ✅ Full |  |
| 67 | [Image Metadata Remover](../app/tools/[slug]/page.tsx) `/tools/image-metadata-remover` | ✅ Full |  |
| 68 | [Image Metadata Viewer](../app/tools/[slug]/page.tsx) `/tools/image-metadata-viewer` | ✅ Full |  |
| 69 | [Image to Base64](../app/tools/[slug]/page.tsx) `/tools/image-to-base64` | ✅ Full |  |
| 70 | [Base64 to Image](../app/tools/[slug]/page.tsx) `/tools/base64-to-image` | ✅ Full |  |

## Video Tools (71–100)

| # | Tool | Status | Notes |
| --- | --- | --- | --- |
| 71 | [Video Compressor](../app/tools/[slug]/page.tsx) `/tools/video-compressor` | ✅ Full |  |
| 72 | [Video Converter](../app/tools/[slug]/page.tsx) `/tools/video-converter` | ✅ Full |  |
| 73 | [Video to MP4](../app/tools/[slug]/page.tsx) `/tools/video-to-mp4` | ✅ Full |  |
| 74 | [MP4 to WebM](../app/tools/[slug]/page.tsx) `/tools/mp4-to-webm` | ✅ Full |  |
| 75 | [WebM to MP4](../app/tools/[slug]/page.tsx) `/tools/webm-to-mp4` | ✅ Full |  |
| 76 | [MOV to MP4](../app/tools/[slug]/page.tsx) `/tools/mov-to-mp4` | ✅ Full |  |
| 77 | [AVI to MP4](../app/tools/[slug]/page.tsx) `/tools/avi-to-mp4` | ✅ Full |  |
| 78 | [MKV to MP4](../app/tools/[slug]/page.tsx) `/tools/mkv-to-mp4` | ✅ Full |  |
| 79 | [Video Trimmer](../app/tools/[slug]/page.tsx) `/tools/video-trimmer` | ✅ Full |  |
| 80 | [Video Cutter](../app/tools/[slug]/page.tsx) `/tools/video-cutter` | ✅ Full |  |
| 81 | [Video Merger](../app/tools/[slug]/page.tsx) `/tools/video-merger` | ✅ Full |  |
| 82 | [Video Splitter](../app/tools/[slug]/page.tsx) `/tools/video-splitter` | ✅ Full |  |
| 83 | [Video Cropper](../app/tools/[slug]/page.tsx) `/tools/video-cropper` | ✅ Full |  |
| 84 | [Video Resizer](../app/tools/[slug]/page.tsx) `/tools/video-resizer` | ✅ Full |  |
| 85 | [Video Rotator](../app/tools/[slug]/page.tsx) `/tools/video-rotator` | ✅ Full |  |
| 86 | [Video Speed Changer](../app/tools/[slug]/page.tsx) `/tools/video-speed-changer` | ✅ Full |  |
| 87 | [Video Reverse Tool](../app/tools/[slug]/page.tsx) `/tools/video-reverse-tool` | 🟡 Partial | Limited to clips of 60 seconds or less because FFmpeg's reverse filter buffers every frame in browser memory. |
| 88 | [Video Mute Tool](../app/tools/[slug]/page.tsx) `/tools/video-mute-tool` | ✅ Full |  |
| 89 | [Video Audio Extractor](../app/tools/[slug]/page.tsx) `/tools/video-audio-extractor` | ✅ Full |  |
| 90 | [Video to MP3](../app/tools/[slug]/page.tsx) `/tools/video-to-mp3` | ✅ Full |  |
| 91 | [Video to GIF](../app/tools/[slug]/page.tsx) `/tools/video-to-gif` | ✅ Full |  |
| 92 | [GIF to Video](../app/tools/[slug]/page.tsx) `/tools/gif-to-video` | ✅ Full |  |
| 93 | [Video Thumbnail Generator](../app/tools/[slug]/page.tsx) `/tools/video-thumbnail-generator` | ✅ Full |  |
| 94 | [Video Screenshot Tool](../app/tools/[slug]/page.tsx) `/tools/video-screenshot-tool` | ✅ Full |  |
| 95 | [Video Watermark Tool](../app/tools/[slug]/page.tsx) `/tools/video-watermark-tool` | ✅ Full |  |
| 96 | [Video Metadata Viewer](../app/tools/[slug]/page.tsx) `/tools/video-metadata-viewer` | ✅ Full |  |
| 97 | [Video Metadata Remover](../app/tools/[slug]/page.tsx) `/tools/video-metadata-remover` | ✅ Full |  |
| 98 | [Video Subtitle Extractor](../app/tools/[slug]/page.tsx) `/tools/video-subtitle-extractor` | ✅ Full |  |
| 99 | [Video Subtitle Merger](../app/tools/[slug]/page.tsx) `/tools/video-subtitle-merger` | ✅ Full |  |
| 100 | [Video Frame Rate Converter](../app/tools/[slug]/page.tsx) `/tools/video-frame-rate-converter` | ✅ Full |  |

## Audio Tools (101–125)

| # | Tool | Status | Notes |
| --- | --- | --- | --- |
| 101 | [Audio Converter](../app/tools/[slug]/page.tsx) `/tools/audio-converter` | ✅ Full |  |
| 102 | [MP3 Converter](../app/tools/[slug]/page.tsx) `/tools/mp3-converter` | ✅ Full |  |
| 103 | [WAV Converter](../app/tools/[slug]/page.tsx) `/tools/wav-converter` | ✅ Full |  |
| 104 | [MP3 to WAV](../app/tools/[slug]/page.tsx) `/tools/mp3-to-wav` | ✅ Full |  |
| 105 | [WAV to MP3](../app/tools/[slug]/page.tsx) `/tools/wav-to-mp3` | ✅ Full |  |
| 106 | [M4A to MP3](../app/tools/[slug]/page.tsx) `/tools/m4a-to-mp3` | ✅ Full |  |
| 107 | [AAC to MP3](../app/tools/[slug]/page.tsx) `/tools/aac-to-mp3` | ✅ Full |  |
| 108 | [FLAC to MP3](../app/tools/[slug]/page.tsx) `/tools/flac-to-mp3` | ✅ Full |  |
| 109 | [OGG to MP3](../app/tools/[slug]/page.tsx) `/tools/ogg-to-mp3` | ✅ Full |  |
| 110 | [Audio Compressor](../app/tools/[slug]/page.tsx) `/tools/audio-compressor` | ✅ Full |  |
| 111 | [Audio Cutter](../app/tools/[slug]/page.tsx) `/tools/audio-cutter` | ✅ Full |  |
| 112 | [Audio Trimmer](../app/tools/[slug]/page.tsx) `/tools/audio-trimmer` | ✅ Full |  |
| 113 | [Audio Merger](../app/tools/[slug]/page.tsx) `/tools/audio-merger` | ✅ Full |  |
| 114 | [Audio Splitter](../app/tools/[slug]/page.tsx) `/tools/audio-splitter` | ✅ Full |  |
| 115 | [Audio Speed Changer](../app/tools/[slug]/page.tsx) `/tools/audio-speed-changer` | ✅ Full |  |
| 116 | [Audio Volume Changer](../app/tools/[slug]/page.tsx) `/tools/audio-volume-changer` | ✅ Full |  |
| 117 | [Audio Normalizer](../app/tools/[slug]/page.tsx) `/tools/audio-normalizer` | ✅ Full |  |
| 118 | [Audio Noise Reducer](../app/tools/[slug]/page.tsx) `/tools/audio-noise-reducer` | ✅ Full |  |
| 119 | [Audio Recorder](../app/tools/[slug]/page.tsx) `/tools/audio-recorder` | ✅ Full |  |
| 120 | [Audio to Text](../app/tools/[slug]/page.tsx) `/tools/audio-to-text` | ✅ Full | Depends on: Whisper speech-recognition model from the Hugging Face Hub via Transformers.js (~40–250 MB depending on size, downloaded once and cached) |
| 121 | [Text to Speech](../app/tools/[slug]/page.tsx) `/tools/text-to-speech` | 🟡 Partial | Playback only: browsers do not expose speech-synthesis audio, so it can't be downloaded as a file. Available voices depend on your device and browser. |
| 122 | [Audio Equalizer](../app/tools/[slug]/page.tsx) `/tools/audio-equalizer` | ✅ Full |  |
| 123 | [Audio Reverse Tool](../app/tools/[slug]/page.tsx) `/tools/audio-reverse-tool` | ✅ Full |  |
| 124 | [Audio Metadata Editor](../app/tools/[slug]/page.tsx) `/tools/audio-metadata-editor` | ✅ Full |  |
| 125 | [Audio Metadata Remover](../app/tools/[slug]/page.tsx) `/tools/audio-metadata-remover` | ✅ Full |  |

## Archive and Compression Tools (126–138)

| # | Tool | Status | Notes |
| --- | --- | --- | --- |
| 126 | [ZIP Extractor](../app/tools/[slug]/page.tsx) `/tools/zip-extractor` | ✅ Full |  |
| 127 | [ZIP Creator](../app/tools/[slug]/page.tsx) `/tools/zip-creator` | ✅ Full |  |
| 128 | [RAR Extractor](../app/tools/[slug]/page.tsx) `/tools/rar-extractor` | 🟡 Partial | RAR reading uses libarchive, which supports most RAR 4 and RAR5 archives but not every feature: multi-volume (split) archives, some solid/encrypted RAR5 variants and recovery records may fail. Creating RAR files is not possible (proprietary format). Depends on: libarchive.js WebAssembly engine (~1 MB, served by UtilityHub) |
| 129 | [7Z Extractor](../app/tools/[slug]/page.tsx) `/tools/7z-extractor` | ✅ Full | Depends on: libarchive.js WebAssembly engine (~1 MB, served by UtilityHub) |
| 130 | [TAR Extractor](../app/tools/[slug]/page.tsx) `/tools/tar-extractor` | ✅ Full |  |
| 131 | [GZIP Extractor](../app/tools/[slug]/page.tsx) `/tools/gzip-extractor` | ✅ Full |  |
| 132 | [File Compressor](../app/tools/[slug]/page.tsx) `/tools/file-compressor` | ✅ Full |  |
| 133 | [File Decompressor](../app/tools/[slug]/page.tsx) `/tools/file-decompressor` | ✅ Full | Depends on: libarchive.js WebAssembly engine (~1 MB, served by UtilityHub) |
| 134 | [ZIP File Converter](../app/tools/[slug]/page.tsx) `/tools/zip-file-converter` | ✅ Full | Depends on: libarchive.js WebAssembly engine (~1 MB, served by UtilityHub) |
| 135 | [Archive Password Generator](../app/tools/[slug]/page.tsx) `/tools/archive-password-generator` | ✅ Full |  |
| 136 | [Archive Password Remover](../app/tools/[slug]/page.tsx) `/tools/archive-password-remover` | ✅ Full | Depends on: libarchive.js WebAssembly engine (~1 MB, served by UtilityHub) |
| 137 | [Compare Archive Files](../app/tools/[slug]/page.tsx) `/tools/compare-archive-files` | ✅ Full | Depends on: libarchive.js WebAssembly engine (~1 MB, served by UtilityHub) |
| 138 | [Test Archive Integrity](../app/tools/[slug]/page.tsx) `/tools/test-archive-integrity` | ✅ Full | Depends on: libarchive.js WebAssembly engine (~1 MB, served by UtilityHub) |

## Text Tools (139–160)

| # | Tool | Status | Notes |
| --- | --- | --- | --- |
| 139 | [Word Counter](../app/tools/[slug]/page.tsx) `/tools/word-counter` | ✅ Full |  |
| 140 | [Character Counter](../app/tools/[slug]/page.tsx) `/tools/character-counter` | ✅ Full |  |
| 141 | [Sentence Counter](../app/tools/[slug]/page.tsx) `/tools/sentence-counter` | ✅ Full |  |
| 142 | [Paragraph Counter](../app/tools/[slug]/page.tsx) `/tools/paragraph-counter` | ✅ Full |  |
| 143 | [Case Converter](../app/tools/[slug]/page.tsx) `/tools/case-converter` | ✅ Full |  |
| 144 | [Uppercase Converter](../app/tools/[slug]/page.tsx) `/tools/uppercase-converter` | ✅ Full |  |
| 145 | [Lowercase Converter](../app/tools/[slug]/page.tsx) `/tools/lowercase-converter` | ✅ Full |  |
| 146 | [Title Case Converter](../app/tools/[slug]/page.tsx) `/tools/title-case-converter` | ✅ Full |  |
| 147 | [Remove Extra Spaces](../app/tools/[slug]/page.tsx) `/tools/remove-extra-spaces` | ✅ Full |  |
| 148 | [Remove Duplicate Lines](../app/tools/[slug]/page.tsx) `/tools/remove-duplicate-lines` | ✅ Full |  |
| 149 | [Sort Lines Alphabetically](../app/tools/[slug]/page.tsx) `/tools/sort-lines-alphabetically` | ✅ Full |  |
| 150 | [Reverse Text](../app/tools/[slug]/page.tsx) `/tools/reverse-text` | ✅ Full |  |
| 151 | [Reverse Words](../app/tools/[slug]/page.tsx) `/tools/reverse-words` | ✅ Full |  |
| 152 | [Text Repeater](../app/tools/[slug]/page.tsx) `/tools/text-repeater` | ✅ Full |  |
| 153 | [Text Diff Checker](../app/tools/[slug]/page.tsx) `/tools/text-diff-checker` | ✅ Full |  |
| 154 | [Text to Slug](../app/tools/[slug]/page.tsx) `/tools/text-to-slug` | ✅ Full |  |
| 155 | [Slug to Text](../app/tools/[slug]/page.tsx) `/tools/slug-to-text` | ✅ Full |  |
| 156 | [Lorem Ipsum Generator](../app/tools/[slug]/page.tsx) `/tools/lorem-ipsum-generator` | ✅ Full |  |
| 157 | [Markdown Editor](../app/tools/[slug]/page.tsx) `/tools/markdown-editor` | ✅ Full |  |
| 158 | [Markdown to HTML](../app/tools/[slug]/page.tsx) `/tools/markdown-to-html` | ✅ Full |  |
| 159 | [HTML to Markdown](../app/tools/[slug]/page.tsx) `/tools/html-to-markdown` | ✅ Full |  |
| 160 | [Text Encoder and Decoder](../app/tools/[slug]/page.tsx) `/tools/text-encoder-and-decoder` | ✅ Full |  |

## Developer Tools (161–200)

| # | Tool | Status | Notes |
| --- | --- | --- | --- |
| 161 | [JSON Formatter](../app/tools/[slug]/page.tsx) `/tools/json-formatter` | ✅ Full |  |
| 162 | [JSON Validator](../app/tools/[slug]/page.tsx) `/tools/json-validator` | ✅ Full |  |
| 163 | [JSON Minifier](../app/tools/[slug]/page.tsx) `/tools/json-minifier` | ✅ Full |  |
| 164 | [JSON Beautifier](../app/tools/[slug]/page.tsx) `/tools/json-beautifier` | ✅ Full |  |
| 165 | [JSON to XML](../app/tools/[slug]/page.tsx) `/tools/json-to-xml` | ✅ Full |  |
| 166 | [JSON to CSV](../app/tools/[slug]/page.tsx) `/tools/json-to-csv` | ✅ Full |  |
| 167 | [JSON to YAML](../app/tools/[slug]/page.tsx) `/tools/json-to-yaml` | ✅ Full |  |
| 168 | [XML Formatter](../app/tools/[slug]/page.tsx) `/tools/xml-formatter` | ✅ Full |  |
| 169 | [XML Validator](../app/tools/[slug]/page.tsx) `/tools/xml-validator` | ✅ Full |  |
| 170 | [XML to JSON](../app/tools/[slug]/page.tsx) `/tools/xml-to-json` | ✅ Full |  |
| 171 | [YAML Formatter](../app/tools/[slug]/page.tsx) `/tools/yaml-formatter` | ✅ Full |  |
| 172 | [YAML Validator](../app/tools/[slug]/page.tsx) `/tools/yaml-validator` | ✅ Full |  |
| 173 | [YAML to JSON](../app/tools/[slug]/page.tsx) `/tools/yaml-to-json` | ✅ Full |  |
| 174 | [HTML Formatter](../app/tools/[slug]/page.tsx) `/tools/html-formatter` | ✅ Full |  |
| 175 | [HTML Minifier](../app/tools/[slug]/page.tsx) `/tools/html-minifier` | ✅ Full |  |
| 176 | [CSS Formatter](../app/tools/[slug]/page.tsx) `/tools/css-formatter` | ✅ Full |  |
| 177 | [CSS Minifier](../app/tools/[slug]/page.tsx) `/tools/css-minifier` | ✅ Full |  |
| 178 | [JavaScript Formatter](../app/tools/[slug]/page.tsx) `/tools/javascript-formatter` | ✅ Full |  |
| 179 | [JavaScript Minifier](../app/tools/[slug]/page.tsx) `/tools/javascript-minifier` | ✅ Full |  |
| 180 | [SQL Formatter](../app/tools/[slug]/page.tsx) `/tools/sql-formatter` | ✅ Full |  |
| 181 | [SQL Minifier](../app/tools/[slug]/page.tsx) `/tools/sql-minifier` | ✅ Full |  |
| 182 | [SQL Query Validator](../app/tools/[slug]/page.tsx) `/tools/sql-query-validator` | ✅ Full |  |
| 183 | [Base64 Encoder](../app/tools/[slug]/page.tsx) `/tools/base64-encoder` | ✅ Full |  |
| 184 | [Base64 Decoder](../app/tools/[slug]/page.tsx) `/tools/base64-decoder` | ✅ Full |  |
| 185 | [URL Encoder](../app/tools/[slug]/page.tsx) `/tools/url-encoder` | ✅ Full |  |
| 186 | [URL Decoder](../app/tools/[slug]/page.tsx) `/tools/url-decoder` | ✅ Full |  |
| 187 | [HTML Entity Encoder](../app/tools/[slug]/page.tsx) `/tools/html-entity-encoder` | ✅ Full |  |
| 188 | [HTML Entity Decoder](../app/tools/[slug]/page.tsx) `/tools/html-entity-decoder` | ✅ Full |  |
| 189 | [JWT Decoder](../app/tools/[slug]/page.tsx) `/tools/jwt-decoder` | ✅ Full |  |
| 190 | [JWT Generator](../app/tools/[slug]/page.tsx) `/tools/jwt-generator` | ✅ Full |  |
| 191 | [UUID Generator](../app/tools/[slug]/page.tsx) `/tools/uuid-generator` | ✅ Full |  |
| 192 | [Regex Tester](../app/tools/[slug]/page.tsx) `/tools/regex-tester` | ✅ Full |  |
| 193 | [Regex Generator](../app/tools/[slug]/page.tsx) `/tools/regex-generator` | 🟡 Partial | Pattern inference from examples is heuristic: it generalizes character classes and fixed literals and is meant as a starting point to review, not a guarantee of the intended language. |
| 194 | [Unix Timestamp Converter](../app/tools/[slug]/page.tsx) `/tools/unix-timestamp-converter` | ✅ Full |  |
| 195 | [Timestamp to Date](../app/tools/[slug]/page.tsx) `/tools/timestamp-to-date` | ✅ Full |  |
| 196 | [Date to Timestamp](../app/tools/[slug]/page.tsx) `/tools/date-to-timestamp` | ✅ Full |  |
| 197 | [Color Code Converter](../app/tools/[slug]/page.tsx) `/tools/color-code-converter` | ✅ Full |  |
| 198 | [CSS Gradient Generator](../app/tools/[slug]/page.tsx) `/tools/css-gradient-generator` | ✅ Full |  |
| 199 | [Hash Generator](../app/tools/[slug]/page.tsx) `/tools/hash-generator` | ✅ Full |  |
| 200 | [HTML Preview Tool](../app/tools/[slug]/page.tsx) `/tools/html-preview-tool` | ✅ Full |  |

## Spreadsheet and Data Tools (201–219)

| # | Tool | Status | Notes |
| --- | --- | --- | --- |
| 201 | [CSV to Excel](../app/tools/[slug]/page.tsx) `/tools/csv-to-excel` | ✅ Full |  |
| 202 | [Excel to CSV](../app/tools/[slug]/page.tsx) `/tools/excel-to-csv` | ✅ Full |  |
| 203 | [CSV to JSON](../app/tools/[slug]/page.tsx) `/tools/csv-to-json` | ✅ Full |  |
| 204 | [JSON to CSV Converter](../app/tools/[slug]/page.tsx) `/tools/json-to-csv-converter` | ✅ Full |  |
| 205 | [CSV Viewer](../app/tools/[slug]/page.tsx) `/tools/csv-viewer` | ✅ Full |  |
| 206 | [CSV Editor](../app/tools/[slug]/page.tsx) `/tools/csv-editor` | ✅ Full |  |
| 207 | [CSV Merger](../app/tools/[slug]/page.tsx) `/tools/csv-merger` | ✅ Full |  |
| 208 | [CSV Splitter](../app/tools/[slug]/page.tsx) `/tools/csv-splitter` | ✅ Full |  |
| 209 | [Excel Viewer](../app/tools/[slug]/page.tsx) `/tools/excel-viewer` | ✅ Full |  |
| 210 | [Excel Merger](../app/tools/[slug]/page.tsx) `/tools/excel-merger` | ✅ Full |  |
| 211 | [Excel Splitter](../app/tools/[slug]/page.tsx) `/tools/excel-splitter` | ✅ Full |  |
| 212 | [Excel Sheet Extractor](../app/tools/[slug]/page.tsx) `/tools/excel-sheet-extractor` | ✅ Full |  |
| 213 | [Excel to JSON](../app/tools/[slug]/page.tsx) `/tools/excel-to-json` | ✅ Full |  |
| 214 | [JSON to Excel](../app/tools/[slug]/page.tsx) `/tools/json-to-excel` | ✅ Full |  |
| 215 | [TSV to CSV](../app/tools/[slug]/page.tsx) `/tools/tsv-to-csv` | ✅ Full |  |
| 216 | [CSV to XML](../app/tools/[slug]/page.tsx) `/tools/csv-to-xml` | ✅ Full |  |
| 217 | [Data Deduplicator](../app/tools/[slug]/page.tsx) `/tools/data-deduplicator` | ✅ Full |  |
| 218 | [Data Sorter](../app/tools/[slug]/page.tsx) `/tools/data-sorter` | ✅ Full |  |
| 219 | [Data Filter Tool](../app/tools/[slug]/page.tsx) `/tools/data-filter-tool` | ✅ Full |  |

## Security and Encryption Tools (220–233)

| # | Tool | Status | Notes |
| --- | --- | --- | --- |
| 220 | [MD5 Hash Generator](../app/tools/[slug]/page.tsx) `/tools/md5-hash-generator` | ✅ Full |  |
| 221 | [SHA-1 Hash Generator](../app/tools/[slug]/page.tsx) `/tools/sha-1-hash-generator` | ✅ Full |  |
| 222 | [SHA-256 Hash Generator](../app/tools/[slug]/page.tsx) `/tools/sha-256-hash-generator` | ✅ Full |  |
| 223 | [SHA-512 Hash Generator](../app/tools/[slug]/page.tsx) `/tools/sha-512-hash-generator` | ✅ Full |  |
| 224 | [File Checksum Generator](../app/tools/[slug]/page.tsx) `/tools/file-checksum-generator` | ✅ Full |  |
| 225 | [File Checksum Verifier](../app/tools/[slug]/page.tsx) `/tools/file-checksum-verifier` | ✅ Full |  |
| 226 | [AES Encryption](../app/tools/[slug]/page.tsx) `/tools/aes-encryption` | ✅ Full |  |
| 227 | [AES Decryption](../app/tools/[slug]/page.tsx) `/tools/aes-decryption` | ✅ Full |  |
| 228 | [Text Encryption](../app/tools/[slug]/page.tsx) `/tools/text-encryption` | ✅ Full |  |
| 229 | [Text Decryption](../app/tools/[slug]/page.tsx) `/tools/text-decryption` | ✅ Full |  |
| 230 | [Password Generator](../app/tools/[slug]/page.tsx) `/tools/password-generator` | ✅ Full |  |
| 231 | [Password Strength Checker](../app/tools/[slug]/page.tsx) `/tools/password-strength-checker` | ✅ Full |  |
| 232 | [Random String Generator](../app/tools/[slug]/page.tsx) `/tools/random-string-generator` | ✅ Full |  |
| 233 | [RSA Key Pair Generator](../app/tools/[slug]/page.tsx) `/tools/rsa-key-pair-generator` | ✅ Full |  |

## QR Code and Barcode Tools (234–245)

| # | Tool | Status | Notes |
| --- | --- | --- | --- |
| 234 | [QR Code Generator](../app/tools/[slug]/page.tsx) `/tools/qr-code-generator` | ✅ Full |  |
| 235 | [QR Code Scanner](../app/tools/[slug]/page.tsx) `/tools/qr-code-scanner` | ✅ Full |  |
| 236 | [URL QR Code Generator](../app/tools/[slug]/page.tsx) `/tools/url-qr-code-generator` | ✅ Full |  |
| 237 | [Wi-Fi QR Code Generator](../app/tools/[slug]/page.tsx) `/tools/wifi-qr-code-generator` | ✅ Full |  |
| 238 | [Contact QR Code Generator](../app/tools/[slug]/page.tsx) `/tools/contact-qr-code-generator` | ✅ Full |  |
| 239 | [Email QR Code Generator](../app/tools/[slug]/page.tsx) `/tools/email-qr-code-generator` | ✅ Full |  |
| 240 | [SMS QR Code Generator](../app/tools/[slug]/page.tsx) `/tools/sms-qr-code-generator` | ✅ Full |  |
| 241 | [Phone QR Code Generator](../app/tools/[slug]/page.tsx) `/tools/phone-qr-code-generator` | ✅ Full |  |
| 242 | [Location QR Code Generator](../app/tools/[slug]/page.tsx) `/tools/location-qr-code-generator` | ✅ Full |  |
| 243 | [QR Code with Logo](../app/tools/[slug]/page.tsx) `/tools/qr-code-with-logo` | ✅ Full |  |
| 244 | [Barcode Generator](../app/tools/[slug]/page.tsx) `/tools/barcode-generator` | ✅ Full |  |
| 245 | [Barcode Scanner](../app/tools/[slug]/page.tsx) `/tools/barcode-scanner` | ✅ Full |  |

## Calculators and Everyday Tools (246–268)

| # | Tool | Status | Notes |
| --- | --- | --- | --- |
| 246 | [Percentage Calculator](../app/tools/[slug]/page.tsx) `/tools/percentage-calculator` | ✅ Full |  |
| 247 | [Percentage Change Calculator](../app/tools/[slug]/page.tsx) `/tools/percentage-change-calculator` | ✅ Full |  |
| 248 | [Discount Calculator](../app/tools/[slug]/page.tsx) `/tools/discount-calculator` | ✅ Full |  |
| 249 | [GST Calculator](../app/tools/[slug]/page.tsx) `/tools/gst-calculator` | ✅ Full |  |
| 250 | [Income Tax Calculator](../app/tools/[slug]/page.tsx) `/tools/income-tax-calculator` | ✅ Full |  |
| 251 | [Loan Calculator](../app/tools/[slug]/page.tsx) `/tools/loan-calculator` | ✅ Full |  |
| 252 | [EMI Calculator](../app/tools/[slug]/page.tsx) `/tools/emi-calculator` | ✅ Full |  |
| 253 | [Compound Interest Calculator](../app/tools/[slug]/page.tsx) `/tools/compound-interest-calculator` | ✅ Full |  |
| 254 | [Simple Interest Calculator](../app/tools/[slug]/page.tsx) `/tools/simple-interest-calculator` | ✅ Full |  |
| 255 | [Age Calculator](../app/tools/[slug]/page.tsx) `/tools/age-calculator` | ✅ Full |  |
| 256 | [Date Difference Calculator](../app/tools/[slug]/page.tsx) `/tools/date-difference-calculator` | ✅ Full |  |
| 257 | [Date Calculator](../app/tools/[slug]/page.tsx) `/tools/date-calculator` | ✅ Full |  |
| 258 | [Time Calculator](../app/tools/[slug]/page.tsx) `/tools/time-calculator` | ✅ Full |  |
| 259 | [Time Zone Converter](../app/tools/[slug]/page.tsx) `/tools/time-zone-converter` | ✅ Full |  |
| 260 | [Unit Converter](../app/tools/[slug]/page.tsx) `/tools/unit-converter` | ✅ Full |  |
| 261 | [Length Converter](../app/tools/[slug]/page.tsx) `/tools/length-converter` | ✅ Full |  |
| 262 | [Weight Converter](../app/tools/[slug]/page.tsx) `/tools/weight-converter` | ✅ Full |  |
| 263 | [Temperature Converter](../app/tools/[slug]/page.tsx) `/tools/temperature-converter` | ✅ Full |  |
| 264 | [Area Converter](../app/tools/[slug]/page.tsx) `/tools/area-converter` | ✅ Full |  |
| 265 | [Volume Converter](../app/tools/[slug]/page.tsx) `/tools/volume-converter` | ✅ Full |  |
| 266 | [Speed Converter](../app/tools/[slug]/page.tsx) `/tools/speed-converter` | ✅ Full |  |
| 267 | [BMI Calculator](../app/tools/[slug]/page.tsx) `/tools/bmi-calculator` | ✅ Full |  |
| 268 | [Calorie Calculator](../app/tools/[slug]/page.tsx) `/tools/calorie-calculator` | ✅ Full |  |

## File Management Tools (269–285)

| # | Tool | Status | Notes |
| --- | --- | --- | --- |
| 269 | [File Renamer](../app/tools/[slug]/page.tsx) `/tools/file-renamer` | 🟡 Partial | In-place changes use the File System Access API (Chrome, Edge and other Chromium browsers). Other browsers get the same result as a ZIP download. |
| 270 | [Bulk File Renamer](../app/tools/[slug]/page.tsx) `/tools/bulk-file-renamer` | 🟡 Partial | In-place changes use the File System Access API (Chrome, Edge and other Chromium browsers). Other browsers get the same result as a ZIP download. |
| 271 | [File Size Checker](../app/tools/[slug]/page.tsx) `/tools/file-size-checker` | ✅ Full |  |
| 272 | [File Type Checker](../app/tools/[slug]/page.tsx) `/tools/file-type-checker` | ✅ Full |  |
| 273 | [File Extension Changer](../app/tools/[slug]/page.tsx) `/tools/file-extension-changer` | ✅ Full |  |
| 274 | [File Metadata Viewer](../app/tools/[slug]/page.tsx) `/tools/file-metadata-viewer` | ✅ Full |  |
| 275 | [File Metadata Remover](../app/tools/[slug]/page.tsx) `/tools/file-metadata-remover` | 🟡 Partial | Supported: JPEG, PNG and WebP (lossless), PDF and Office Open XML (DOCX/XLSX/PPTX). Other formats such as video, audio or HEIC are left unchanged, and comments or tracked changes inside Office documents are not removed. |
| 276 | [File Hash Checker](../app/tools/[slug]/page.tsx) `/tools/file-hash-checker` | ✅ Full |  |
| 277 | [Duplicate File Finder](../app/tools/[slug]/page.tsx) `/tools/duplicate-file-finder` | ✅ Full |  |
| 278 | [Folder Size Calculator](../app/tools/[slug]/page.tsx) `/tools/folder-size-calculator` | ✅ Full |  |
| 279 | [File Comparison Tool](../app/tools/[slug]/page.tsx) `/tools/file-comparison-tool` | ✅ Full |  |
| 280 | [Folder Comparison Tool](../app/tools/[slug]/page.tsx) `/tools/folder-comparison-tool` | ✅ Full |  |
| 281 | [File Merger](../app/tools/[slug]/page.tsx) `/tools/file-merger` | ✅ Full |  |
| 282 | [File Splitter](../app/tools/[slug]/page.tsx) `/tools/file-splitter` | ✅ Full |  |
| 283 | [File List Generator](../app/tools/[slug]/page.tsx) `/tools/file-list-generator` | ✅ Full |  |
| 284 | [File Name Extractor](../app/tools/[slug]/page.tsx) `/tools/file-name-extractor` | ✅ Full |  |
| 285 | [File Organizer](../app/tools/[slug]/page.tsx) `/tools/file-organizer` | 🟡 Partial | In-place changes use the File System Access API (Chrome, Edge and other Chromium browsers). Other browsers get the same result as a ZIP download. |

## Web and Internet Tools (286–304)

| # | Tool | Status | Notes |
| --- | --- | --- | --- |
| 286 | [URL Shortener](../app/tools/[slug]/page.tsx) `/tools/url-shortener` | 🔌 API / server | Requires persistent storage: the site operator must bind a Cloudflare KV namespace named SHORT_LINKS. Until then the tool reports that it is not configured instead of creating links that would not work. Depends on: UtilityHub Cloudflare Pages Function; Cloudflare KV namespace SHORT_LINKS |
| 287 | [URL Expander](../app/tools/[slug]/page.tsx) `/tools/url-expander` | 🔌 API / server | Browsers block cross-site requests, so the page is fetched by UtilityHub's Cloudflare Pages Function (public URLs only, 3 MB limit, private networks blocked). Some sites block automated requests. Depends on: UtilityHub Cloudflare Pages Function |
| 288 | [Website Screenshot Tool](../app/tools/[slug]/page.tsx) `/tools/website-screenshot-tool` | 🔌 API / server | Needs server-side browser rendering: the site operator must set CF_ACCOUNT_ID and the CF_API_TOKEN secret for Cloudflare Browser Rendering (a paid Cloudflare feature with free-tier limits). Until configured, the tool reports that it is not available. Depends on: UtilityHub Cloudflare Pages Function; Cloudflare Browser Rendering API (requires account configuration) |
| 289 | [Website Status Checker](../app/tools/[slug]/page.tsx) `/tools/website-status-checker` | 🔌 API / server | Browsers block cross-site requests, so the page is fetched by UtilityHub's Cloudflare Pages Function (public URLs only, 3 MB limit, private networks blocked). Some sites block automated requests. Depends on: UtilityHub Cloudflare Pages Function |
| 290 | [HTTP Header Checker](../app/tools/[slug]/page.tsx) `/tools/http-header-checker` | 🔌 API / server | Browsers block cross-site requests, so the page is fetched by UtilityHub's Cloudflare Pages Function (public URLs only, 3 MB limit, private networks blocked). Some sites block automated requests. Depends on: UtilityHub Cloudflare Pages Function |
| 291 | [DNS Lookup](../app/tools/[slug]/page.tsx) `/tools/dns-lookup` | ✅ Full | Depends on: Cloudflare DNS over HTTPS (1.1.1.1); Google Public DNS over HTTPS (optional) |
| 292 | [WHOIS Lookup](../app/tools/[slug]/page.tsx) `/tools/whois-lookup` | 🔌 API / server | Queries registry RDAP servers through UtilityHub's Cloudflare function. Some country-code domains don't offer RDAP yet, in which case no record is returned. Depends on: UtilityHub Cloudflare Pages Function; RDAP registry data via IANA bootstrap / rdap.org |
| 293 | [IP Address Lookup](../app/tools/[slug]/page.tsx) `/tools/ip-address-lookup` | 🔌 API / server | Uses RDAP through UtilityHub's Cloudflare function. It identifies network ownership, not a device's precise physical location. Depends on: UtilityHub Cloudflare Pages Function; RDAP registry data via rdap.org |
| 294 | [My IP Address](../app/tools/[slug]/page.tsx) `/tools/my-ip-address` | 🔌 API / server | Read from the request by UtilityHub's Cloudflare function (the browser cannot see its own public IP). Location is an IP-based estimate. Depends on: UtilityHub Cloudflare Pages Function |
| 295 | [User Agent Checker](../app/tools/[slug]/page.tsx) `/tools/user-agent-checker` | ✅ Full |  |
| 296 | [Meta Tag Analyzer](../app/tools/[slug]/page.tsx) `/tools/meta-tag-analyzer` | 🔌 API / server | Browsers block cross-site requests, so the page is fetched by UtilityHub's Cloudflare Pages Function (public URLs only, 3 MB limit, private networks blocked). Some sites block automated requests. Pasting HTML works without the server. Depends on: UtilityHub Cloudflare Pages Function |
| 297 | [Open Graph Preview](../app/tools/[slug]/page.tsx) `/tools/open-graph-preview` | 🔌 API / server | Browsers block cross-site requests, so the page is fetched by UtilityHub's Cloudflare Pages Function (public URLs only, 3 MB limit, private networks blocked). Some sites block automated requests. Pasting meta tags works without the server. Depends on: UtilityHub Cloudflare Pages Function |
| 298 | [Robots.txt Generator](../app/tools/[slug]/page.tsx) `/tools/robots-txt-generator` | ✅ Full |  |
| 299 | [Sitemap Generator](../app/tools/[slug]/page.tsx) `/tools/sitemap-generator` | ✅ Full |  |
| 300 | [Website Word Counter](../app/tools/[slug]/page.tsx) `/tools/website-word-counter` | 🔌 API / server | Browsers block cross-site requests, so the page is fetched by UtilityHub's Cloudflare Pages Function (public URLs only, 3 MB limit, private networks blocked). Some sites block automated requests. Depends on: UtilityHub Cloudflare Pages Function |
| 301 | [HTML Viewer](../app/tools/[slug]/page.tsx) `/tools/html-viewer` | 🔌 API / server | Browsers block cross-site requests, so the page is fetched by UtilityHub's Cloudflare Pages Function (public URLs only, 3 MB limit, private networks blocked). Some sites block automated requests. Pasting HTML works without the server. Depends on: UtilityHub Cloudflare Pages Function |
| 302 | [Website Link Extractor](../app/tools/[slug]/page.tsx) `/tools/website-link-extractor` | 🔌 API / server | Browsers block cross-site requests, so the page is fetched by UtilityHub's Cloudflare Pages Function (public URLs only, 3 MB limit, private networks blocked). Some sites block automated requests. Depends on: UtilityHub Cloudflare Pages Function |
| 303 | [Broken Link Checker](../app/tools/[slug]/page.tsx) `/tools/broken-link-checker` | 🔌 API / server | Browsers block cross-site requests, so the page is fetched by UtilityHub's Cloudflare Pages Function (public URLs only, 3 MB limit, private networks blocked). Some sites block automated requests. Up to 500 links are checked per page. Depends on: UtilityHub Cloudflare Pages Function |
| 304 | [SSL Certificate Checker](../app/tools/[slug]/page.tsx) `/tools/ssl-certificate-checker` | 🔌 API / server | Cloudflare Workers cannot read the peer certificate of a TLS connection, so certificate details come from Certificate Transparency logs (crt.sh) combined with a live HTTPS reachability check – not from inspecting the handshake itself. The certificate a server actually presents could differ in rare cases. Depends on: UtilityHub Cloudflare Pages Function; Certificate Transparency logs via crt.sh |

