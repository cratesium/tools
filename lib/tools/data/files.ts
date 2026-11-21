import type { ToolDefinition } from "@/types/tool";

type FileInput = Omit<ToolDefinition, "category" | "status" | "addedAt"> & Partial<Pick<ToolDefinition, "status" | "addedAt">>;
const file = (t: FileInput): ToolDefinition => ({ category: "files", status: "full", addedAt: "2026-11-21", ...t });

const FS_NOTE = "In-place changes use the File System Access API (Chrome, Edge and other Chromium browsers). Other browsers get the same result as a ZIP download.";

export const filesTools: ToolDefinition[] = [
  file({
    id: 269,
    name: "File Renamer",
    slug: "file-renamer",
    shortDescription: "Rename a single file instantly – download a renamed copy or rename the original in Chrome and Edge.",
    description:
      "The File Renamer gives any file a new name without opening a file manager. Characters that operating systems forbid in file names are replaced automatically, and the extension is preserved unless you change it. Download a renamed copy in any browser, or – in Chromium browsers that support FileSystemFileHandle.move() – pick the file and rename the original on disk.",
    inputFormats: ["Any file"],
    outputFormats: ["Renamed file"],
    processor: "files.rename",
    statusNote: FS_NOTE,
    status: "partial",
    seoTitle: "File Renamer – Rename a File Online in Your Browser",
    seoDescription:
      "Rename any file online: download a renamed copy, or rename the original in place in Chrome and Edge. Invalid characters are fixed automatically.",
    instructions: [
      "Drop a file, or click “Pick a file to rename in place” in Chrome/Edge.",
      "Type the new name (the name part is pre-selected).",
      "Download the renamed copy, or click Rename original.",
    ],
    faqs: [
      { q: "Does this change my original file?", a: "Only when you use “Pick a file to rename in place” and click Rename original in a browser that supports it. Otherwise a renamed copy is downloaded and the original stays untouched." },
      { q: "Which characters are not allowed?", a: "/ \\ : * ? \" < > | and control characters are replaced, because Windows, macOS or Linux reject them in file names." },
      { q: "Is the file uploaded?", a: "No. Renaming happens entirely in your browser." },
    ],
    related: ["bulk-file-renamer", "file-extension-changer", "file-name-extractor", "file-organizer"],
    keywords: ["rename file", "change file name"],
  }),
  file({
    id: 270,
    name: "Bulk File Renamer",
    slug: "bulk-file-renamer",
    shortDescription: "Rename hundreds of files at once with find and replace, regex, numbering, prefixes and case changes.",
    description:
      "The Bulk File Renamer applies rename rules to a whole folder or selection: find and replace (plain text or regular expressions with $1 groups), prefixes and suffixes, sequence numbers with padding, case conversion, new extensions and whitespace cleanup. A live preview shows every old and new name, numbering is scoped per folder and clashes are resolved automatically. Download the result as a ZIP or rename in place in Chrome and Edge.",
    inputFormats: ["Folder", "Multiple files"],
    outputFormats: ["ZIP", "Renamed in place"],
    processor: "files.bulk-rename",
    status: "partial",
    statusNote: FS_NOTE,
    seoTitle: "Bulk File Renamer – Batch Rename Files Online with Regex",
    seoDescription:
      "Batch rename files online: find and replace, regex, numbering, prefix, suffix, case and extension changes with live preview. ZIP or in-place.",
    instructions: [
      "Drop a folder or choose files (in Chrome/Edge, “Open folder (read & write)” enables in-place renaming).",
      "Set rules such as find and replace, numbering or case.",
      "Check the preview table – conflicts are highlighted.",
      "Download the renamed files as a ZIP, or rename them in place.",
    ],
    faqs: [
      { q: "How do I number photos like Holiday-001.jpg?", a: "Enable sequence numbers with 3 digits and position “Replace name”, then add the prefix “Holiday” with separator “-”." },
      { q: "Can I use regular expressions?", a: "Yes. Tick Regular expression to use JavaScript regex syntax, with $1, $2 referring to capture groups, e.g. find (\\d{4})-(\\d{2}) and replace $2-$1." },
      { q: "What happens if two files end up with the same name?", a: "The later one gets a “(2)” suffix and is highlighted in the preview, so nothing is overwritten." },
      { q: "Is renaming in place reversible?", a: "Not automatically. Download a ZIP first or keep a backup if you may need the original names." },
    ],
    related: ["file-renamer", "file-organizer", "file-extension-changer", "file-list-generator"],
    keywords: ["batch rename", "rename multiple files", "mass rename"],
    popular: true,
    featured: true,
  }),
  file({
    id: 271,
    name: "File Size Checker",
    slug: "file-size-checker",
    shortDescription: "Check exact file sizes in bytes, KB/KiB, MB/MiB and GB for one or many files, with totals.",
    description:
      "The File Size Checker shows the exact size of each file you drop – in bytes and human-readable units – sorted from largest to smallest with each file's share of the total. Totals are converted into both decimal (KB, MB, GB) and binary (KiB, MiB, GiB) units, which explains why a “500 GB” drive shows 465 GB in your OS. Only file sizes are read; content is never opened.",
    inputFormats: ["Any files"],
    outputFormats: ["Size report", "CSV"],
    processor: "files.size",
    seoTitle: "File Size Checker – Exact File Size in Bytes, KB, MB & GB",
    seoDescription:
      "Check file sizes online in bytes, KB, KiB, MB, MiB and GB. Totals for many files, largest first, CSV export. Files are never uploaded.",
    instructions: [
      "Drop one or more files.",
      "Read each size in bytes and readable units.",
      "Check the total in decimal and binary units.",
      "Export the list as CSV if needed.",
    ],
    faqs: [
      { q: "What is the difference between MB and MiB?", a: "1 MB = 1,000,000 bytes (decimal), while 1 MiB = 1,048,576 bytes (binary). Storage makers use MB/GB; Windows reports binary values but labels them MB/GB." },
      { q: "Will it work for an email attachment limit?", a: "Yes. Compare the total with your provider's limit – Gmail allows 25 MB, which is measured in decimal units for most providers." },
      { q: "Does it read my files' contents?", a: "No. The size comes from file metadata; contents are never read." },
    ],
    related: ["folder-size-calculator", "file-type-checker", "file-metadata-viewer", "file-compressor"],
    keywords: ["check file size", "file size in mb", "bytes to mb"],
  }),
  file({
    id: 272,
    name: "File Type Checker",
    slug: "file-type-checker",
    shortDescription: "Identify what a file really is from its magic bytes and spot extensions that don't match the content.",
    description:
      "The File Type Checker reads the first bytes of each file and matches them against more than 80 known signatures – images, documents, archives, audio, video, executables and more – to identify the true format regardless of the extension. It flags mismatches such as an .exe renamed to .pdf, recognises legitimate alternative extensions, detects plain text encodings and shows the raw leading bytes.",
    inputFormats: ["Any files"],
    outputFormats: ["Type report"],
    processor: "files.type",
    seoTitle: "File Type Checker – Detect Real File Format by Magic Bytes",
    seoDescription:
      "Find out what a file really is from its signature (magic bytes), not its extension. Detects renamed or disguised files. Private, no upload.",
    instructions: [
      "Drop one or more files.",
      "Read the detected format and MIME type.",
      "Check whether the extension matches the content.",
      "Inspect the first bytes if you need more detail.",
    ],
    faqs: [
      { q: "What are magic bytes?", a: "Most file formats begin with a fixed signature – PDF files start with %PDF, PNG with \\x89PNG, ZIP with PK. Reading them reveals the real type even if the extension was changed." },
      { q: "Why is a .docx detected as ZIP?", a: "DOCX, XLSX, PPTX, EPUB, APK and JAR files are ZIP archives internally; they are recognised as valid alternatives." },
      { q: "Is a mismatch dangerous?", a: "Not always, but a document that is actually an executable is a classic malware trick. Don't open mismatched files you didn't expect." },
    ],
    related: ["file-extension-changer", "file-metadata-viewer", "file-decompressor", "file-size-checker"],
    keywords: ["what file type is this", "magic bytes", "file signature checker"],
  }),
  file({
    id: 273,
    name: "File Extension Changer",
    slug: "file-extension-changer",
    shortDescription: "Change or remove the extension of one or many files and download the renamed copies.",
    description:
      "The File Extension Changer renames the extension of files in bulk – for example .jpeg to .jpg, .txt to .csv, or removing an extension entirely – and gives you renamed copies to download individually or as a ZIP. It is a rename, not a conversion: the contents stay exactly the same, which is what you want when a file simply has the wrong suffix.",
    inputFormats: ["Any files"],
    outputFormats: ["Renamed files", "ZIP"],
    processor: "files.extension",
    seoTitle: "File Extension Changer – Change File Extensions in Bulk",
    seoDescription:
      "Change or remove file extensions for one or many files online, e.g. .jpeg to .jpg or .txt to .csv. Download copies or a ZIP. No upload.",
    instructions: [
      "Add one or more files.",
      "Type the new extension without the dot (or leave empty to remove it).",
      "Download the renamed copies individually or all as a ZIP.",
    ],
    faqs: [
      { q: "Will changing .png to .jpg convert my image?", a: "No – the bytes stay PNG. Use the PNG to JPG converter to change the actual format." },
      { q: "When is changing the extension useful?", a: "When a file has the wrong or missing suffix, e.g. a CSV saved as .txt, or .jpeg files that a system only accepts as .jpg." },
      { q: "How do I know the correct extension?", a: "Use the File Type Checker, which identifies the real format from the file's contents." },
    ],
    related: ["file-type-checker", "bulk-file-renamer", "file-renamer", "image-converter"],
    keywords: ["change extension", "rename extension", "remove file extension"],
  }),
  file({
    id: 274,
    name: "File Metadata Viewer",
    slug: "file-metadata-viewer",
    shortDescription: "See everything a file reveals: size, dates, real type, hashes, EXIF/GPS, PDF info and Office properties.",
    description:
      "The File Metadata Viewer combines file-system details – size, last modified date, browser MIME type – with the detected format, MD5 and SHA-256 hashes, and embedded metadata: EXIF, IPTC, XMP and GPS location for photos (with a map link), the PDF Info dictionary, and author, company and dates from Word, Excel and PowerPoint files. A quick way to check what you're about to share.",
    inputFormats: ["Any file"],
    outputFormats: ["Metadata report"],
    processor: "files.metadata",
    seoTitle: "File Metadata Viewer – See EXIF, PDF & Office Metadata",
    seoDescription:
      "View file metadata online: size, dates, real type, hashes, photo EXIF and GPS, PDF properties and Office author info. Runs in your browser.",
    instructions: [
      "Drop a file.",
      "Review the file-system details and hashes.",
      "Scroll through embedded metadata such as EXIF or document properties.",
      "Use File Metadata Remover if you want to strip it.",
    ],
    faqs: [
      { q: "Can photos reveal my location?", a: "Yes, if the camera saved GPS coordinates in EXIF. The viewer shows them with a map link so you can check before sharing." },
      { q: "What metadata do Office files contain?", a: "Typically the author, last modified by, company, creation and modification dates, total editing time and application version." },
      { q: "Is the file uploaded?", a: "No. All parsing (exifr, pdf-lib, JSZip) happens locally." },
    ],
    related: ["file-metadata-remover", "image-metadata-viewer", "pdf-metadata-editor", "file-type-checker"],
    keywords: ["file properties", "exif viewer", "document metadata"],
  }),
  file({
    id: 275,
    name: "File Metadata Remover",
    slug: "file-metadata-remover",
    shortDescription: "Strip EXIF/GPS from photos, author info from PDFs and Office files before sharing – images stay lossless.",
    description:
      "The File Metadata Remover cleans hidden information from several file types at once. JPEG, PNG and WebP images have EXIF, GPS, XMP and comments removed losslessly (pixels are not re-encoded), with options to keep the colour profile and orientation. PDFs have title, author, producer, dates and XMP metadata cleared, and Word, Excel and PowerPoint files have author, company and custom properties removed.",
    inputFormats: ["JPEG", "PNG", "WebP", "PDF", "DOCX", "XLSX", "PPTX"],
    outputFormats: ["Cleaned files", "ZIP"],
    processor: "files.metadata-remove",
    status: "partial",
    statusNote:
      "Supported: JPEG, PNG and WebP (lossless), PDF and Office Open XML (DOCX/XLSX/PPTX). Other formats such as video, audio or HEIC are left unchanged, and comments or tracked changes inside Office documents are not removed.",
    seoTitle: "File Metadata Remover – Strip EXIF, GPS & Author Info",
    seoDescription:
      "Remove metadata from photos (lossless EXIF/GPS removal), PDFs and Office documents before sharing. Batch processing, fully in your browser.",
    instructions: [
      "Add photos, PDFs or Office documents.",
      "Choose whether to keep the colour profile and orientation for images.",
      "Click Remove metadata and review the summary.",
      "Download the cleaned files.",
    ],
    faqs: [
      { q: "Does removing EXIF reduce image quality?", a: "No. Metadata segments are removed from the file structure directly; the compressed image data is untouched." },
      { q: "Why keep orientation?", a: "Phones often store photos sideways with an orientation tag. Keeping just that tag ensures the photo still displays upright." },
      { q: "Are Office comments removed?", a: "No. Only document properties are cleared. Use your office suite's “Inspect Document” feature to remove comments and tracked changes." },
    ],
    related: ["file-metadata-viewer", "image-metadata-remover", "video-metadata-remover", "pdf-metadata-editor"],
    keywords: ["remove exif", "strip metadata", "remove gps from photo"],
  }),
  file({
    id: 276,
    name: "File Hash Checker",
    slug: "file-hash-checker",
    shortDescription: "Get MD5, SHA-1, SHA-256, SHA-512 and CRC32 of files at a glance and highlight a matching hash.",
    description:
      "The File Hash Checker computes the five most commonly published hashes for each file you add – MD5, SHA-1, SHA-256, SHA-512 and CRC32 – in a single streamed pass. Paste a hash from a website or email and any matching value lights up instantly, without having to know which algorithm was used. It is a quick way to confirm two copies are identical or a download is genuine.",
    inputFormats: ["Any files"],
    outputFormats: ["Hashes"],
    processor: "files.hash",
    seoTitle: "File Hash Checker – MD5, SHA-1, SHA-256 & CRC32 of Files",
    seoDescription:
      "Check file hashes online: MD5, SHA-1, SHA-256, SHA-512 and CRC32 in one pass, with automatic match highlighting. Large files supported, no upload.",
    instructions: [
      "Drop one or more files.",
      "Optionally paste a known hash to compare.",
      "Read or copy the hashes; matches are highlighted.",
    ],
    faqs: [
      { q: "How is this different from the File Checksum Verifier?", a: "The verifier focuses on a pass/fail check against one expected checksum. The hash checker shows every common hash of several files side by side." },
      { q: "Can I compare two files with it?", a: "Yes – add both and compare their SHA-256 values. For byte-level detail, use the File Comparison Tool." },
      { q: "Are large files supported?", a: "Yes. Files are hashed in 4 MB chunks with real progress." },
    ],
    related: ["file-checksum-verifier", "file-checksum-generator", "file-comparison-tool", "duplicate-file-finder"],
    keywords: ["file hash", "md5 checker", "sha256 file checker"],
  }),
  file({
    id: 277,
    name: "Duplicate File Finder",
    slug: "duplicate-file-finder",
    shortDescription: "Find byte-identical duplicate files in a folder and see how much space they waste.",
    description:
      "The Duplicate File Finder scans a folder and its subfolders for exact duplicates. It first groups files by size, then hashes only same-size candidates with SHA-256, so even large photo or download folders are scanned quickly and matches are guaranteed identical. Results are grouped with the space you could reclaim, and a report can be downloaded. Nothing is deleted automatically.",
    inputFormats: ["Folder"],
    outputFormats: ["Duplicate report"],
    processor: "files.duplicates",
    seoTitle: "Duplicate File Finder – Find Identical Files in a Folder",
    seoDescription:
      "Find duplicate files online by content (SHA-256), not just name. Scan folders, see wasted space and download a report. Nothing is uploaded.",
    instructions: [
      "Drop a folder or choose it with the button.",
      "Wait for the scan – only same-size files are hashed.",
      "Review the duplicate groups and wasted space.",
      "Download the report and delete copies you don't need yourself.",
    ],
    faqs: [
      { q: "Does it find similar photos?", a: "No. It finds byte-for-byte identical files. Edited, resized or re-saved images are different files." },
      { q: "Will it delete anything?", a: "No. It only reports duplicates; you decide what to remove." },
      { q: "How fast is it?", a: "Files with a unique size are skipped without reading them, so a folder of thousands of photos usually needs only a fraction to be hashed." },
    ],
    related: ["folder-size-calculator", "folder-comparison-tool", "file-hash-checker", "file-organizer"],
    keywords: ["find duplicates", "duplicate files", "identical files"],
  }),
  file({
    id: 278,
    name: "Folder Size Calculator",
    slug: "folder-size-calculator",
    shortDescription: "See what's taking up space: a sortable folder tree with sizes, percentages and a breakdown by file type.",
    description:
      "The Folder Size Calculator totals a folder and every subfolder, presenting an expandable tree sorted by size, name or file count with percentage bars, like a disk-usage analyser. A breakdown by extension shows which file types use the most space. Only sizes and names are read, so even folders with tens of thousands of files are analysed in seconds.",
    inputFormats: ["Folder"],
    outputFormats: ["Folder tree", "Type breakdown"],
    processor: "files.folder-size",
    seoTitle: "Folder Size Calculator – See What's Using Disk Space",
    seoDescription:
      "Calculate folder sizes online with an expandable tree, percentages and a breakdown by file type. Find space hogs fast. Private, no upload.",
    instructions: [
      "Drop a folder or choose it.",
      "Expand subfolders in the tree to drill down.",
      "Sort by size, name or number of files.",
      "Check the file-type breakdown.",
    ],
    faqs: [
      { q: "Why does the size differ from my OS?", a: "Operating systems may report “size on disk”, which includes block overhead, and may use binary units. This tool totals the actual file sizes." },
      { q: "Are hidden files included?", a: "Yes, if your browser provides them. Some browsers skip system files when you choose a folder." },
      { q: "Is anything uploaded?", a: "No. Only file names and sizes are read locally." },
    ],
    related: ["duplicate-file-finder", "file-size-checker", "file-organizer", "file-list-generator"],
    keywords: ["folder size", "disk usage", "directory size"],
  }),
  file({
    id: 279,
    name: "File Comparison Tool",
    slug: "file-comparison-tool",
    shortDescription: "Check whether two files are identical byte for byte, find the first difference and diff text files.",
    description:
      "The File Comparison Tool compares two files of any type byte by byte in chunks, reporting whether they are identical, the offset of the first difference and how many bytes differ, along with both SHA-256 hashes. If both files are text, a line-by-line diff highlights additions and removals. Use it to confirm backups, compare builds or check two downloads.",
    inputFormats: ["Any two files"],
    outputFormats: ["Comparison report"],
    processor: "files.compare",
    seoTitle: "File Comparison Tool – Compare Two Files Byte by Byte",
    seoDescription:
      "Compare two files online: identical or not, first differing byte, SHA-256 hashes and a line diff for text files. Works with any file type.",
    instructions: [
      "Add file A and file B.",
      "Click Compare files.",
      "Read the result, the first difference and the hashes.",
      "For text files, review the highlighted line diff.",
    ],
    faqs: [
      { q: "Can it compare different file types?", a: "Yes, any two files can be compared as bytes. A text diff is shown only when both look like text and are under 5 MB." },
      { q: "What does “first difference at offset” mean?", a: "The position in bytes, counting from zero, where the files first differ – useful for binary analysis." },
      { q: "How large can the files be?", a: "Files are read in 4 MB chunks, so multi-gigabyte comparisons are possible." },
    ],
    related: ["text-diff-checker", "compare-pdf", "folder-comparison-tool", "file-hash-checker"],
    keywords: ["compare files", "binary compare", "file diff"],
  }),
  file({
    id: 280,
    name: "Folder Comparison Tool",
    slug: "folder-comparison-tool",
    shortDescription: "Compare two folders to find files that are missing, extra or changed – like a sync preview.",
    description:
      "The Folder Comparison Tool matches two folder trees by relative path and reports files only in A, only in B, and files that changed. With content comparison on, same-size files are hashed with xxHash64 so identical files are confirmed and silent edits are caught. Export the result as CSV. Ideal for checking backups, deployments or copies on external drives.",
    inputFormats: ["Two folders"],
    outputFormats: ["Comparison report", "CSV"],
    processor: "files.folder-compare",
    seoTitle: "Folder Comparison Tool – Compare Two Folders Online",
    seoDescription:
      "Compare two folders: find missing, extra and changed files by path, size and content hash. Verify backups and copies. Export CSV. Private.",
    instructions: [
      "Choose folder A (e.g. the original).",
      "Choose folder B (e.g. the backup).",
      "Keep content comparison on for an exact check.",
      "Review the differences and export the CSV.",
    ],
    faqs: [
      { q: "How are files matched?", a: "By relative path within each folder, so sub/a.txt in A is compared with sub/a.txt in B." },
      { q: "Does it detect renamed files?", a: "No. A renamed file appears as missing in one folder and extra in the other. Use Duplicate File Finder across both to spot moves." },
      { q: "Why use xxHash64 instead of SHA-256?", a: "It is many times faster and perfectly reliable for detecting accidental differences between copies." },
    ],
    related: ["file-comparison-tool", "compare-archive-files", "duplicate-file-finder", "folder-size-calculator"],
    keywords: ["compare folders", "directory diff", "backup verification"],
  }),
  file({
    id: 281,
    name: "File Merger",
    slug: "file-merger",
    shortDescription: "Join split file parts (.001, .002…) back together, or combine text files with a separator.",
    description:
      "The File Merger concatenates files in the order you choose. In byte mode it rejoins parts produced by the File Splitter, 7-Zip, HJSplit or the split command into the original file. In text mode it combines text, CSV or log files with a separator such as a blank line. Parts are sorted naturally by name, and the merge is instant because the browser streams the parts into one Blob.",
    inputFormats: ["File parts", "Text files"],
    outputFormats: ["Merged file"],
    processor: "files.merge",
    seoTitle: "File Merger – Join Split Files (.001 .002) Online",
    seoDescription:
      "Merge split file parts like .001 and .002 back into the original, or combine text files with a separator. Reorder parts. Runs locally.",
    instructions: [
      "Add all the parts or files.",
      "Check the order (parts are sorted naturally) and adjust with the arrows.",
      "Choose byte or text mode and the output name.",
      "Merge and download.",
    ],
    faqs: [
      { q: "Can it rejoin files split by 7-Zip or HJSplit?", a: "Yes. Those tools produce raw byte parts (.001, .002 …) that are rejoined by simple concatenation." },
      { q: "Can I merge CSV files with headers?", a: "Text mode joins files as-is, so headers would repeat. Use the CSV Merger to combine CSVs properly." },
      { q: "Is there a size limit?", a: "Merging is done by reference without copying into memory first, so large files work, limited by browser download limits." },
    ],
    related: ["file-splitter", "csv-merger", "merge-pdf", "audio-merger"],
    keywords: ["join files", "combine split files", "merge 001 files"],
  }),
  file({
    id: 282,
    name: "File Splitter",
    slug: "file-splitter",
    shortDescription: "Split large files into smaller parts by size or count to fit email, upload or USB limits.",
    description:
      "The File Splitter cuts any file into byte-exact parts – by a fixed size such as 25 MB, or into a chosen number of pieces. Parts are named file.001, file.002 and so on, the format understood by 7-Zip, the File Merger and the standard cat/copy commands, so the original can be rebuilt anywhere. Download parts individually or together as a ZIP.",
    inputFormats: ["Any file"],
    outputFormats: ["File parts", "ZIP"],
    processor: "files.split",
    seoTitle: "File Splitter – Split Large Files into Parts Online",
    seoDescription:
      "Split large files into smaller parts by size or number of pieces. Rejoin with File Merger, 7-Zip or cat. Works in your browser, no upload.",
    instructions: [
      "Add the file to split.",
      "Choose a part size or number of parts.",
      "Click Split file.",
      "Download the parts or the ZIP, and keep them together.",
    ],
    faqs: [
      { q: "How do I put the file back together?", a: "Use the File Merger, 7-Zip (open .001), or run cat file.* > file on macOS/Linux, or copy /b file.001+file.002 file on Windows." },
      { q: "Does splitting compress the file?", a: "No, parts add up to exactly the original size. Compress first with the ZIP Creator if you also want it smaller." },
      { q: "What's the maximum number of parts?", a: "Up to 1,000 parts per file." },
    ],
    related: ["file-merger", "csv-splitter", "split-pdf", "zip-creator"],
    keywords: ["split file", "file chopper", "split large file"],
  }),
  file({
    id: 283,
    name: "File List Generator",
    slug: "file-list-generator",
    shortDescription: "Turn a folder into a list of files as text, CSV, JSON or a Markdown table, with sizes and dates.",
    description:
      "The File List Generator creates an inventory of a folder's contents for documentation, audits or catalogues. Choose plain text, CSV (safe against spreadsheet formula injection), JSON or a Markdown table, include the relative path, size (exact or human-readable), modification date and extension, and sort by path, name, size or date. Copy or download the list.",
    inputFormats: ["Folder", "Files"],
    outputFormats: ["TXT", "CSV", "JSON", "Markdown"],
    processor: "files.list",
    seoTitle: "File List Generator – Export Folder Contents to CSV or Text",
    seoDescription:
      "Generate a list of files in a folder as text, CSV, JSON or Markdown, with paths, sizes and dates. Sort and copy instantly. Private.",
    instructions: [
      "Drop a folder or choose files.",
      "Pick the output format and sort order.",
      "Choose which columns to include.",
      "Copy or download the list.",
    ],
    faqs: [
      { q: "Can I open the CSV in Excel?", a: "Yes. Values that could be interpreted as formulas are prefixed to prevent spreadsheet formula injection." },
      { q: "Are subfolders included?", a: "Yes, recursively, with paths relative to the chosen folder." },
      { q: "Is this like the dir or ls command?", a: "Similar, but formatted for sharing and without needing a terminal." },
    ],
    related: ["file-name-extractor", "folder-size-calculator", "sitemap-generator", "csv-viewer"],
    keywords: ["list files in folder", "directory listing", "folder contents to csv"],
  }),
  file({
    id: 284,
    name: "File Name Extractor",
    slug: "file-name-extractor",
    shortDescription: "Copy the names of many files at once – with or without extensions, paths, quotes or custom separators.",
    description:
      "The File Name Extractor pulls out file names from a selection or folder so you can paste them into a spreadsheet, script or message. Choose names with or without extensions, relative paths or just the distinct extensions, sort naturally, remove duplicates, join with new lines, commas or any separator, and wrap each name in quotes. It's far quicker than copying names one by one.",
    inputFormats: ["Files", "Folder"],
    outputFormats: ["Text"],
    processor: "files.names",
    seoTitle: "File Name Extractor – Copy Multiple File Names at Once",
    seoDescription:
      "Extract file names from files or folders: with or without extensions, paths, sorting, quotes and custom separators. Copy as text instantly.",
    instructions: [
      "Drop files or a folder.",
      "Choose names, names without extension, paths or extensions.",
      "Set separator, quoting, sorting and duplicate removal.",
      "Copy or download the result.",
    ],
    faqs: [
      { q: "How do I get a comma-separated list?", a: "Set the separator to “, ” and optionally wrap each name in quotes for SQL or code." },
      { q: "Can I list only the file types in a folder?", a: "Choose “Extensions” and tick Remove duplicates to get the distinct extensions." },
      { q: "Are files opened?", a: "No, only names are read." },
    ],
    related: ["file-list-generator", "bulk-file-renamer", "remove-duplicate-lines", "sort-lines-alphabetically"],
    keywords: ["copy file names", "get file names", "list file names"],
  }),
  file({
    id: 285,
    name: "File Organizer",
    slug: "file-organizer",
    shortDescription: "Sort a messy folder into subfolders by type, extension, year, month or size – as a ZIP or in place.",
    description:
      "The File Organizer tidies folders like Downloads by moving each file into a subfolder based on the rule you choose: category (Images, Documents, Videos, Archives…), extension, year or year/month of last modification, or size bucket. Preview the planned folders first, then download an organised ZIP copy in any browser, or reorganise the real folder in place in Chrome and Edge.",
    inputFormats: ["Folder"],
    outputFormats: ["Organised ZIP", "Organised in place"],
    processor: "files.organize",
    status: "partial",
    statusNote: FS_NOTE,
    seoTitle: "File Organizer – Sort Files into Folders by Type or Date",
    seoDescription:
      "Organise files automatically into folders by type, extension, year, month or size. Preview, then download a ZIP or reorganise in place.",
    instructions: [
      "Drop a folder (use “Open folder (read & write)” in Chrome/Edge for in-place changes).",
      "Choose how to organise: type, extension, date or size.",
      "Review the planned folders.",
      "Download the organised ZIP or organise the folder in place.",
    ],
    faqs: [
      { q: "Which categories are used?", a: "Images, Videos, Audio, Documents, Spreadsheets, Presentations, Archives, Code, Fonts, Executables and Other, based on file extension." },
      { q: "Is organising in place safe?", a: "Files are moved, not deleted, and name clashes are resolved automatically. Still, keep a backup of important folders before bulk changes." },
      { q: "Which date is used for year/month folders?", a: "The file's last-modified date, as reported by your operating system." },
    ],
    related: ["bulk-file-renamer", "duplicate-file-finder", "folder-size-calculator", "file-list-generator"],
    keywords: ["organize files", "sort files into folders", "clean downloads folder"],
  }),
];
