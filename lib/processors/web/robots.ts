/**
 * robots.txt generation, parsing, validation and URL testing following RFC 9309
 * (Robots Exclusion Protocol) and Google's documented matching rules:
 *  - a crawler obeys the group with the most specific (longest) matching user-agent token,
 *    falling back to "*"; groups naming the same agent are merged;
 *  - within that group the longest matching path rule wins, and Allow wins ties;
 *  - "*" matches any sequence of characters and "$" anchors the end of the URL path.
 */

export interface RobotsGroup {
  userAgents: string[];
  allow: string[];
  disallow: string[];
  crawlDelay?: number | null;
}

export interface RobotsConfig {
  groups: RobotsGroup[];
  sitemaps: string[];
  /** Optional comment block written at the top. */
  comment?: string;
}

export interface AiCrawler {
  token: string;
  owner: string;
  purpose: string;
}

/** Published user-agent tokens of AI training/answer crawlers (as documented by their operators). */
export const AI_CRAWLERS: AiCrawler[] = [
  { token: "GPTBot", owner: "OpenAI", purpose: "Model training" },
  { token: "OAI-SearchBot", owner: "OpenAI", purpose: "ChatGPT search index" },
  { token: "ChatGPT-User", owner: "OpenAI", purpose: "User-initiated fetches" },
  { token: "ClaudeBot", owner: "Anthropic", purpose: "Model training" },
  { token: "Claude-SearchBot", owner: "Anthropic", purpose: "Search index" },
  { token: "Claude-User", owner: "Anthropic", purpose: "User-initiated fetches" },
  { token: "anthropic-ai", owner: "Anthropic", purpose: "Legacy token" },
  { token: "Google-Extended", owner: "Google", purpose: "Gemini training (does not affect Search)" },
  { token: "Applebot-Extended", owner: "Apple", purpose: "Apple Intelligence training" },
  { token: "CCBot", owner: "Common Crawl", purpose: "Open web corpus used for training" },
  { token: "PerplexityBot", owner: "Perplexity", purpose: "Answer engine index" },
  { token: "Perplexity-User", owner: "Perplexity", purpose: "User-initiated fetches" },
  { token: "Bytespider", owner: "ByteDance", purpose: "Model training" },
  { token: "meta-externalagent", owner: "Meta", purpose: "Model training" },
  { token: "Amazonbot", owner: "Amazon", purpose: "Alexa / model training" },
  { token: "cohere-ai", owner: "Cohere", purpose: "Model training" },
  { token: "Diffbot", owner: "Diffbot", purpose: "Knowledge graph extraction" },
  { token: "MistralAI-User", owner: "Mistral AI", purpose: "User-initiated fetches" },
  { token: "DuckAssistBot", owner: "DuckDuckGo", purpose: "AI answers" },
  { token: "AI2Bot", owner: "Allen Institute for AI", purpose: "Model training" },
];

export const SEARCH_ENGINES = ["Googlebot", "Bingbot", "DuckDuckBot", "YandexBot", "Baiduspider", "Applebot"];

export type PresetId = "allow-all" | "block-all" | "block-ai" | "wordpress" | "search-only";

export const PRESETS: { id: PresetId; label: string; description: string; build: () => RobotsGroup[] }[] = [
  {
    id: "allow-all",
    label: "Allow everything",
    description: "All crawlers may access every path.",
    build: () => [{ userAgents: ["*"], allow: [], disallow: [""] }],
  },
  {
    id: "block-all",
    label: "Block everything",
    description: "Ask all crawlers to stay away (staging sites).",
    build: () => [{ userAgents: ["*"], allow: [], disallow: ["/"] }],
  },
  {
    id: "block-ai",
    label: "Block AI crawlers",
    description: "Allow search engines, opt out of known AI training and answer crawlers.",
    build: () => [
      { userAgents: ["*"], allow: [], disallow: [""] },
      { userAgents: AI_CRAWLERS.map((c) => c.token), allow: [], disallow: ["/"] },
    ],
  },
  {
    id: "wordpress",
    label: "WordPress",
    description: "Keep crawlers out of the admin area while allowing admin-ajax.php.",
    build: () => [{ userAgents: ["*"], allow: ["/wp-admin/admin-ajax.php"], disallow: ["/wp-admin/", "/?s=", "/search/"] }],
  },
  {
    id: "search-only",
    label: "Search engines only",
    description: "Only major search engines may crawl; everything else is disallowed.",
    build: () => [
      { userAgents: SEARCH_ENGINES, allow: [], disallow: [""] },
      { userAgents: ["*"], allow: [], disallow: ["/"] },
    ],
  },
];

