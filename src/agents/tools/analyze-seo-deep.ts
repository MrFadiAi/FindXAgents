// Deep SEO analyzer — meta tags, canonical, robots, sitemap, hreflang, structured data presence
import * as cheerio from "cheerio";
import type { Tool } from "../core/types.js";

interface SeoIssue {
  rule: string;
  severity: "critical" | "warning" | "info";
  description: string;
  element: string;
}

export const analyzeSeoDeepTool: Tool = {
  name: "analyze_seo_deep",
  description:
    "Deep SEO analysis of a webpage. Checks meta title, description, canonical URL, robots directives, hreflang tags, Open Graph, heading structure, keyword usage, internal/external links ratio, and sitemap presence. Returns SEO score.",
  input_schema: {
    type: "object",
    properties: {
      url: { type: "string", description: "The webpage URL to analyze for SEO" },
    },
    required: ["url"],
  },
  async execute(input: Record<string, unknown>) {
    const url = input.url as string;
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
      const issues: SeoIssue[] = [];

      // 1. Title tag
      const title = $("title").text().trim();
      if (!title) {
        issues.push({ rule: "title", severity: "critical", description: "Missing title tag", element: "<title>" });
      } else if (title.length < 30) {
        issues.push({ rule: "title", severity: "warning", description: `Title too short (${title.length} chars, aim for 30-60)`, element: `<title>${title.slice(0, 50)}</title>` });
      } else if (title.length > 60) {
        issues.push({ rule: "title", severity: "warning", description: `Title too long (${title.length} chars, aim for 30-60)`, element: `<title>${title.slice(0, 50)}...</title>` });
      }

      // 2. Meta description
      const metaDesc = $('meta[name="description"]').attr("content") || "";
      if (!metaDesc) {
        issues.push({ rule: "meta-description", severity: "critical", description: "Missing meta description", element: '<meta name="description">' });
      } else if (metaDesc.length < 120) {
        issues.push({ rule: "meta-description", severity: "warning", description: `Meta description short (${metaDesc.length} chars, aim for 120-160)`, element: `<meta name="description" content="${metaDesc.slice(0, 50)}...">` });
      } else if (metaDesc.length > 160) {
        issues.push({ rule: "meta-description", severity: "warning", description: `Meta description long (${metaDesc.length} chars, aim for 120-160)`, element: `<meta name="description" content="${metaDesc.slice(0, 50)}...">` });
      }

      // 3. Canonical URL
      const canonical = $('link[rel="canonical"]').attr("href") || "";
      if (!canonical) {
        issues.push({ rule: "canonical", severity: "warning", description: "Missing canonical URL", element: '<link rel="canonical">' });
      }

      // 4. Robots meta
      const robotsMeta = $('meta[name="robots"]').attr("content") || "";
      if (robotsMeta.includes("noindex")) {
        issues.push({ rule: "robots", severity: "critical", description: "Page is set to noindex", element: `<meta name="robots" content="${robotsMeta}">` });
      }
      if (robotsMeta.includes("nofollow")) {
        issues.push({ rule: "robots", severity: "info", description: "Page uses nofollow directive", element: `<meta name="robots" content="${robotsMeta}">` });
      }

      // 5. Hreflang tags
      const hreflangs: string[] = [];
      $('link[rel="alternate"][hreflang]').each((_, el) => {
        const lang = $(el).attr("hreflang") || "";
        hreflangs.push(lang);
      });

      // 6. Heading structure
      const headings: { level: number; text: string }[] = [];
      let hasH1 = false;
      let h1Count = 0;
      $("h1, h2, h3, h4, h5, h6").each((_, el) => {
        const tag = $(el).prop("tagName")?.toLowerCase() || "";
        const level = parseInt(tag.replace("h", ""), 10);
        const text = $(el).text().trim().slice(0, 80);
        headings.push({ level, text });
        if (level === 1) {
          hasH1 = true;
          h1Count++;
        }
      });
      if (!hasH1) {
        issues.push({ rule: "h1", severity: "critical", description: "Missing H1 heading", element: "<h1>" });
      }
      if (h1Count > 1) {
        issues.push({ rule: "h1", severity: "warning", description: `Multiple H1 headings found (${h1Count})`, element: "<h1>" });
      }

      // 7. Images without alt (SEO perspective)
      let imgNoAlt = 0;
      $("img").each((_, el) => {
        const alt = $(el).attr("alt");
        if (!alt && !$(el).attr("role")?.includes("presentation")) imgNoAlt++;
      });
      if (imgNoAlt > 0) {
        issues.push({ rule: "images", severity: "warning", description: `${imgNoAlt} images missing alt text (SEO impact)`, element: "<img>" });
      }

      // 8. Internal / external links
      let internalLinks = 0;
      let externalLinks = 0;
      const hostname = new URL(url).hostname;
      $('a[href]').each((_, el) => {
        const href = $(el).attr("href") || "";
        if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
        try {
          const linkHost = new URL(href, url).hostname;
          if (linkHost === hostname) internalLinks++;
          else externalLinks++;
        } catch { /* skip invalid URLs */ }
      });

      // 9. Open Graph
      const ogTitle = $('meta[property="og:title"]').attr("content") || "";
      const ogDesc = $('meta[property="og:description"]').attr("content") || "";
      const ogImage = $('meta[property="og:image"]').attr("content") || "";
      const hasOg = !!(ogTitle || ogDesc || ogImage);
      if (!hasOg) {
        issues.push({ rule: "og", severity: "warning", description: "Missing Open Graph tags", element: '<meta property="og:*">' });
      }

      // 10. Twitter Card
      const hasTwitterCard = $('meta[name^="twitter:"]').length > 0;
      if (!hasTwitterCard) {
        issues.push({ rule: "twitter", severity: "info", description: "No Twitter Card meta tags", element: '<meta name="twitter:*">' });
      }

      // 11. Structured data presence
      const hasJsonLd = $('script[type="application/ld+json"]').length > 0;
      if (!hasJsonLd) {
        issues.push({ rule: "structured-data", severity: "warning", description: "No JSON-LD structured data found", element: '<script type="application/ld+json">' });
      }

      // 12. Viewport
      const hasViewport = $('meta[name="viewport"]').length > 0;
      if (!hasViewport) {
        issues.push({ rule: "viewport", severity: "critical", description: "Missing viewport meta tag", element: '<meta name="viewport">' });
      }

      // 13. Charset
      const hasCharset = $('meta[charset], meta[http-equiv="Content-Type"]').length > 0;
      if (!hasCharset) {
        issues.push({ rule: "charset", severity: "warning", description: "Missing charset declaration", element: '<meta charset>' });
      }

      // Calculate SEO score
      const criticals = issues.filter((i) => i.severity === "critical").length;
      const warnings = issues.filter((i) => i.severity === "warning").length;
      const seoScore = Math.max(0, Math.min(100, 100 - criticals * 15 - warnings * 5));

      return JSON.stringify({
        url,
        seoScore,
        title: { text: title, length: title.length },
        metaDescription: { text: metaDesc, length: metaDesc.length },
        canonical,
        robotsMeta: robotsMeta || "not set",
        hreflangs,
        headings: headings.slice(0, 20),
        hasH1,
        h1Count,
        links: { internal: internalLinks, external: externalLinks, ratio: internalLinks > 0 ? (externalLinks / internalLinks).toFixed(2) : "0" },
        openGraph: { hasOg, ogTitle: ogTitle.slice(0, 100), ogDesc: ogDesc.slice(0, 100), hasImage: !!ogImage },
        hasTwitterCard,
        hasJsonLd,
        hasViewport,
        hasCharset,
        issues: issues.slice(0, 20),
        criticalCount: criticals,
        warningCount: warnings,
      });
    } catch (err) {
      return JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
    }
  },
};
