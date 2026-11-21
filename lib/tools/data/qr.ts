import type { ToolDefinition } from "@/types/tool";

const added = "2026-11-21";

const generatorFaqPrivacy = {
  q: "Is the content of my QR code uploaded anywhere?",
  a: "No. The code is generated in your browser with the open-source qrcode library. Nothing you type is sent to a server, logged or stored.",
};

const staticFaq = {
  q: "Do these QR codes expire or track scans?",
  a: "No. They are static codes: the data is stored in the pattern itself, so they work forever, need no account and cannot track who scans them.",
};

export const qrTools: ToolDefinition[] = [
  {
    id: 234,
    name: "QR Code Generator",
    slug: "qr-code-generator",
    category: "qr",
    shortDescription: "Create QR codes for text, links, Wi-Fi, contacts, email, SMS, phone and locations, then download PNG or SVG.",
    description:
      "Generate static QR codes for any content type from one page: plain text, URLs, Wi-Fi logins, vCard or MECARD contacts, emails, SMS messages, phone numbers and map locations. Choose the size, quiet zone, error-correction level (L, M, Q or H) and colours, and the preview updates as you type. A contrast check warns you before you pick colours that phone cameras struggle to read, and you can download a PNG for screens or a vector SVG for print.",
    inputFormats: ["Text", "URL", "Wi-Fi details", "Contact details"],
    outputFormats: ["PNG", "SVG"],
    processor: "qr.generate",
    processorOptions: { type: "text", switchable: true },
    seoTitle: "QR Code Generator – Free PNG & SVG, No Sign-up | UtilityHub",
    seoDescription:
      "Free QR code generator for text, URLs, Wi-Fi, contacts, email, SMS and locations. Custom colours and error correction, PNG or SVG download, no sign-up.",
    instructions: [
      "Pick a content type: Text, URL, Wi-Fi, Contact, Email, SMS, Phone or Location.",
      "Fill in the fields. The encoded data and live preview update as you type.",
      "Adjust size, quiet zone, error correction and colours under Appearance.",
      "Check the contrast warning, then download the code as PNG or SVG.",
      "Scan the preview with your phone camera to test it before printing.",
    ],
    faqs: [
      generatorFaqPrivacy,
      staticFaq,
      {
        q: "Which error-correction level should I choose?",
        a: "M (15%) suits most screens and print. Use Q or H if the code will be printed small, on rough surfaces or may get scratched. Higher levels make the pattern denser, so L holds the most data.",
      },
      {
        q: "How much data can a QR code hold?",
        a: "Up to 2,953 bytes of text at level L (the maximum version 40 symbol). Long content makes the code dense and harder to scan, so keep it short or link to a web page instead.",
      },
      {
        q: "PNG or SVG: which download should I use?",
        a: "Use SVG for print, signage and design tools because it scales to any size without blurring. Use PNG for websites, documents and messaging apps.",
      },
    ],
    related: ["url-qr-code-generator", "wifi-qr-code-generator", "qr-code-with-logo", "qr-code-scanner", "barcode-generator"],
    status: "full",
    keywords: ["qr code maker", "create qr code", "qr generator", "free qr code", "qr svg"],
    popular: true,
    featured: true,
    addedAt: added,
  },
  {
    id: 235,
    name: "QR Code Scanner",
    slug: "qr-code-scanner",
    category: "qr",
    shortDescription: "Scan QR codes with your camera or from an uploaded image and see links, Wi-Fi logins and contacts as clear fields.",
    description:
      "Read QR codes in your browser using your device camera (the rear camera is preferred on phones) or by uploading a screenshot or photo. Decoding runs locally with jsQR, and the result is classified: links open safely in a new tab, Wi-Fi codes show the network name, security and password, and contact cards are listed field by field with a .vcf download. Email, SMS, phone and geo codes get one-tap actions.",
    inputFormats: ["Camera", "PNG", "JPG", "WebP", "GIF"],
    outputFormats: ["Text", "Structured fields"],
    processor: "qr.scan",
    seoTitle: "QR Code Scanner Online – Camera or Image Upload | UtilityHub",
    seoDescription:
      "Scan a QR code online with your webcam or phone camera, or upload a screenshot. Shows links, Wi-Fi passwords and contacts clearly. Runs on your device.",
    instructions: [
      "Choose Camera to scan live, or Image file to upload a photo or screenshot.",
      "For the camera, click Start camera and allow access when your browser asks.",
      "Hold the QR code inside the frame until it is detected; the camera then stops.",
      "Review the result: open the link, copy the Wi-Fi password or save the contact.",
      "Click Scan another for the next code, or Reset to clear everything.",
    ],
    faqs: [
      {
        q: "Are camera frames or images uploaded?",
        a: "No. Frames are analysed in your browser and discarded immediately. Uploaded images are decoded locally and never leave your device. The camera stops as soon as a code is found or you leave the page.",
      },
      {
        q: "Why does the camera not start?",
        a: "Camera access requires a secure (https) page and your permission. If you blocked it, re-enable the camera in your browser's site settings. Another app or tab using the camera can also block it.",
      },
      {
        q: "Is it safe to open links from a QR code?",
        a: "The scanner never opens anything automatically. It shows the full address first, and links open in a new tab with no access to this page. Check the domain carefully, because malicious QR codes often point to look-alike sites.",
      },
      {
        q: "My screenshot will not scan. What can I do?",
        a: "Make sure the whole code, including the white border around it, is visible and not blurred. Cropping closer to the code helps. Inverted codes (light on dark) are also supported.",
      },
    ],
    related: ["qr-code-generator", "barcode-scanner", "wifi-qr-code-generator", "contact-qr-code-generator"],
    status: "full",
    keywords: ["qr reader", "scan qr code online", "qr code decoder", "read qr from image", "webcam qr scanner"],
    addedAt: added,
  },
  {
    id: 236,
    name: "URL QR Code Generator",
    slug: "url-qr-code-generator",
    category: "qr",
    shortDescription: "Turn any web address into a scannable QR code. https:// is added automatically and the URL is validated first.",
    description:
      "Paste a web address and get a QR code that opens it in one scan. The tool adds https:// when you leave it out and rejects malformed addresses, so printed codes do not lead to dead links. Because the code is static, it encodes your exact URL without a redirect service in between, and it keeps working as long as the page exists.",
    inputFormats: ["URL"],
    outputFormats: ["PNG", "SVG"],
    processor: "qr.generate",
    processorOptions: { type: "url" },
    seoTitle: "URL to QR Code – Link QR Code Generator | UtilityHub",
    seoDescription:
      "Convert a website link into a QR code instantly. Validates the URL, adds https:// for you and exports PNG or SVG with no redirects, tracking or expiry.",
    instructions: [
      "Paste or type the web address, such as example.com/menu.",
      "Check the encoded data panel to confirm the final URL.",
      "Adjust size, colours and error correction if needed.",
      "Download PNG or SVG and test-scan it with your phone.",
    ],
    faqs: [
      {
        q: "Does the QR code go through a redirect or shortener?",
        a: "No. Your exact URL is stored in the code, so there is no third-party redirect that could break, show ads or collect data. The flip side is that the destination cannot be changed after printing.",
      },
      {
        q: "Should I shorten long URLs?",
        a: "Shorter URLs give a less dense code that scans faster from a distance. Remove tracking parameters you do not need. A shortener works too, but adds a dependency on that service.",
      },
      {
        q: "Why is https:// added to my link?",
        a: "Phone cameras only offer to open text that looks like a full link. Adding the scheme makes sure the code is recognised as a URL instead of plain text.",
      },
      staticFaq,
    ],
    related: ["qr-code-generator", "qr-code-with-logo", "qr-code-scanner", "url-encoder"],
    status: "full",
    keywords: ["link to qr", "website qr code", "url qr", "qr for website"],
    addedAt: added,
  },
  {
    id: 237,
    name: "Wi-Fi QR Code Generator",
    slug: "wifi-qr-code-generator",
    category: "qr",
    shortDescription: "Make a QR code that joins your Wi-Fi network in one scan, with WPA, WEP, open and hidden network support.",
    description:
      "Create a Wi-Fi QR code so guests can join your network by pointing their camera at it, without typing the password. The tool writes the standard WIFI: format understood by iOS and Android, and correctly escapes special characters such as semicolons, commas, colons, quotes and backslashes in the network name or password, which hand-made codes often get wrong. Hidden networks and open networks are supported.",
    inputFormats: ["Network name", "Password"],
    outputFormats: ["PNG", "SVG"],
    processor: "qr.generate",
    processorOptions: { type: "wifi" },
    seoTitle: "Wi-Fi QR Code Generator – Share Wi-Fi Without a Password | UtilityHub",
    seoDescription:
      "Create a Wi-Fi QR code so guests join your network with one scan. WPA/WPA2/WPA3, WEP, open and hidden networks, with correct escaping. Generated locally.",
    instructions: [
      "Enter the network name (SSID) exactly as it appears, including capitals.",
      "Choose the security type and enter the password.",
      "Tick Hidden network if your router does not broadcast the name.",
      "Download the code and print it for guests, or show it on screen.",
    ],
    faqs: [
      {
        q: "Is my Wi-Fi password sent to your server?",
        a: "No. The code is generated entirely in your browser. Keep in mind that anyone who scans the printed code can read the password, so only display it where you would share the password anyway.",
      },
      {
        q: "Which phones can scan a Wi-Fi QR code?",
        a: "The built-in camera app on iOS 11+ and on Android 10+ recognises the WIFI: format and offers to join the network. Older Android phones may need Google Lens or a scanner app.",
      },
      {
        q: "My password has symbols like ; or \". Will it work?",
        a: "Yes. Backslash, semicolon, comma, colon and double quote are escaped with a backslash as the format requires, so the phone receives the exact password.",
      },
      {
        q: "Which security option should I pick for WPA3?",
        a: "Choose WPA / WPA2 / WPA3. The QR format uses the single value WPA for all of them, and the phone negotiates the actual protocol with your router.",
      },
    ],
    related: ["qr-code-generator", "qr-code-scanner", "password-generator", "contact-qr-code-generator"],
    status: "full",
    keywords: ["wifi qr", "wifi password qr", "guest wifi qr code", "share wifi"],
    addedAt: added,
  },
  {
    id: 238,
    name: "Contact QR Code Generator",
    slug: "contact-qr-code-generator",
    category: "qr",
    shortDescription: "Create a vCard or MECARD QR code so people can save your name, phone, email, company and address in one scan.",
    description:
      "Build a contact QR code for business cards, badges and email signatures. Choose vCard 3.0 for the most complete record (name, job title, organisation, mobile and work phones, email, website, postal address and a note) or MECARD for a smaller, easier-to-scan code. Values are escaped according to each format, so commas, semicolons and line breaks do not corrupt the card.",
    inputFormats: ["Contact details"],
    outputFormats: ["PNG", "SVG"],
    processor: "qr.generate",
    processorOptions: { type: "vcard" },
    seoTitle: "vCard QR Code Generator – Contact & Business Card QR | UtilityHub",
    seoDescription:
      "Generate a vCard 3.0 or MECARD QR code for business cards. Add name, phone, email, company, website and address; download PNG or SVG. Free and private.",
    instructions: [
      "Choose vCard 3.0 (most complete) or MECARD (smallest code).",
      "Enter at least a name or organisation, then add phones, email and address as needed.",
      "Review the encoded data panel to see exactly what will be saved.",
      "Download the code and place it on your card, badge or slide.",
    ],
    faqs: [
      {
        q: "vCard or MECARD: what is the difference?",
        a: "vCard 3.0 is the universal contact format and supports more fields, such as job title and multiple address parts. MECARD is a compact format that produces a smaller, less dense code but holds fewer details. Both are read by iOS and Android cameras.",
      },
      {
        q: "Why is my contact QR code so dense?",
        a: "Every field adds data. For small business cards, leave out the note and address or switch to MECARD, and use error-correction level L or M.",
      },
      {
        q: "Does the contact include a photo?",
        a: "No. Photos are far too large for a QR code. Add your website or a profile link instead.",
      },
      generatorFaqPrivacy,
    ],
    related: ["qr-code-generator", "email-qr-code-generator", "phone-qr-code-generator", "qr-code-scanner"],
    status: "full",
    keywords: ["vcard qr", "business card qr code", "mecard", "contact qr"],
    addedAt: added,
  },
  {
    id: 239,
    name: "Email QR Code Generator",
    slug: "email-qr-code-generator",
    category: "qr",
    shortDescription: "Generate a QR code that opens a pre-filled email with recipient, subject and message ready to send.",
    description:
      "Create a mailto: QR code that opens the scanner's email app with the recipient, subject and body already filled in. It is handy for feedback forms, support requests and event sign-ups. Addresses are validated, several recipients can be separated with commas, and the subject and message are percent-encoded per RFC 6068 so spaces, ampersands and line breaks arrive intact.",
    inputFormats: ["Email address", "Subject", "Message"],
    outputFormats: ["PNG", "SVG"],
    processor: "qr.generate",
    processorOptions: { type: "email" },
    seoTitle: "Email QR Code Generator – mailto QR with Subject & Body | UtilityHub",
    seoDescription:
      "Make a QR code that opens a pre-written email with recipient, subject and message. Standard mailto: format, validated addresses, PNG or SVG download.",
    instructions: [
      "Enter one or more recipient addresses, separated by commas.",
      "Optionally add a subject line and message body.",
      "Check the encoded mailto: link in the data panel.",
      "Download the code and test it with your phone camera.",
    ],
    faqs: [
      {
        q: "Does scanning the code send the email automatically?",
        a: "No. It opens a draft in the person's email app. They can review and edit it before choosing to send.",
      },
      {
        q: "Can I add CC or BCC recipients?",
        a: "This tool encodes To, Subject and Body, which every mail app supports. Several To recipients are allowed; CC and BCC support varies between apps, so they are not included.",
      },
      {
        q: "How long can the message be?",
        a: "Technically up to the QR capacity, but long messages make dense codes. Keep the body to a sentence or two for reliable scanning.",
      },
      staticFaq,
    ],
    related: ["qr-code-generator", "contact-qr-code-generator", "sms-qr-code-generator", "url-encoder"],
    status: "full",
    keywords: ["mailto qr", "email qr", "qr code email"],
    addedAt: added,
  },
  {
    id: 240,
    name: "SMS QR Code Generator",
    slug: "sms-qr-code-generator",
    category: "qr",
    shortDescription: "Create a QR code that opens a text message to your number with the message already typed in.",
    description:
      "Generate an SMS QR code for opt-ins, voting, support lines and reminders: scanning it opens the messaging app with your number and message pre-filled. Choose the SMSTO: format, which camera apps support most widely, or the RFC 5724 sms: URI. Phone numbers are cleaned of spaces, dashes and brackets while keeping the international + prefix.",
    inputFormats: ["Phone number", "Message"],
    outputFormats: ["PNG", "SVG"],
    processor: "qr.generate",
    processorOptions: { type: "sms" },
    seoTitle: "SMS QR Code Generator – Pre-filled Text Message QR | UtilityHub",
    seoDescription:
      "Create a QR code that opens a pre-filled text message to any number. SMSTO: or sms: format, international numbers supported, PNG or SVG export. Free.",
    instructions: [
      "Enter the phone number, including the country code (for example +91).",
      "Type the message you want to pre-fill.",
      "Keep SMSTO: for the widest compatibility, or pick the sms: URI.",
      "Download the QR code and test it on both iPhone and Android if you can.",
    ],
    faqs: [
      {
        q: "Will the message be sent automatically?",
        a: "No. Scanning opens the messaging app with the text ready; the person still taps Send, so no message is sent without consent.",
      },
      {
        q: "SMSTO: or sms:, which should I use?",
        a: "SMSTO:number:message is the long-standing QR convention and works with most camera apps. sms:number?body= is the official URI scheme; use it if your audience mostly uses newer phones or you embed the link on web pages too.",
      },
      {
        q: "Why should I include the country code?",
        a: "Without it, the number is dialled as a local number in the scanner's country, which fails for anyone abroad. A leading + with the country code works everywhere.",
      },
      generatorFaqPrivacy,
    ],
    related: ["qr-code-generator", "phone-qr-code-generator", "email-qr-code-generator", "qr-code-scanner"],
    status: "full",
    keywords: ["sms qr", "text message qr", "smsto"],
    addedAt: added,
  },
  {
    id: 241,
    name: "Phone QR Code Generator",
    slug: "phone-qr-code-generator",
    category: "qr",
    shortDescription: "Make a QR code that starts a phone call to your number when scanned, ideal for flyers, signs and vehicles.",
    description:
      "Create a tel: QR code that offers to call your number as soon as it is scanned, so customers do not have to read and type digits. The number is normalised to the international format phones expect (digits with an optional leading +), and validated against the 15-digit E.164 limit before the code is drawn.",
    inputFormats: ["Phone number"],
    outputFormats: ["PNG", "SVG"],
    processor: "qr.generate",
    processorOptions: { type: "phone" },
    seoTitle: "Phone Number QR Code Generator – Tap to Call QR | UtilityHub",
    seoDescription:
      "Generate a tel: QR code that calls your phone number in one scan. Validates international numbers and downloads as PNG or SVG for flyers and signs.",
    instructions: [
      "Enter the phone number with its country code, for example +44 20 7946 0958.",
      "Confirm the cleaned tel: link in the encoded data panel.",
      "Style the code and download it as PNG or SVG.",
      "Test-scan it: your phone should offer to call the number.",
    ],
    faqs: [
      {
        q: "Does scanning start the call immediately?",
        a: "No. Phones show the number and ask for confirmation before dialling.",
      },
      {
        q: "Can I include an extension?",
        a: "Extensions are not reliably supported by phone dialers through QR codes, so this tool encodes the main number only. Mention the extension next to the code.",
      },
      {
        q: "What number formats are accepted?",
        a: "Any format with spaces, dashes, dots or brackets is accepted; those characters are removed. The result must contain 3 to 15 digits, with an optional leading +.",
      },
      staticFaq,
    ],
    related: ["qr-code-generator", "sms-qr-code-generator", "contact-qr-code-generator", "qr-code-scanner"],
    status: "full",
    keywords: ["tel qr", "call qr code", "phone number qr"],
    addedAt: added,
  },
  {
    id: 242,
    name: "Location QR Code Generator",
    slug: "location-qr-code-generator",
    category: "qr",
    shortDescription: "Encode latitude and longitude as a geo: QR code that opens the spot in the scanner's maps app.",
    description:
      "Create a location QR code from coordinates so visitors can find an entrance, venue or meeting point. Enter latitude and longitude, paste a \"lat, lng\" pair copied from a map, or use your current position. The tool validates the ranges and writes an RFC 5870 geo: URI, which Android maps apps open directly and most QR scanner apps support.",
    inputFormats: ["Latitude", "Longitude"],
    outputFormats: ["PNG", "SVG"],
    processor: "qr.generate",
    processorOptions: { type: "geo" },
    seoTitle: "Location QR Code Generator – GPS Coordinates to QR | UtilityHub",
    seoDescription:
      "Turn GPS coordinates into a geo: QR code that opens a maps app. Paste lat, lng from a map or use your current location. Validated and generated locally.",
    instructions: [
      "Enter the latitude and longitude, or paste \"lat, lng\" into the latitude box.",
      "Or click Use my location to fill in your current coordinates.",
      "Check the geo: link in the encoded data panel.",
      "Download the code and test it with the phones your visitors use.",
    ],
    faqs: [
      {
        q: "Does a geo: QR code work on iPhone?",
        a: "Android opens geo: links in Google Maps or another maps app. The iOS camera app does not always act on geo: links, so for iPhone-heavy audiences you may prefer a URL QR code with a Google Maps or Apple Maps link.",
      },
      {
        q: "How do I get coordinates for a place?",
        a: "In Google Maps, right-click (or long-press) the spot and copy the numbers shown, then paste them into the latitude box. Both fields are filled automatically.",
      },
      {
        q: "Is my location sent anywhere when I use my location?",
        a: "No. The browser gives the coordinates to this page only after you allow it, and they are used locally to build the code.",
      },
      {
        q: "How precise are the coordinates?",
        a: "Up to seven decimal places are kept, which is about one centimetre. Six decimals (about 10 cm) is plenty for any building or entrance.",
      },
    ],
    related: ["qr-code-generator", "url-qr-code-generator", "qr-code-scanner", "contact-qr-code-generator"],
    status: "full",
    keywords: ["geo qr", "map qr code", "gps qr code", "coordinates qr"],
    addedAt: added,
  },
  {
    id: 243,
    name: "QR Code with Logo",
    slug: "qr-code-with-logo",
    category: "qr",
    shortDescription: "Add your logo to the centre of a QR code, with high error correction and an automatic scan check before download.",
    description:
      "Place a brand logo in the middle of a QR code without breaking it. Error correction is fixed at level H (about 30% recovery), the logo is capped at 22% of the code area, and small payloads are rendered at a larger QR version so there are enough modules around the logo. Every result is decoded with jsQR at full size and at a phone-like 400 px; if it does not read back exactly, you get a warning and suggestions instead of a silently broken code.",
    inputFormats: ["Text", "URL", "PNG", "JPG", "WebP", "SVG"],
    outputFormats: ["PNG", "SVG"],
    processor: "qr.logo",
    seoTitle: "QR Code with Logo – Add Logo to QR, Scan-Verified | UtilityHub",
    seoDescription:
      "Put your logo in the centre of a QR code. Forced high error correction, logo size cap and an automatic decode check before you download PNG or SVG.",
    instructions: [
      "Enter the URL or text the code should contain.",
      "Upload your logo; a square PNG with a transparent background works best.",
      "Adjust the logo size and keep the backing pad on for busy logos.",
      "Wait for the Verified message, then download PNG or SVG.",
      "If verification fails, make the logo smaller or shorten the content.",
    ],
    faqs: [
      {
        q: "How can a QR code still work with a logo covering it?",
        a: "QR codes contain Reed-Solomon error correction. At level H, roughly 30% of the data can be lost and still be recovered, so a logo that covers a smaller share of the centre is tolerated. The finder squares in the corners are never covered.",
      },
      {
        q: "How large can the logo be?",
        a: "Up to 22% of the code area. In practice 10–15% is the safest choice. The tool checks every result by decoding it, so you will see if a size is too large.",
      },
      {
        q: "Why did my code get denser after adding a logo?",
        a: "Short content would normally produce a tiny QR version with too few modules to absorb a logo. The tool raises it to at least version 5 (37×37 modules), and higher if needed, so the logo does not destroy too many codewords.",
      },
      {
        q: "Is my logo uploaded?",
        a: "No. The logo is drawn onto the code in your browser. In the SVG download it is embedded as a data URL, so the file is self-contained.",
      },
    ],
    related: ["qr-code-generator", "url-qr-code-generator", "qr-code-scanner", "image-resizer", "png-to-svg"],
    status: "full",
    keywords: ["qr with logo", "branded qr code", "custom qr code", "logo in qr"],
    addedAt: added,
  },
  {
    id: 244,
    name: "Barcode Generator",
    slug: "barcode-generator",
    category: "qr",
    shortDescription: "Generate Code 128, EAN-13, EAN-8, UPC-A, Code 39, ITF-14, MSI, Pharmacode and Codabar barcodes as SVG or PNG.",
    description:
      "Create printable 1D barcodes with JsBarcode. Each format is validated before drawing: EAN-13, EAN-8, UPC-A and ITF-14 check digits are calculated automatically when you leave them off and verified when you include them, Code 39 is upper-cased, and Pharmacode ranges are enforced. Adjust bar width, height, quiet zone, font size and colours, then download a crisp SVG for print or a high-resolution PNG.",
    inputFormats: ["Text", "Digits"],
    outputFormats: ["SVG", "PNG"],
    processor: "qr.barcode",
    seoTitle: "Barcode Generator – EAN-13, UPC, Code 128 to SVG/PNG | UtilityHub",
    seoDescription:
      "Free barcode generator for Code 128, EAN-13, EAN-8, UPC-A, Code 39, ITF-14 and more. Automatic check digits, SVG and PNG download, no sign-up needed.",
    instructions: [
      "Choose the barcode format your scanner, retailer or warehouse requires.",
      "Enter the value; for EAN/UPC/ITF-14 you can leave off the check digit.",
      "Fix any validation message shown under the input.",
      "Adjust bar width, height, margin and text, then download SVG or PNG.",
    ],
    faqs: [
      {
        q: "Can I use these EAN or UPC barcodes on retail products?",
        a: "The barcode itself will be valid, but retailers require numbers issued to your company by GS1. Generating a barcode does not register a product number; use the numbers from your GS1 membership.",
      },
      {
        q: "What does \"invalid check digit\" mean?",
        a: "EAN, UPC and ITF-14 end with a GS1 mod-10 check digit calculated from the other digits. If the last digit does not match, the number was probably mistyped. The tool tells you the correct digit, or leave it off and it will be added.",
      },
      {
        q: "Which format should I use for internal labels?",
        a: "Code 128 is the most compact and encodes letters, digits and symbols, so it is the usual choice for asset tags, shipping and inventory labels. Code 39 is older but supported by almost every scanner.",
      },
      {
        q: "SVG or PNG for printing?",
        a: "SVG is vector, so bars stay perfectly sharp at any size, which matters for scan reliability. If you need PNG, raise the PNG scale so each bar spans several pixels.",
      },
    ],
    related: ["barcode-scanner", "qr-code-generator", "qr-code-scanner", "qr-code-with-logo"],
    status: "full",
    keywords: ["ean13 generator", "upc barcode", "code128", "barcode maker", "check digit calculator"],
    addedAt: added,
  },
  {
    id: 245,
    name: "Barcode Scanner",
    slug: "barcode-scanner",
    category: "qr",
    shortDescription: "Read EAN, UPC, Code 128, Code 39, ITF, Data Matrix, PDF417 and QR codes from your camera or an image.",
    description:
      "Scan product and shipping barcodes in the browser with your camera or from a photo. The tool uses the browser's native BarcodeDetector where it is available (Chrome and Edge on Android, macOS and ChromeOS) and falls back to the ZXing decoder everywhere else, including Firefox and Safari. Results show the symbology and value, verify GS1 check digits for EAN, UPC and ITF codes, and parse QR payloads into readable fields.",
    inputFormats: ["Camera", "PNG", "JPG", "WebP", "GIF", "BMP"],
    outputFormats: ["Text"],
    processor: "qr.barcode-scan",
    seoTitle: "Barcode Scanner Online – Scan EAN, UPC & Code 128 | UtilityHub",
    seoDescription:
      "Scan barcodes online with your camera or an uploaded photo. Reads EAN-13, UPC-A, Code 128, Code 39, ITF, Data Matrix and QR. Works privately on-device.",
    instructions: [
      "Choose Camera for live scanning or Image file to upload a photo.",
      "Click Start camera and allow access; hold the barcode horizontally in the frame.",
      "Keep it steady 10–20 cm away until the value appears.",
      "Copy the value or check the GS1 check-digit result, then scan another.",
    ],
    faqs: [
      {
        q: "Which barcode types can it read?",
        a: "EAN-13, EAN-8, UPC-A, UPC-E, Code 128, Code 39, Code 93, Codabar, ITF, GS1 DataBar, QR Code, Data Matrix, Aztec and PDF417. The exact set depends on the engine; the native detector and ZXing both cover the common retail and logistics formats.",
      },
      {
        q: "Does it look up product names or prices?",
        a: "No. It reads the number encoded in the barcode. Looking up a product would need an external database, and nothing you scan is sent anywhere.",
      },
      {
        q: "Why is my barcode not detected?",
        a: "1D barcodes need sharp focus, good light and the white quiet zone on both sides. Hold the code horizontally, move a little further away if the camera cannot focus, and avoid glare on glossy packaging. For photos, crop closer to the barcode.",
      },
      {
        q: "Which engine is my browser using?",
        a: "A badge above the scanner shows either Native BarcodeDetector or ZXing decoder. Both run locally; the native one is usually faster on supported devices.",
      },
    ],
    related: ["barcode-generator", "qr-code-scanner", "qr-code-generator", "file-type-checker"],
    status: "full",
    keywords: ["barcode reader", "scan barcode online", "ean scanner", "upc scanner", "zxing"],
    addedAt: added,
  },
];
