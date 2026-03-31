/**
 * Technology detection via HTTP headers and HTML parsing.
 *
 * Identifies CMS, hosting, analytics, frameworks, and other
 * technologies used by a website.
 */

import * as cheerio from "cheerio";
import type { DetectedTechnology } from "../types.js";
import { renderPage } from "../../../lib/browser/client.js";

interface HttpResponse {
  headers: Record<string, string>;
  html: string;
  finalUrl: string;
}

/** Fetch URL and extract headers + HTML. */
async function fetchPage(url: string): Promise<HttpResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; FindXBot/1.0; +https://findx.nl)",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });

    const html = await response.text();

    return { headers, html, finalUrl: response.url };
  } finally {
    clearTimeout(timeout);
  }
}

// --- Detection rules ---

interface DetectionRule {
  category: DetectedTechnology["category"];
  detect: (res: HttpResponse, $: cheerio.CheerioAPI) => DetectedTechnology | null;
}

const rules: DetectionRule[] = [
  // CMS detection
  {
    category: "cms",
    detect: (_, $) => {
      const generator = $('meta[name="generator"]').attr("content") ?? "";
      if (/wordpress/i.test(generator))
        return { name: "WordPress", category: "cms", confidence: 0.95, version: generator };
      if (/drupal/i.test(generator))
        return { name: "Drupal", category: "cms", confidence: 0.95, version: generator };
      if (/joomla/i.test(generator))
        return { name: "Joomla", category: "cms", confidence: 0.95, version: generator };
      if (/shopify/i.test(generator))
        return { name: "Shopify", category: "cms", confidence: 0.95, version: generator };
      if (/wix/i.test(generator))
        return { name: "Wix", category: "cms", confidence: 0.9, version: generator };
      if (/squarespace/i.test(generator))
        return { name: "Squarespace", category: "cms", confidence: 0.9, version: generator };
      if (/webflow/i.test(generator))
        return { name: "Webflow", category: "cms", confidence: 0.9, version: generator };
      return null;
    },
  },
  {
    category: "cms",
    detect: (res) => {
      const linkHeader = res.headers["link"] ?? "";
      if (/wp-json/i.test(linkHeader))
        return { name: "WordPress", category: "cms", confidence: 0.8 };
      return null;
    },
  },
  {
    category: "cms",
    detect: (_, $) => {
      if ($('script[src*="wp-includes"]').length > 0 || $('link[href*="wp-content"]').length > 0)
        return { name: "WordPress", category: "cms", confidence: 0.85 };
      return null;
    },
  },
  {
    category: "cms",
    detect: (_, $) => {
      if ($('[class*="shopify"]').length > 0 || $('script[src*="shopify"]').length > 0)
        return { name: "Shopify", category: "cms", confidence: 0.85 };
      return null;
    },
  },

  // Hosting detection
  {
    category: "hosting",
    detect: (res) => {
      const server = res.headers["server"] ?? "";
      if (/apache/i.test(server))
        return { name: "Apache", category: "hosting", confidence: 0.7, version: server };
      if (/nginx/i.test(server))
        return { name: "Nginx", category: "hosting", confidence: 0.7, version: server };
      if (/cloudflare/i.test(server))
        return { name: "Cloudflare", category: "hosting", confidence: 0.9 };
      if (/microsoft-iis/i.test(server))
        return { name: "IIS", category: "hosting", confidence: 0.7, version: server };
      if (/liteSpeed/i.test(server))
        return { name: "LiteSpeed", category: "hosting", confidence: 0.8 };
      return null;
    },
  },

  // Analytics detection
  {
    category: "analytics",
    detect: (_, $) => {
      const scripts = $("script").toArray();
      for (const s of scripts) {
        const src = $(s).attr("src") ?? "";
        const content = $(s).html() ?? "";
        if (/google-analytics\.com|gtag|GA-/i.test(src + content))
          return { name: "Google Analytics", category: "analytics", confidence: 0.9 };
      }
      return null;
    },
  },
  {
    category: "analytics",
    detect: (_, $) => {
      const scripts = $("script").toArray();
      for (const s of scripts) {
        const src = $(s).attr("src") ?? "";
        const content = $(s).html() ?? "";
        if (/gtm\.js|googletagmanager/i.test(src + content))
          return { name: "Google Tag Manager", category: "analytics", confidence: 0.9 };
      }
      return null;
    },
  },
  {
    category: "analytics",
    detect: (_, $) => {
      const html = $.html() ?? "";
      if (/matomo|piwik/i.test(html))
        return { name: "Matomo", category: "analytics", confidence: 0.85 };
      return null;
    },
  },
  {
    category: "analytics",
    detect: (_, $) => {
      const html = $.html() ?? "";
      if (/hotjar/i.test(html))
        return { name: "Hotjar", category: "analytics", confidence: 0.85 };
      return null;
    },
  },

  // Framework detection
  {
    category: "framework",
    detect: (_, $) => {
      if ($('[data-reactroot], [data-reactid]').length > 0)
        return { name: "React", category: "framework", confidence: 0.8 };
      return null;
    },
  },
  {
    category: "framework",
    detect: (_, $) => {
      if ($('[ng-version]').length > 0)
        return { name: "Angular", category: "framework", confidence: 0.9 };
      return null;
    },
  },
  {
    category: "framework",
    detect: (_, $) => {
      if ($('[data-v-]').length > 0 || $('[data-server-rendered]').length > 0)
        return { name: "Vue.js", category: "framework", confidence: 0.8 };
      return null;
    },
  },
  {
    category: "framework",
    detect: (_, $) => {
      if ($("__NEXT_DATA__").length > 0 || $('script[id="__NEXT_DATA__"]').length > 0)
        return { name: "Next.js", category: "framework", confidence: 0.9 };
      return null;
    },
  },
];

export interface TechDetectResult {
  technologies: DetectedTechnology[];
  responseHeaders: Record<string, string>;
  finalUrl: string;
}

export async function detectTechnologies(
  url: string,
  options?: { renderJs?: boolean },
): Promise<TechDetectResult> {
  let httpResponse: HttpResponse;

  if (options?.renderJs) {
    // Use Lightpanda/Chromium for JS rendering — better framework detection
    const rendered = await renderPage(url);
    // Fetch separately for headers (browser rendering doesn't give raw headers)
    let headers: Record<string, string> = {};
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(10_000),
        method: "HEAD",
        headers: { "User-Agent": "Mozilla/5.0 (compatible; FindXBot/1.0)" },
      });
      res.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
    } catch { /* headers optional */ }
    httpResponse = { headers, html: rendered.html, finalUrl: rendered.finalUrl };
  } else {
    httpResponse = await fetchPage(url);
  }

  const $ = cheerio.load(httpResponse.html);

  const seen = new Set<string>();
  const technologies: DetectedTechnology[] = [];

  for (const rule of rules) {
    try {
      const result = rule.detect(httpResponse, $);
      if (result && !seen.has(result.name)) {
        seen.add(result.name);
        technologies.push(result);
      }
    } catch {
      // Skip failed detection rules
    }
  }

  return {
    technologies,
    responseHeaders: httpResponse.headers,
    finalUrl: httpResponse.finalUrl,
  };
}