/** Builds robots.txt text from a configuration. */
export function generateRobotsTxt(cfg: RobotsConfig): string {
  const lines: string[] = [];
  if (cfg.comment?.trim()) for (const l of cfg.comment.trim().split(/\r?\n/)) lines.push(`# ${l}`);
  for (const g of cfg.groups) {
    const agents = g.userAgents.map((a) => a.trim()).filter(Boolean);
    if (!agents.length) continue;
    if (lines.length) lines.push("");
    for (const a of agents) lines.push(`User-agent: ${a}`);
    const allow = g.allow.map((p) => p.trim()).filter(Boolean);
    const disallow = g.disallow.map((p) => p.trim());
    for (const p of allow) lines.push(`Allow: ${p}`);
    const realDisallow = disallow.filter(Boolean);
    for (const p of realDisallow) lines.push(`Disallow: ${p}`);
    if (!allow.length && !realDisallow.length) lines.push("Disallow:");
    if (g.crawlDelay != null && Number.isFinite(g.crawlDelay) && g.crawlDelay > 0) lines.push(`Crawl-delay: ${g.crawlDelay}`);
  }
  const maps = cfg.sitemaps.map((s) => s.trim()).filter(Boolean);
  if (maps.length) {
    lines.push("");
    for (const s of maps) lines.push(`Sitemap: ${s}`);
  }
  return `${lines.join("\n")}\n`;
}

export interface RobotsIssue {
  line: number;
  severity: "error" | "warning" | "info";
  message: string;
}

export interface ParsedRule {
  type: "allow" | "disallow";
  path: string;
  line: number;
}

export interface ParsedGroup {
  userAgents: string[];
  rules: ParsedRule[];
  crawlDelay: number | null;
  line: number;
}

export interface ParsedRobots {
  groups: ParsedGroup[];
  sitemaps: string[];
  issues: RobotsIssue[];
}

const KNOWN = new Set(["user-agent", "allow", "disallow", "sitemap", "crawl-delay", "host", "clean-param", "request-rate", "visit-time", "noindex", "nofollow"]);
const MAX_GOOGLE_BYTES = 500 * 1024;

/** Parses robots.txt and reports problems with line numbers. */
export function parseRobotsTxt(text: string): ParsedRobots {
  const issues: RobotsIssue[] = [];
  const groups: ParsedGroup[] = [];
  const sitemaps: string[] = [];
  const bytes = new TextEncoder().encode(text).length;
  if (bytes > MAX_GOOGLE_BYTES) issues.push({ line: 0, severity: "warning", message: `File is ${Math.round(bytes / 1024)} KiB; Google ignores content after the first 500 KiB.` });
  let current: ParsedGroup | null = null;
  let lastWasAgent = false;
  const lines = text.replace(/^﻿/, "").split(/\r\n|\r|\n/);
  lines.forEach((rawLine, i) => {
    const ln = i + 1;
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) return;
    const idx = line.indexOf(":");
    if (idx < 0) {
      issues.push({ line: ln, severity: "error", message: `Missing ":" separator in "${line.slice(0, 60)}".` });
      return;
    }
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    const normKey = key === "useragent" || key === "user agent" ? "user-agent" : key;
    if (!KNOWN.has(normKey)) {
      issues.push({ line: ln, severity: "warning", message: `Unknown directive "${line.slice(0, idx).trim()}" will be ignored.` });
      return;
    }
    if (normKey !== key) issues.push({ line: ln, severity: "warning", message: `Non-standard spelling "${line.slice(0, idx).trim()}"; use "User-agent".` });
    switch (normKey) {
      case "user-agent": {
        if (!value) {
          issues.push({ line: ln, severity: "error", message: "User-agent has no value." });
          return;
        }
        if (!current || !lastWasAgent) {
          current = { userAgents: [], rules: [], crawlDelay: null, line: ln };
          groups.push(current);
        }
        current.userAgents.push(value);
        lastWasAgent = true;
        return;
      }
      case "allow":
      case "disallow": {
        lastWasAgent = false;
        if (!current) {
          issues.push({ line: ln, severity: "error", message: `${normKey === "allow" ? "Allow" : "Disallow"} appears before any User-agent line and is ignored.` });
          return;
        }
        if (value && !value.startsWith("/") && !value.startsWith("*"))
          issues.push({ line: ln, severity: "warning", message: `Path "${value}" should start with "/" or "*".` });
        if (/^https?:\/\//i.test(value)) issues.push({ line: ln, severity: "error", message: "Rules take paths, not full URLs." });
        if (!value && normKey === "disallow") {
          current.rules.push({ type: "disallow", path: "", line: ln });
          return;
        }
        if (!value) {
          issues.push({ line: ln, severity: "info", message: "Empty Allow has no effect." });
          return;
        }
        current.rules.push({ type: normKey, path: value, line: ln });
        return;
      }
      case "crawl-delay": {
        lastWasAgent = false;
        const n = Number(value);
        if (!value || !Number.isFinite(n) || n < 0) issues.push({ line: ln, severity: "error", message: `Crawl-delay must be a non-negative number (got "${value}").` });
        else if (current) {
          current.crawlDelay = n;
          issues.push({ line: ln, severity: "info", message: "Crawl-delay is honoured by Bing and Yandex but ignored by Googlebot." });
        } else issues.push({ line: ln, severity: "error", message: "Crawl-delay appears before any User-agent line." });
        return;
      }
      case "sitemap": {
        lastWasAgent = false;
        try {
          const u = new URL(value);
          if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error();
          sitemaps.push(u.href);
        } catch {
          issues.push({ line: ln, severity: "error", message: `Sitemap must be an absolute URL (got "${value}").` });
        }
        return;
      }
      case "noindex":
      case "nofollow":
        lastWasAgent = false;
        issues.push({ line: ln, severity: "warning", message: `"${key}" in robots.txt is not supported by Google (since 2019). Use a robots meta tag or X-Robots-Tag header.` });
        return;
      default:
        lastWasAgent = false;
        issues.push({ line: ln, severity: "info", message: `"${line.slice(0, idx).trim()}" is non-standard and only understood by some crawlers.` });
    }
  });
  for (const g of groups)
    if (!g.rules.length && g.crawlDelay == null)
      issues.push({ line: g.line, severity: "warning", message: `Group for ${g.userAgents.join(", ")} has no rules (it allows everything).` });
  if (!groups.length) issues.push({ line: 0, severity: "info", message: "No User-agent groups found: every crawler may access everything." });
  return { groups, sitemaps, issues };
}

