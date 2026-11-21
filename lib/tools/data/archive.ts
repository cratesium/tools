import type { ToolDefinition } from "@/types/tool";

type ArcInput = Omit<ToolDefinition, "category" | "status" | "addedAt"> & Partial<Pick<ToolDefinition, "status" | "addedAt">>;
const arc = (t: ArcInput): ToolDefinition => ({ category: "archive", status: "full", addedAt: "2026-11-21", ...t });

const LIBARCHIVE = "libarchive.js WebAssembly engine (~1 MB, served by UtilityHub)";

export const archiveTools: ToolDefinition[] = [
  arc({
    id: 126,
    name: "ZIP Extractor",
    slug: "zip-extractor",
    shortDescription: "Open ZIP files in your browser, preview contents and download files – including AES-encrypted ZIPs.",
    description:
      "The ZIP Extractor lists everything inside a ZIP archive with sizes and dates, lets you preview text, images and PDFs, and download individual files. In Chrome and Edge you can extract the whole archive straight into a folder. Password-protected ZIPs (AES-256 or legacy ZipCrypto) open when you enter the password, every file is CRC-checked as it is read, and paths that try to escape the folder are blocked.",
    inputFormats: ["ZIP", "JAR", "APK", "DOCX/XLSX (as ZIP)"],
    outputFormats: ["Extracted files", "Folder"],
    processor: "archive.extract",
    processorOptions: { format: "zip" },
    seoTitle: "ZIP Extractor – Unzip Files Online Without Uploading",
    seoDescription:
      "Unzip files online in your browser. Preview and download files, extract to a folder, and open password-protected AES ZIPs. Nothing is uploaded.",
    instructions: [
      "Drop a .zip file onto the page.",
      "Enter the password if the archive is encrypted.",
      "Preview or download individual files from the list.",
      "Use “Extract to folder” (Chrome/Edge) to save everything at once.",
    ],
    faqs: [
      { q: "Is my ZIP uploaded?", a: "No. The archive is read with zip.js inside your browser; files never leave your device." },
      { q: "Can it open password-protected ZIPs?", a: "Yes, if you know the password. AES-256 and ZipCrypto are both supported. The tool cannot recover forgotten passwords." },
      { q: "Why can't I download all files at once in Firefox or Safari?", a: "Those browsers don't let websites write folders. Download files individually, or use Chrome or Edge for one-click extraction to a folder." },
      { q: "What about “zip slip” attacks?", a: "Entries whose paths contain “..” or absolute drive letters are skipped when extracting to a folder, so a malicious archive cannot write outside the chosen directory." },
    ],
    related: ["zip-creator", "rar-extractor", "7z-extractor", "test-archive-integrity", "file-decompressor"],
    keywords: ["unzip online", "open zip file", "extract zip"],
    popular: true,
  }),
  arc({
    id: 127,
    name: "ZIP Creator",
    slug: "zip-creator",
    shortDescription: "Create ZIP archives from files or whole folders, with compression level and optional AES-256 password.",
    description:
      "The ZIP Creator packs files and folders into a ZIP archive entirely in your browser. Folder structure is preserved, duplicate names are renamed automatically, and you can choose the compression level from store to maximum. Add a password with strong AES-256 encryption (or legacy ZipCrypto for Windows Explorer compatibility) and an archive comment. Progress is reported per byte processed.",
    inputFormats: ["Any files", "Folders"],
    outputFormats: ["ZIP"],
    processor: "archive.zip-create",
    seoTitle: "ZIP Creator – Make ZIP Files Online with Password (AES-256)",
    seoDescription:
      "Create ZIP files online from files or folders. Choose compression level and add AES-256 password protection. Processed locally, no upload.",
    instructions: [
      "Add files, or drop a folder to keep its structure.",
      "Name the archive and pick a compression level.",
      "Optionally set a password and encryption type.",
      "Create the ZIP and download it.",
    ],
    faqs: [
      { q: "Which encryption should I choose?", a: "AES-256 is secure and supported by 7-Zip, WinRAR, macOS Archive Utility and most modern tools. ZipCrypto opens in Windows Explorer without extra software but is easily cracked." },
      { q: "Are file names encrypted too?", a: "No. The ZIP format encrypts file contents only; names and sizes remain visible. Put files inside a second encrypted archive if names are sensitive." },
      { q: "Is there a size limit?", a: "Files are streamed from disk, so archives of several gigabytes are possible, limited by your browser's memory for the final output." },
    ],
    related: ["zip-extractor", "archive-password-generator", "file-compressor", "zip-file-converter"],
    keywords: ["create zip", "zip files online", "password protect zip"],
  }),
  arc({
    id: 128,
    name: "RAR Extractor",
    slug: "rar-extractor",
    shortDescription: "Extract RAR and RAR5 archives in your browser with libarchive – no WinRAR needed.",
    description:
      "The RAR Extractor opens RAR 4 and RAR5 archives using libarchive compiled to WebAssembly, running in a background worker. Browse the contents, preview files, download them individually, as a ZIP, or into a folder in Chrome and Edge. Encrypted RAR archives can be opened with their password where libarchive supports the encryption scheme.",
    inputFormats: ["RAR", "RAR5"],
    outputFormats: ["Extracted files", "ZIP", "Folder"],
    processor: "archive.extract",
    processorOptions: { format: "rar" },
    status: "partial",
    statusNote:
      "RAR reading uses libarchive, which supports most RAR 4 and RAR5 archives but not every feature: multi-volume (split) archives, some solid/encrypted RAR5 variants and recovery records may fail. Creating RAR files is not possible (proprietary format).",
    dependencies: [LIBARCHIVE],
    seoTitle: "RAR Extractor – Open RAR Files Online Without WinRAR",
    seoDescription:
      "Extract RAR and RAR5 files online with libarchive WebAssembly. Preview, download or extract to a folder. Private – the archive never leaves your device.",
    instructions: [
      "Drop a .rar file.",
      "Enter the password if prompted.",
      "Preview or download files, or use Download all as ZIP.",
    ],
    faqs: [
      { q: "Can I extract multi-part RAR files (.part1.rar)?", a: "Not currently. Join or extract split archives with WinRAR, 7-Zip or unar on your computer." },
      { q: "Can it create RAR files?", a: "No. RAR compression is proprietary. Use the ZIP Creator or convert to 7Z instead." },
      { q: "Why does an encrypted RAR fail?", a: "Some RAR5 encryption modes are not supported by libarchive. If the password is correct and it still fails, use 7-Zip or WinRAR." },
    ],
    related: ["7z-extractor", "zip-extractor", "zip-file-converter", "test-archive-integrity"],
    keywords: ["open rar", "unrar online", "rar5 extractor"],
  }),
  arc({
    id: 129,
    name: "7Z Extractor",
    slug: "7z-extractor",
    shortDescription: "Open 7-Zip (.7z) archives in your browser, preview files and download them.",
    description:
      "The 7Z Extractor reads 7-Zip archives – LZMA, LZMA2, BZip2 and Deflate compressed – using libarchive WebAssembly in a worker thread. Browse and preview the contents, download single files, everything as a ZIP, or extract directly into a folder in Chromium browsers. Archives protected with a password can be opened by entering it.",
    inputFormats: ["7Z"],
    outputFormats: ["Extracted files", "ZIP", "Folder"],
    processor: "archive.extract",
    processorOptions: { format: "7z" },
    dependencies: [LIBARCHIVE],
    seoTitle: "7Z Extractor – Open 7-Zip Files Online",
    seoDescription:
      "Extract .7z archives online without installing 7-Zip. Preview and download files or extract to a folder. Runs locally with WebAssembly.",
    instructions: [
      "Drop a .7z file.",
      "Enter the password if it is encrypted.",
      "Preview, download individually, or download all as ZIP.",
    ],
    faqs: [
      { q: "Which 7z compression methods are supported?", a: "LZMA, LZMA2, BZip2, Deflate and Copy, plus common filters. Rare methods such as PPMd may not be supported." },
      { q: "Are encrypted 7z archives supported?", a: "Archives with encrypted contents can be opened with the password. Archives with encrypted file names may need 7-Zip." },
      { q: "Is anything uploaded?", a: "No. libarchive runs in a Web Worker in your browser." },
    ],
    related: ["rar-extractor", "zip-extractor", "zip-file-converter", "tar-extractor"],
    keywords: ["open 7z", "7zip online", "extract 7z"],
  }),
  arc({
    id: 130,
    name: "TAR Extractor",
    slug: "tar-extractor",
    shortDescription: "Extract TAR archives (ustar, GNU and PAX long names) and browse their folder structure.",
    description:
      "The TAR Extractor reads .tar archives with a built-in parser that understands ustar, GNU long names and PAX extended headers, verifying each header checksum. It shows the folder structure, file sizes and modification times, previews files, and extracts to a folder or a ZIP. Compressed .tar.bz2 and .tar.xz archives are handled by libarchive.",
    inputFormats: ["TAR", "TAR.BZ2", "TAR.XZ"],
    outputFormats: ["Extracted files", "ZIP", "Folder"],
    processor: "archive.extract",
    processorOptions: { format: "tar" },
    seoTitle: "TAR Extractor – Open .tar Files Online",
    seoDescription:
      "Extract TAR archives online: ustar, GNU and PAX long names, checksum verification, preview and download. TAR.BZ2 and TAR.XZ supported. Private.",
    instructions: [
      "Drop a .tar (or .tar.bz2/.tar.xz) file.",
      "Browse the entries and preview files.",
      "Download files, all as ZIP, or extract to a folder.",
    ],
    faqs: [
      { q: "Are symbolic links extracted?", a: "Links are listed but not recreated, since browsers cannot create symlinks. Regular files and folders are extracted." },
      { q: "What about .tar.gz?", a: "Use the GZIP Extractor or File Decompressor, which handle .tar.gz and .tgz directly." },
      { q: "Are file permissions kept?", a: "No. Browsers cannot set Unix permissions on downloaded files." },
    ],
    related: ["gzip-extractor", "file-decompressor", "zip-file-converter", "7z-extractor"],
    keywords: ["extract tar", "open tar file", "untar online"],
  }),
  arc({
    id: 131,
    name: "GZIP Extractor",
    slug: "gzip-extractor",
    shortDescription: "Decompress .gz files and open .tar.gz / .tgz archives, with CRC-32 verification.",
    description:
      "The GZIP Extractor decompresses .gz files – restoring the original file name stored in the header – and opens .tar.gz and .tgz archives as a browsable file list. Multi-member GZIP files are supported, and the CRC-32 and length in each member trailer are verified so corrupt downloads are reported instead of silently producing bad data.",
    inputFormats: ["GZ", "TGZ", "TAR.GZ"],
    outputFormats: ["Original file", "Extracted files"],
    processor: "archive.extract",
    processorOptions: { format: "gzip" },
    seoTitle: "GZIP Extractor – Open .gz and .tar.gz Files Online",
    seoDescription:
      "Decompress .gz files and extract .tar.gz/.tgz archives online with CRC-32 verification and original file names. Fast, free and private.",
    instructions: [
      "Drop a .gz, .tgz or .tar.gz file.",
      "For a single compressed file, download the decompressed result.",
      "For TAR.GZ archives, browse and extract the contents.",
    ],
    faqs: [
      { q: "What is the difference between .gz and .tar.gz?", a: "GZIP compresses a single file. A .tar.gz first bundles many files into a TAR archive, then compresses it with GZIP." },
      { q: "Why does it say the CRC failed?", a: "The file is corrupted or truncated. Download it again." },
      { q: "Can I compress files to .gz?", a: "Yes, use the File Compressor." },
    ],
    related: ["tar-extractor", "file-compressor", "file-decompressor", "zip-extractor"],
    keywords: ["open gz file", "gunzip online", "extract tgz"],
  }),
  arc({
    id: 132,
    name: "File Compressor",
    slug: "file-compressor",
    shortDescription: "Compress files to GZIP, ZIP or TAR.GZ with a chosen level and see the real space saved.",
    description:
      "The File Compressor shrinks files using DEFLATE: GZIP for a single file (keeping its name in the header), ZIP for broad compatibility, or TAR.GZ to bundle several files the Unix way. Choose a level from fastest to smallest and get the exact original and compressed sizes. It also tells you when data is already compressed (JPEG, MP4, ZIP) and won't shrink further.",
    inputFormats: ["Any files"],
    outputFormats: ["GZ", "ZIP", "TAR.GZ"],
    processor: "archive.compress",
    seoTitle: "File Compressor – Compress Files to GZIP, ZIP or TAR.GZ",
    seoDescription:
      "Compress files online to GZIP, ZIP or TAR.GZ with adjustable levels and exact size savings. Works in your browser without uploading.",
    instructions: [
      "Add one or more files.",
      "Pick GZIP, ZIP or TAR.GZ and a compression level.",
      "Click Compress and compare the sizes.",
      "Download the compressed file.",
    ],
    faqs: [
      { q: "Which format compresses best?", a: "GZIP, ZIP and TAR.GZ all use DEFLATE and give similar ratios. For much better ratios on large text data, use the ZIP File Converter to make a .7z or .tar.xz." },
      { q: "Why didn't my video get smaller?", a: "Video, audio, JPEG and existing archives are already compressed; lossless compression can't shrink them meaningfully. Use the Video or Image Compressor for lossy reduction." },
      { q: "Does compression change my file?", a: "No. Compression is lossless – decompressing restores the exact original bytes." },
    ],
    related: ["file-decompressor", "zip-creator", "image-compressor", "compress-pdf"],
    keywords: ["compress file online", "gzip file", "make tar.gz"],
  }),
  arc({
    id: 133,
    name: "File Decompressor",
    slug: "file-decompressor",
    shortDescription: "Auto-detect and open any archive or compressed file – ZIP, RAR, 7Z, TAR, GZ, BZ2 or XZ.",
    description:
      "The File Decompressor identifies the format from the file's magic bytes rather than its extension, then opens it with the right engine: zip.js for ZIP, built-in parsers for TAR and GZIP, and libarchive for RAR, 7Z, TAR.BZ2 and TAR.XZ. Browse, preview and extract the contents, or download them as a ZIP. Mislabelled files are handled automatically.",
    inputFormats: ["ZIP", "RAR", "7Z", "TAR", "GZ", "TGZ", "TAR.BZ2", "TAR.XZ"],
    outputFormats: ["Extracted files", "ZIP", "Folder"],
    processor: "archive.extract",
    processorOptions: { format: "auto" },
    dependencies: [LIBARCHIVE],
    seoTitle: "File Decompressor – Open Any Archive Online (Auto-Detect)",
    seoDescription:
      "Decompress any archive online: ZIP, RAR, 7Z, TAR, GZ, BZ2 and XZ detected automatically from file contents. Preview and extract locally.",
    instructions: [
      "Drop any archive or compressed file.",
      "The format is detected automatically.",
      "Enter a password if asked, then preview or extract the files.",
    ],
    faqs: [
      { q: "How is the format detected?", a: "From the file's signature (magic bytes), e.g. PK for ZIP, 7z¼¯ for 7-Zip and Rar! for RAR, so renamed or extension-less files still open." },
      { q: "Can it open a single .bz2 or .xz file?", a: "Only when it contains a TAR archive (.tar.bz2 / .tar.xz). Plain single-file .bz2 or .xz streams are not currently supported." },
      { q: "Which formats are not supported?", a: "Multi-volume archives, ZSTD/LZ4 streams and disk images (ISO/DMG) are not supported." },
    ],
    related: ["zip-extractor", "rar-extractor", "7z-extractor", "gzip-extractor", "file-type-checker"],
    keywords: ["extract any archive", "decompress file", "open compressed file"],
  }),
  arc({
    id: 134,
    name: "ZIP File Converter",
    slug: "zip-file-converter",
    shortDescription: "Convert RAR, 7Z, TAR and TGZ archives to ZIP – or ZIP to TAR.GZ, 7Z, TAR.XZ and TAR.BZ2.",
    description:
      "The ZIP File Converter re-packs archives between formats in your browser. Turn RAR, 7Z, TAR or TAR.GZ files into universally supported ZIPs, or convert ZIPs into TAR, TAR.GZ, 7-Zip (LZMA), TAR.XZ or TAR.BZ2 for better compression or Unix workflows. Encrypted sources can be converted when you provide the password; the output is unencrypted.",
    inputFormats: ["ZIP", "RAR", "7Z", "TAR", "TGZ", "TAR.XZ", "TAR.BZ2"],
    outputFormats: ["ZIP", "TAR", "TAR.GZ", "7Z", "TAR.XZ", "TAR.BZ2"],
    processor: "archive.convert",
    dependencies: [LIBARCHIVE],
    seoTitle: "Archive Converter – RAR to ZIP, 7Z to ZIP, ZIP to TAR.GZ",
    seoDescription:
      "Convert archives online: RAR to ZIP, 7Z to ZIP, TAR.GZ to ZIP, or ZIP to TAR.GZ, 7Z and TAR.XZ. Runs locally in your browser with WebAssembly.",
    instructions: [
      "Drop the archive you want to convert.",
      "Choose the target format.",
      "Enter the password if the source is encrypted.",
      "Convert and download the new archive.",
    ],
    faqs: [
      { q: "Is the conversion lossless?", a: "Yes. Files are extracted and re-compressed without changes. Timestamps are kept; Unix permissions and symlinks are not." },
      { q: "Can I convert to RAR?", a: "No. RAR creation requires proprietary software. 7Z offers similar or better compression." },
      { q: "Does the output keep the password?", a: "No. Converted archives are unencrypted. Use the ZIP Creator if you need a password-protected ZIP." },
    ],
    related: ["rar-extractor", "7z-extractor", "zip-creator", "file-compressor"],
    keywords: ["rar to zip", "7z to zip", "convert archive", "zip to tar"],
  }),
  arc({
    id: 135,
    name: "Archive Password Generator",
    slug: "archive-password-generator",
    shortDescription: "Generate strong, easy-to-type passwords for encrypting ZIP, 7Z and RAR archives.",
    description:
      "The Archive Password Generator creates random passwords tuned for archive encryption: 24 characters by default, without look-alike characters and using only symbols that are safe to type in archive tools and command lines. Each password shows its entropy, and you can generate passphrases or bulk lists. Use the result with the ZIP Creator for an AES-256 encrypted ZIP.",
    inputFormats: ["Settings"],
    outputFormats: ["Passwords"],
    processor: "archive.password",
    processorOptions: { archive: true },
    seoTitle: "Archive Password Generator – Strong ZIP & 7Z Passwords",
    seoDescription:
      "Generate strong passwords for ZIP, 7Z and RAR encryption. Archive-safe symbols, no look-alike characters, entropy shown. Uses secure randomness.",
    instructions: [
      "Adjust length and character options (archive-friendly defaults are set).",
      "Copy the generated password.",
      "Store it in a password manager.",
      "Use it in the ZIP Creator or your archive software.",
    ],
    faqs: [
      { q: "Why avoid some symbols?", a: "Characters like quotes, backslashes and spaces can be misinterpreted by command-line tools and some archive programs. The default set avoids them." },
      { q: "How long should an archive password be?", a: "At least 16 random characters. Archive encryption can be attacked offline at high speed, so length matters more than for online accounts." },
      { q: "Can I recover an archive if I lose the password?", a: "No. Strong AES-256 encryption cannot be bypassed, so store the password safely." },
    ],
    related: ["zip-creator", "password-generator", "archive-password-remover", "password-strength-checker"],
    keywords: ["zip password generator", "7z password", "archive password"],
  }),
  arc({
    id: 136,
    name: "Archive Password Remover",
    slug: "archive-password-remover",
    shortDescription: "Remove the password from a ZIP, 7Z or RAR you can open – decrypt and re-pack as a plain ZIP.",
    description:
      "The Archive Password Remover creates an unprotected copy of an encrypted archive when you know its password. It opens the ZIP (AES or ZipCrypto), 7Z or RAR with your password, verifies every entry while extracting, and re-packs the files into a standard unencrypted ZIP. It is useful when sharing with systems that can't handle encryption. It does not crack or guess passwords.",
    inputFormats: ["Encrypted ZIP", "7Z", "RAR"],
    outputFormats: ["ZIP"],
    processor: "archive.remove-password",
    dependencies: [LIBARCHIVE],
    seoTitle: "Archive Password Remover – Unlock ZIP with Known Password",
    seoDescription:
      "Remove password protection from ZIP, 7Z or RAR archives when you know the password. Re-packs into a plain ZIP locally. No cracking, no upload.",
    instructions: [
      "Drop the encrypted archive.",
      "Enter its current password.",
      "Click Remove password.",
      "Download the unencrypted ZIP.",
    ],
    faqs: [
      { q: "Can it remove a password I don't know?", a: "No. This tool is not a password cracker. Strong archive encryption cannot be bypassed without the password." },
      { q: "Why is the output always ZIP?", a: "ZIP is the most widely supported format. Use the ZIP File Converter afterwards if you need TAR.GZ or 7Z." },
      { q: "Is my password sent anywhere?", a: "No. Decryption happens entirely in your browser." },
    ],
    related: ["archive-password-generator", "zip-extractor", "zip-file-converter", "unlock-pdf"],
    keywords: ["remove zip password", "unlock zip", "decrypt zip"],
  }),
  arc({
    id: 137,
    name: "Compare Archive Files",
    slug: "compare-archive-files",
    shortDescription: "See which files were added, removed or changed between two ZIP, TAR, 7Z or RAR archives.",
    description:
      "Compare Archive Files lists the differences between two archives entry by entry. Files only in the second archive are marked added, files only in the first are marked removed, and files whose size or CRC-32 differ are marked changed. For formats that don't store checksums (TAR, 7Z, RAR), an optional deep mode computes CRC-32 from the contents. Export the diff as CSV.",
    inputFormats: ["ZIP", "TAR", "TGZ", "7Z", "RAR"],
    outputFormats: ["Diff report", "CSV"],
    processor: "archive.compare",
    dependencies: [LIBARCHIVE],
    seoTitle: "Compare Archive Files – Diff Two ZIP or TAR Archives",
    seoDescription:
      "Compare two archives online: find added, removed and changed files by size and CRC-32. Works with ZIP, TAR, TGZ, 7Z and RAR. Export as CSV.",
    instructions: [
      "Add the original archive as A and the newer one as B.",
      "Keep “Compare contents” on to detect same-size changes.",
      "Click Compare and review the summary.",
      "Filter to differences or export the CSV.",
    ],
    faqs: [
      { q: "Can it compare a ZIP with a TAR.GZ?", a: "Yes. Entries are matched by path regardless of format, and contents are compared using CRC-32." },
      { q: "Does it show line-by-line differences inside files?", a: "No, it compares whole files. Extract the two versions and use the Text Diff Checker for line-level changes." },
      { q: "How reliable is CRC-32 for detecting changes?", a: "Very reliable for accidental changes; the chance of two different files sharing a CRC-32 and size is about one in four billion." },
    ],
    related: ["folder-comparison-tool", "file-comparison-tool", "test-archive-integrity", "text-diff-checker"],
    keywords: ["diff zip files", "compare archives", "zip compare"],
  }),
  arc({
    id: 138,
    name: "Test Archive Integrity",
    slug: "test-archive-integrity",
    shortDescription: "Verify every entry of a ZIP, RAR, 7Z, TAR or GZ archive and find corrupted files.",
    description:
      "Test Archive Integrity reads every entry in an archive and runs the format's own checks: CRC-32 for ZIP and GZIP members, AES authentication codes for AES-encrypted ZIPs, header checksums for TAR, and full decompression through libarchive for RAR and 7Z. You get a per-file pass/fail list, like 7-Zip's “Test” command, without extracting anything to disk.",
    inputFormats: ["ZIP", "RAR", "7Z", "TAR", "GZ", "TGZ"],
    outputFormats: ["Integrity report"],
    processor: "archive.test",
    dependencies: [LIBARCHIVE],
    seoTitle: "Test Archive Integrity – Check ZIP, RAR & 7Z for Corruption",
    seoDescription:
      "Test ZIP, RAR, 7Z, TAR and GZ archives for corruption. Verifies CRC-32, AES authentication and TAR checksums for every file. Runs locally.",
    instructions: [
      "Drop the archive to test.",
      "Enter the password if it is encrypted.",
      "Click Test archive and watch the progress.",
      "Review the per-file results.",
    ],
    faqs: [
      { q: "What does a failed entry mean?", a: "Its data doesn't match the stored checksum or can't be decompressed – the archive was damaged during download or storage." },
      { q: "Can it repair a broken archive?", a: "No. It only diagnoses problems. Re-download the archive or use a recovery record if the archive has one." },
      { q: "Why does TAR say it only checks headers?", a: "The TAR format stores checksums for headers only, not for file contents, so content corruption inside an uncompressed TAR cannot be detected." },
    ],
    related: ["zip-extractor", "file-checksum-verifier", "compare-archive-files", "repair-pdf"],
    keywords: ["test zip", "check archive corruption", "verify zip file"],
  }),
];
