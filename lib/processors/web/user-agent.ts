/**
 * Lightweight, dependency-free User-Agent parser. Covers the browsers, engines, operating
 * systems, devices and bots that make up the vast majority of real traffic. Modern
 * Chromium browsers "reduce" their UA string (frozen OS versions, generic Android model "K"),
 * so the UI combines this with User-Agent Client Hints where the browser supports them.
 */

export interface NameVersion {
  name: string | null;
  version: string | null;
}

export type DeviceType = "desktop" | "mobile" | "tablet" | "tv" | "console" | "wearable" | "bot" | "unknown";

export interface ParsedUserAgent {
  ua: string;
  browser: NameVersion & { major: string | null };
  engine: NameVersion;
  os: NameVersion;
  device: { type: DeviceType; vendor: string | null; model: string | null };
  bot: { isBot: boolean; name: string | null; category: string | null };
  isWebView: boolean;
  /** Notes about ambiguities, e.g. reduced UA strings. */
  notes: string[];
}

const BOTS: [RegExp, string, string][] = [
  [/Googlebot-Image/i, "Googlebot-Image", "Search engine"],
  [/Googlebot/i, "Googlebot", "Search engine"],
  [/Google-InspectionTool/i, "Google Inspection Tool", "Search engine"],
  [/AdsBot-Google/i, "AdsBot-Google", "Search engine"],
  [/Storebot-Google/i, "Storebot-Google", "Search engine"],
  [/bingbot/i, "Bingbot", "Search engine"],
  [/DuckDuckBot/i, "DuckDuckBot", "Search engine"],
  [/Baiduspider/i, "Baiduspider", "Search engine"],
  [/YandexBot/i, "YandexBot", "Search engine"],
  [/Applebot-Extended/i, "Applebot-Extended", "AI crawler"],
  [/Applebot/i, "Applebot", "Search engine"],
  [/GPTBot/i, "GPTBot", "AI crawler"],
  [/ChatGPT-User/i, "ChatGPT-User", "AI assistant"],
  [/OAI-SearchBot/i, "OAI-SearchBot", "AI search"],
  [/ClaudeBot/i, "ClaudeBot", "AI crawler"],
  [/Claude-User/i, "Claude-User", "AI assistant"],
  [/Claude-SearchBot/i, "Claude-SearchBot", "AI search"],
  [/anthropic-ai/i, "anthropic-ai", "AI crawler"],
  [/CCBot/i, "CCBot (Common Crawl)", "AI crawler"],
  [/PerplexityBot/i, "PerplexityBot", "AI search"],
  [/Perplexity-User/i, "Perplexity-User", "AI assistant"],
  [/Bytespider/i, "Bytespider", "AI crawler"],
  [/meta-externalagent/i, "Meta External Agent", "AI crawler"],
  [/Amazonbot/i, "Amazonbot", "AI crawler"],
  [/facebookexternalhit|facebookcatalog/i, "Facebook link preview", "Social preview"],
  [/Twitterbot/i, "Twitterbot", "Social preview"],
  [/LinkedInBot/i, "LinkedInBot", "Social preview"],
  [/Slackbot/i, "Slackbot", "Social preview"],
  [/Discordbot/i, "Discordbot", "Social preview"],
  [/TelegramBot/i, "TelegramBot", "Social preview"],
  [/WhatsApp/i, "WhatsApp link preview", "Social preview"],
  [/Pinterestbot/i, "Pinterestbot", "Social preview"],
  [/AhrefsBot/i, "AhrefsBot", "SEO crawler"],
  [/SemrushBot/i, "SemrushBot", "SEO crawler"],
  [/MJ12bot/i, "MJ12bot", "SEO crawler"],
  [/DotBot/i, "DotBot", "SEO crawler"],
  [/UptimeRobot/i, "UptimeRobot", "Monitoring"],
  [/Pingdom/i, "Pingdom", "Monitoring"],
  [/UtilityHubBot/i, "UtilityHubBot", "Tool"],
  [/HeadlessChrome/i, "Headless Chrome", "Automation"],
  [/PhantomJS/i, "PhantomJS", "Automation"],
  [/^curl\//i, "curl", "HTTP client"],
  [/^Wget\//i, "Wget", "HTTP client"],
  [/python-requests|python-urllib|aiohttp|httpx/i, "Python HTTP client", "HTTP client"],
  [/Go-http-client/i, "Go HTTP client", "HTTP client"],
  [/PostmanRuntime/i, "Postman", "HTTP client"],
  [/node-fetch|undici|axios/i, "Node.js HTTP client", "HTTP client"],
  [/okhttp/i, "OkHttp", "HTTP client"],
  [/Java\/\d/i, "Java HTTP client", "HTTP client"],
  [/\b(bot|crawler|spider|crawling|scraper)\b/i, "Unidentified bot", "Bot"],
];

function m(ua: string, re: RegExp): string | null {
  const r = re.exec(ua);
  return r ? (r[1] ?? r[0]) : null;
}

const major = (v: string | null) => (v ? v.split(".")[0] : null);
const dots = (v: string | null) => (v ? v.replace(/_/g, ".") : null);

function parseBrowser(ua: string): NameVersion {
  const tests: [RegExp, string][] = [
    [/EdgA?\/([\d.]+)/, "Microsoft Edge"],
    [/EdgiOS\/([\d.]+)/, "Microsoft Edge"],
    [/Edge\/([\d.]+)/, "Microsoft Edge (Legacy)"],
    [/OPR\/([\d.]+)/, "Opera"],
    [/OPT\/([\d.]+)/, "Opera Touch"],
    [/OPiOS\/([\d.]+)/, "Opera"],
    [/Opera.*Version\/([\d.]+)/, "Opera"],
    [/SamsungBrowser\/([\d.]+)/, "Samsung Internet"],
    [/UCBrowser\/([\d.]+)/, "UC Browser"],
    [/YaBrowser\/([\d.]+)/, "Yandex Browser"],
    [/Vivaldi\/([\d.]+)/, "Vivaldi"],
    [/DuckDuckGo\/([\d.]+)/, "DuckDuckGo"],
    [/Ddg\/([\d.]+)/, "DuckDuckGo"],
    [/Brave\/([\d.]+)/, "Brave"],
    [/Whale\/([\d.]+)/, "Naver Whale"],
    [/MiuiBrowser\/([\d.]+)/, "MIUI Browser"],
    [/HuaweiBrowser\/([\d.]+)/, "Huawei Browser"],
    [/FBAV\/([\d.]+)/, "Facebook App"],
    [/Instagram ([\d.]+)/, "Instagram App"],
    [/Line\/([\d.]+)/, "LINE App"],
    [/FxiOS\/([\d.]+)/, "Firefox"],
    [/Firefox\/([\d.]+)/, "Firefox"],
    [/CriOS\/([\d.]+)/, "Chrome"],
    [/Chromium\/([\d.]+)/, "Chromium"],
    [/Chrome\/([\d.]+)/, "Chrome"],
    [/MSIE ([\d.]+)/, "Internet Explorer"],
    [/Trident\/.*rv:([\d.]+)/, "Internet Explorer"],
    [/Version\/([\d.]+).*Safari\//, "Safari"],
    [/Version\/([\d.]+).*Mobile\//, "Safari"],
  ];
  for (const [re, name] of tests) {
    const v = m(ua, re);
    if (v) return { name, version: v };
  }
  if (/AppleWebKit/.test(ua) && /(iPhone|iPad|iPod)/.test(ua)) return { name: "WebKit WebView", version: null };
  if (/Safari\//.test(ua)) return { name: "Safari", version: null };
  return { name: null, version: null };
}

function parseOs(ua: string): NameVersion {
  const win = m(ua, /Windows NT ([\d.]+)/);
  if (win) {
    const names: Record<string, string> = {
      "10.0": "10 or 11",
      "6.3": "8.1",
      "6.2": "8",
      "6.1": "7",
      "6.0": "Vista",
      "5.2": "XP x64",
      "5.1": "XP",
    };
    return { name: "Windows", version: names[win] ?? win };
  }
  if (/Windows Phone/.test(ua)) return { name: "Windows Phone", version: m(ua, /Windows Phone (?:OS )?([\d.]+)/) };
  if (/Xbox/.test(ua)) return { name: "Xbox OS", version: null };
  const ios = m(ua, /(?:iPhone|CPU) OS ([\d_]+)/);
  if (ios && /iPad/.test(ua)) return { name: "iPadOS", version: dots(ios) };
  if (ios || /iPhone|iPod/.test(ua)) return { name: "iOS", version: dots(ios) };
  if (/iPad/.test(ua)) return { name: "iPadOS", version: null };
  const harmony = m(ua, /HarmonyOS[ /]?([\d.]+)?/);
  if (/HarmonyOS/.test(ua)) return { name: "HarmonyOS", version: harmony && /\d/.test(harmony) ? harmony : null };
  const android = m(ua, /Android[ /]?([\d.]+)?/);
  if (/Android/.test(ua)) return { name: "Android", version: android && /\d/.test(android) ? android : null };
  if (/CrOS/.test(ua)) return { name: "ChromeOS", version: m(ua, /CrOS \S+ ([\d.]+)/) };
  const mac = m(ua, /Mac OS X ([\d_.]+)/);
  if (mac || /Macintosh/.test(ua)) return { name: "macOS", version: dots(mac) };
  if (/PlayStation/.test(ua)) return { name: "PlayStation OS", version: m(ua, /PlayStation \d ([\d.]+)/) };
  if (/Tizen/.test(ua)) return { name: "Tizen", version: m(ua, /Tizen ([\d.]+)/) };
  if (/Web0S|webOS/.test(ua)) return { name: "webOS", version: null };
  if (/KaiOS/.test(ua)) return { name: "KaiOS", version: m(ua, /KaiOS\/([\d.]+)/) };
  if (/FreeBSD/.test(ua)) return { name: "FreeBSD", version: null };
  if (/Ubuntu/.test(ua)) return { name: "Ubuntu", version: m(ua, /Ubuntu\/([\d.]+)/) };
  if (/Fedora/.test(ua)) return { name: "Fedora", version: null };
  if (/Linux/.test(ua)) return { name: "Linux", version: null };
  return { name: null, version: null };
}

function parseEngine(ua: string, browser: NameVersion, os: NameVersion): NameVersion {
  if (os.name === "iOS" || os.name === "iPadOS") return { name: "WebKit", version: m(ua, /AppleWebKit\/([\d.]+)/) };
  if (/Edge\/([\d.]+)/.test(ua) && !/Edg[A]?\//.test(ua)) return { name: "EdgeHTML", version: m(ua, /Edge\/([\d.]+)/) };
  if (/Trident\/([\d.]+)/.test(ua)) return { name: "Trident", version: m(ua, /Trident\/([\d.]+)/) };
  if (/Chrome\/|Chromium\//.test(ua)) return { name: "Blink", version: m(ua, /(?:Chrome|Chromium)\/([\d.]+)/) };
  if (/AppleWebKit\//.test(ua)) return { name: "WebKit", version: m(ua, /AppleWebKit\/([\d.]+)/) };
  if (/Gecko\/|Firefox\//.test(ua)) return { name: "Gecko", version: m(ua, /rv:([\d.]+)/) };
  if (/Presto\//.test(ua)) return { name: "Presto", version: m(ua, /Presto\/([\d.]+)/) };
  void browser;
  return { name: null, version: null };
}

const ANDROID_VENDORS: [RegExp, string][] = [
  [/^(SM-|SAMSUNG|Galaxy|GT-|SCH-|SGH-)/i, "Samsung"],
  [/^Pixel/i, "Google"],
  [/^Nexus/i, "Google"],
  [/^(Redmi|Mi |MI |M2\d|POCO|22\d{6}|23\d{6}|2\d{3}[A-Z0-9]{2,})/i, "Xiaomi"],
  [/^(ONEPLUS|OnePlus|CPH2\d|NE2\d|LE2\d|KB2\d|IN2\d)/i, "OnePlus/OPPO"],
  [/^(CPH|OPPO|PH[A-Z]M)/i, "OPPO"],
  [/^(vivo|V2\d{3})/i, "vivo"],
  [/^(HUAWEI|ELE-|VOG-|ANE-|MAR-|LYA-|NOH-)/i, "Huawei"],
  [/^(Moto|motorola|XT\d)/i, "Motorola"],
  [/^(Nokia|TA-)/i, "Nokia"],
  [/^(LM-|LG-)/i, "LG"],
  [/^(SO-|XQ-|Xperia)/i, "Sony"],
  [/^(RMX|realme)/i, "realme"],
  [/^(Infinix)/i, "Infinix"],
  [/^(TECNO)/i, "TECNO"],
  [/^(KF[A-Z]{2,4}|Kindle|Silk)/i, "Amazon"],
];

function parseDevice(ua: string, os: NameVersion): { type: DeviceType; vendor: string | null; model: string | null } {
  if (/SmartTV|SMART-TV|HbbTV|AppleTV|CrKey|GoogleTV|Android TV|AFT[A-Z]|BRAVIA|Roku|Web0S|NetCast|Tizen.*TV/i.test(ua))
    return { type: "tv", vendor: /CrKey/.test(ua) ? "Google" : /AppleTV/.test(ua) ? "Apple" : /AFT[A-Z]/.test(ua) ? "Amazon" : null, model: null };
  if (/PlayStation/.test(ua)) return { type: "console", vendor: "Sony", model: m(ua, /(PlayStation [\w ]+?)(?:;|\))/) };
  if (/Xbox/.test(ua)) return { type: "console", vendor: "Microsoft", model: "Xbox" };
  if (/Nintendo/.test(ua)) return { type: "console", vendor: "Nintendo", model: m(ua, /(Nintendo \w+)/) };
  if (/Watch|wearable/i.test(ua) && /Android|watchOS/i.test(ua)) return { type: "wearable", vendor: null, model: null };
  if (/iPad/.test(ua)) return { type: "tablet", vendor: "Apple", model: "iPad" };
  if (/iPhone/.test(ua)) return { type: "mobile", vendor: "Apple", model: "iPhone" };
  if (/iPod/.test(ua)) return { type: "mobile", vendor: "Apple", model: "iPod touch" };
  if (os.name === "Android" || os.name === "HarmonyOS") {
    let model = m(ua, /Android[^;)]*;\s*(?:[a-z]{2}[-_][a-z]{2};\s*)?([^;)]+?)(?:\s+Build\/[^;)]*)?[;)]/i);
    if (model && /^(wv|Linux|U|Mobile)$/i.test(model.trim())) model = null;
    model = model?.trim() || null;
    const vendor = model ? (ANDROID_VENDORS.find(([re]) => re.test(model!))?.[1] ?? null) : null;
    const tablet = (/Tablet|Tab\b/i.test(ua) || !/Mobile/.test(ua)) && !/Mobi/.test(ua);
    return { type: tablet ? "tablet" : "mobile", vendor, model: model === "K" ? null : model };
  }
  if (/Mobi|Opera Mini|IEMobile|Windows Phone|KaiOS/i.test(ua)) return { type: "mobile", vendor: null, model: null };
  if (/Tablet/i.test(ua)) return { type: "tablet", vendor: null, model: null };
  if (os.name && ["Windows", "macOS", "Linux", "ChromeOS", "Ubuntu", "Fedora", "FreeBSD"].includes(os.name)) {
    return { type: "desktop", vendor: os.name === "macOS" ? "Apple" : null, model: os.name === "macOS" ? "Mac" : null };
  }
  return { type: "unknown", vendor: null, model: null };
}

export function parseUserAgent(input: string): ParsedUserAgent {
  const ua = input.trim();
  const notes: string[] = [];
  const botHit = BOTS.find(([re]) => re.test(ua));
  const os = parseOs(ua);
  const b = parseBrowser(ua);
  const engine = parseEngine(ua, b, os);
  let device = parseDevice(ua, os);
  if (botHit) device = { ...device, type: "bot" };
  const isWebView = /; wv\)/.test(ua) || (/(iPhone|iPad|iPod)/.test(ua) && /AppleWebKit/.test(ua) && !/Safari\//.test(ua)) || /FBAN|FBAV|Instagram|Line\//.test(ua);
  if (os.name === "Windows" && os.version === "10 or 11")
    notes.push("Windows 11 still reports \"Windows NT 10.0\". User-Agent Client Hints (platformVersion ≥ 13) are needed to tell them apart.");
  if (os.name === "macOS" && os.version === "10.15.7")
    notes.push("Browsers freeze the macOS version at 10.15.7, so the real macOS version cannot be read from the UA string.");
  if (/Android 10; K\)/.test(ua)) notes.push("This is a reduced Chrome UA: the Android version and device model are frozen (\"Android 10; K\").");
  if (/\.0\.0\.0/.test(b.version ?? "")) notes.push("Only the major browser version is exposed; minor and build numbers are reduced to 0.0.0.");
  if (os.name === "macOS" && /Version\/.*Safari/.test(ua) && !/Chrome/.test(ua))
    notes.push("iPads in desktop mode send a Macintosh UA string, so an iPad can look like a Mac.");
  return {
    ua,
    browser: { ...b, major: major(b.version) },
    engine,
    os,
    device,
    bot: { isBot: Boolean(botHit), name: botHit?.[1] ?? null, category: botHit?.[2] ?? null },
    isWebView,
    notes,
  };
}
