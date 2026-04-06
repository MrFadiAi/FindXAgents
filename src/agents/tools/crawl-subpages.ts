// Multi-page website crawler — discovers and scrapes subpages for comprehensive analysis
import * as cheerio from "cheerio";
import { renderPage } from "../../lib/browser/client.js";
import type { Tool } from "../core/types.js";

interface CrawledPage {
  url: string;
  title: string;
  depth: number;
  wordCount: number;
  headings: string[];
  hasContactForm: boolean;
  hasPhone: boolean;
  hasEmail: boolean;
  statusCode: number;
}

export const crawlSubpagesTool: Tool = {
  name: "crawl_subpages",
  description:
    "Crawl a website to discover and analyze subpages. Discovers links from the homepage, then fetches each subpage to extract content, forms, and contact info. Returns a list of crawled pages with their content summary. Max 20 pages.",
  input_schema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "The website homepage URL to start crawling from",
      },
      maxPages: {
        type: "number",
        description: "Maximum number of pages to crawl (default: 15, max: 25)",
      },
      maxDepth: {
        type: "number",
        description: "Maximum crawl depth from homepage (default: 2, max: 3)",
      },
    },
    required: ["url"],
  },
  async execute(input) {
    const startUrl = input.url as string;
    const maxPages = Math.min((input.maxPages as number) || 15, 25);
    const maxDepth = Math.min((input.maxDepth as number) || 2, 3);

    let baseUrl: string;
    try {
      const parsed = new URL(startUrl);
      baseUrl = `${parsed.protocol}//${parsed.hostname}`;
    } catch {
      return JSON.stringify({ error: "Invalid URL" });
    }

    const visited = new Set<string>();
    const queue: Array<{ url: string; depth: number }> = [{ url: startUrl, depth: 0 }];
    const results: CrawledPage[] = [];

    while (queue.length > 0 && results.length < maxPages) {
      const target = queue.shift()!;
      const normalized = target.url.replace(/\/+$/, "").split("#")[0].split("?")[0];

      if (visited.has(normalized)) continue;
      visited.add(normalized);

      // Only crawl same-domain URLs
      if (!normalized.startsWith(baseUrl) && !normalized.startsWith(startUrl)) continue;

      try {
        const response = await fetch(normalized, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          },
          signal: AbortSignal.timeout(10000),
          redirect: "follow",
        });

        if (!response.ok) {
          results.push({
            url: normalized,
            title: "",
            depth: target.depth,
            wordCount: 0,
            headings: [],
            hasContactForm: false,
            hasPhone: false,
            hasEmail: false,
            statusCode: response.status,
          });
          continue;
        }

        const html = await response.text();
        const $ = cheerio.load(html);

        // Extract subpage links for further crawling
        if (target.depth < maxDepth) {
          $("a[href]").each((_, el) => {
            const href = $(el).attr("href") || "";
            let fullUrl: string;
            try {
              fullUrl = new URL(href, startUrl).href;
            } catch {
              return;
            }
            const clean = fullUrl.replace(/\/+$/, "").split("#")[0].split("?")[0];
            if (
              !visited.has(clean) &&
              (clean.startsWith(baseUrl) || clean.startsWith(startUrl)) &&
              !clean.match(/\.(png|jpg|jpeg|gif|svg|pdf|zip|mp4|mp3|css|js|ico|woff|woff2|ttf|eot)(\?|$)/i)
            ) {
              queue.push({ url: clean, depth: target.depth + 1 });
            }
          });
        }

        const title = $("title").first().text().trim();
        const bodyText = $("body").text().replace(/\s+/g, " ").trim();
        const wordCount = bodyText.split(/\s+/).filter(Boolean).length;
        const headings: string[] = [];
        $("h1, h2, h3").each((_, el) => {
          const t = $(el).text().trim();
          if (t && t.length < 200) headings.push(t);
        });
        const hasContactForm = $('form input[type="email"], form input[name*="email"], form textarea').length > 0;
        const hasPhone = /(\+?\d[\d\s-]{7,}\d)/.test(bodyText);
        const hasEmail = /[\w.-]+@[\w.-]+\.\w{2,}/.test(bodyText);

        results.push({
          url: normalized,
          title,
          depth: target.depth,
          wordCount,
          headings: headings.slice(0, 10),
          hasContactForm,
          hasPhone,
          hasEmail,
          statusCode: response.status,
        });
      } catch {
        // Skip failed pages silently
      }
    }

    return JSON.stringify({
      startUrl,
      pagesCrawled: results.length,
      totalPagesDiscovered: visited.size,
      pages: results,
    });
  },
};
