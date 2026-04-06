// Broken link checker — finds dead internal and external links
import * as cheerio from "cheerio";
import type { Tool } from "../core/types.js";

interface LinkResult {
  url: string;
  status: number;
  text: string;
  type: "internal" | "external";
  broken: boolean;
}

export const checkBrokenLinksTool: Tool = {
  name: "check_broken_links",
  description:
    "Check a webpage for broken links. Tests all internal and external links, reports HTTP status codes, and identifies dead links. Returns broken link count and details.",
  input_schema: {
    type: "object",
    properties: {
      url: { type: "string", description: "The webpage URL to check for broken links" },
      maxLinks: { type: "number", description: "Maximum links to test (default 30)" },
    },
    required: ["url"],
  },
  async execute(input: Record<string, unknown>) {
    const url = input.url as string;
    const maxLinks = (input.maxLinks as number) || 30;
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
        signal: AbortSignal.timeout(15000),
        redirect: "follow",
      });
      if (!response.ok) {
        return JSON.stringify({ error: `Failed to fetch: ${response.status}` });
      }
      const html = await response.text();
      const $ = cheerio.load(html);

      const hostname = new URL(url).hostname;
      const linkSet = new Map<string, { text: string; type: "internal" | "external" }>();

      // Collect unique links
      $('a[href]').each((_, el) => {
        const href = $(el).attr("href") || "";
        const text = $(el).text().trim().slice(0, 60);
        if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) return;
        try {
          const resolved = new URL(href, url).toString();
          if (!linkSet.has(resolved)) {
            const isInternal = new URL(resolved).hostname === hostname;
            linkSet.set(resolved, { text, type: isInternal ? "internal" : "external" });
          }
        } catch { /* skip invalid */ }
      });

      const linksToCheck = [...linkSet.entries()].slice(0, maxLinks);
      const results: LinkResult[] = [];
      let brokenCount = 0;

      // Check links in parallel batches of 5
      const batchSize = 5;
      for (let i = 0; i < linksToCheck.length; i += batchSize) {
        const batch = linksToCheck.slice(i, i + batchSize);
        const checks = batch.map(async ([linkUrl, meta]) => {
          try {
            const linkResp = await fetch(linkUrl, {
              method: "HEAD",
              headers: {
                "User-Agent":
                  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              },
              signal: AbortSignal.timeout(8000),
              redirect: "follow",
            });
            const status = linkResp.status;
            const broken = status >= 400;
            if (broken) brokenCount++;
            return { url: linkUrl, status, text: meta.text, type: meta.type, broken };
          } catch {
            brokenCount++;
            return { url: linkUrl, status: 0, text: meta.text, type: meta.type, broken: true };
          }
        });
        const batchResults = await Promise.all(checks);
        results.push(...batchResults);
      }

      const brokenLinks = results.filter((r) => r.broken);
      const internalBroken = brokenLinks.filter((r) => r.type === "internal").length;
      const externalBroken = brokenLinks.filter((r) => r.type === "external").length;

      return JSON.stringify({
        url,
        totalLinksFound: linkSet.size,
        linksChecked: results.length,
        brokenCount,
        internalBroken,
        externalBroken,
        brokenLinks: brokenLinks.slice(0, 20),
        healthyLinks: results.length - brokenCount,
        recommendation:
          brokenCount === 0
            ? "All links are healthy"
            : internalBroken > 0
              ? `${internalBroken} broken internal links found — fix these for SEO and UX`
              : `${externalBroken} broken external links found — update or remove them`,
      });
    } catch (err) {
      return JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
    }
  },
};