/** Converts a robots path pattern into a RegExp anchored at the path start. */
export function patternToRegExp(pattern: string): RegExp {
  let src = "";
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  for (const ch of body) src += ch === "*" ? ".*" : ch.replace(/[.+?^${}()|[\]\\/]/g, "\\$&");
  return new RegExp(`^${src}${anchored ? "$" : ""}`);
}

/** Normalises percent-encoding so /caf%C3%A9 and /café compare equal. */
function normPath(p: string): string {
  try {
    return encodeURI(decodeURI(p));
  } catch {
    return p;
  }
}

export interface RobotsVerdict {
  allowed: boolean;
  group: ParsedGroup | null;
  rule: ParsedRule | null;
  matchedAgent: string | null;
}

/** Decides whether a crawler may fetch a path (path may include a query string). */
export function isAllowed(parsed: ParsedRobots, userAgent: string, pathOrUrl: string): RobotsVerdict {
  let path = pathOrUrl.trim() || "/";
  if (/^https?:\/\//i.test(path)) {
    try {
      const u = new URL(path);
      path = u.pathname + u.search;
    } catch {
      /* keep as is */
    }
  }
  if (!path.startsWith("/")) path = `/${path}`;
  if (path === "/robots.txt") return { allowed: true, group: null, rule: null, matchedAgent: null };
  const token = userAgent.trim().toLowerCase();
  let best: { len: number; agent: string } | null = null;
  for (const g of parsed.groups)
    for (const a of g.userAgents) {
      const al = a.toLowerCase();
      if (al === "*") continue;
      if (token.includes(al) && (!best || al.length > best.len)) best = { len: al.length, agent: a };
    }
  const agentKey = best ? best.agent.toLowerCase() : "*";
  const matching = parsed.groups.filter((g) => g.userAgents.some((a) => a.toLowerCase() === agentKey));
  if (!matching.length) return { allowed: true, group: null, rule: null, matchedAgent: null };
  const rules = matching.flatMap((g) => g.rules).filter((r) => r.path !== "");
  const target = normPath(path);
  let winner: ParsedRule | null = null;
  for (const r of rules) {
    if (!patternToRegExp(normPath(r.path)).test(target)) continue;
    if (!winner || r.path.length > winner.path.length || (r.path.length === winner.path.length && r.type === "allow")) winner = r;
  }
  return {
    allowed: !winner || winner.type === "allow",
    group: matching[0],
    rule: winner,
    matchedAgent: best ? best.agent : "*",
  };
}
