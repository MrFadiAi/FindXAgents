// Performance deep-dive — resource sizes, render-blocking resources, optimization opportunities
import * as cheerio from "cheerio";
import type { Tool } from "../core/types.js";

interface ResourceInfo {
  type: string;
  src: string;
  renderBlocking: boolean;
  async: boolean;
  defer: boolean;
}

export const analyzePerformanceTool: Tool = {
  name: "analyze_performance",
  description:
    "Analyze webpage performance beyond Lighthouse. Checks resource sizes, render-blocking scripts/styles, lazy loading, image optimization, CSS/JS count, and font loading. Returns optimization recommendations.",
  input_schema: {
    type: "object",
    properties: {
      url: { type: "string", description: "The webpage URL to analyze performance" },
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
      const htmlSize = new TextEncoder().encode(html).length;

      const resources: ResourceInfo[] = [];
      let renderBlockingCount = 0;
      let asyncScripts = 0;
      let deferScripts = 0;

      // Scripts
      $("script[src]").each((_, el) => {
        const src = $(el).attr("src") || "";
        const isAsync = !!$(el).attr("async");
        const isDefer = !!$(el).attr("defer");
        const isRenderBlocking = !isAsync && !isDefer && !src.includes("async") && $(el).attr("type") !== "module";
        if (isAsync) asyncScripts++;
        if (isDefer) deferScripts++;
        if (isRenderBlocking) renderBlockingCount++;
        resources.push({ type: "script", src: src.slice(0, 200), renderBlocking: isRenderBlocking, async: isAsync, defer: isDefer });
      });

      // Inline scripts
      const inlineScriptCount = $("script:not([src])").length;
      const inlineScriptSize = $("script:not([src])").map((_, el) => ($(el).html() || "").length).get().reduce((a, b) => a + b, 0);

      // Stylesheets
      $('link[rel="stylesheet"]').each((_, el) => {
        const href = $(el).attr("href") || "";
        const hasMedia = !!$(el).attr("media") && $(el).attr("media") !== "all";
        if (!hasMedia) renderBlockingCount++;
        resources.push({ type: "stylesheet", src: href.slice(0, 200), renderBlocking: !hasMedia, async: false, defer: false });
      });

      // Inline styles
      const inlineStyleCount = $("style").length;

      // Fonts
      const fonts: string[] = [];
      $('link[rel="preload"][as="font"], link[rel="stylesheet"]').each((_, el) => {
        const href = $(el).attr("href") || "";
        if (/fonts\.googleapis|fonts\.gstatic|typekit|fontawesome/i.test(href)) {
          fonts.push(href.slice(0, 150));
        }
      });
      $("style").each((_, el) => {
        const content = $(el).html() || "";
        const importMatch = content.match(/@import\s+url\(['"]?([^'"]+)['"]?\)/g);
        if (importMatch) fonts.push(...importMatch.map((m) => m.slice(0, 150)));
      });

      // Images
      let imagesNoLazyLoad = 0;
      let imagesNoWidth = 0;
      let imagesTotal = 0;
      $("img").each((_, el) => {
        imagesTotal++;
        const loading = $(el).attr("loading");
        const width = $(el).attr("width");
        if (loading !== "lazy" && !$(el).attr("data-src")) imagesNoLazyLoad++;
        if (!width) imagesNoWidth++;
      });

      // Preconnect / preload
      const preconnects: string[] = [];
      $('link[rel="preconnect"]').each((_, el) => {
        const href = $(el).attr("href") || "";
        if (href) preconnects.push(href);
      });

      // Compression check
      const contentEncoding = response.headers.get("content-encoding") || "none";

      // Calculate optimization score
      let score = 100;
      score -= renderBlockingCount * 5;
      score -= Math.min(fonts.length * 3, 15);
      score -= Math.min(imagesNoLazyLoad * 2, 20);
      if (contentEncoding === "none") score -= 10;
      if (inlineScriptSize > 50000) score -= 5;
      score = Math.max(0, Math.min(100, score));

      return JSON.stringify({
        url,
        htmlSizeKB: Math.round(htmlSize / 1024),
        optimizationScore: score,
        compression: contentEncoding,
        resources: {
          totalScripts: resources.filter((r) => r.type === "script").length,
          inlineScripts: inlineScriptCount,
          inlineScriptSizeKB: Math.round(inlineScriptSize / 1024),
          stylesheets: resources.filter((r) => r.type === "stylesheet").length,
          inlineStyles: inlineStyleCount,
          totalImages: imagesTotal,
        },
        renderBlocking: {
          count: renderBlockingCount,
          scripts: resources.filter((r) => r.type === "script" && r.renderBlocking).slice(0, 10),
          stylesheets: resources.filter((r) => r.type === "stylesheet" && r.renderBlocking).slice(0, 10),
        },
        asyncDefer: { asyncCount: asyncScripts, deferCount: deferScripts },
        fonts: fonts.slice(0, 10),
        images: {
          total: imagesTotal,
          noLazyLoad: imagesNoLazyLoad,
          noWidth: imagesNoWidth,
        },
        preconnects,
        recommendations: [
          renderBlockingCount > 0 ? `${renderBlockingCount} render-blocking resources — add async/defer to scripts` : null,
          imagesNoLazyLoad > 3 ? `${imagesNoLazyLoad} images without lazy loading` : null,
          contentEncoding === "none" ? "Enable gzip/brotli compression" : null,
          fonts.length > 2 ? `${fonts.length} font files — consider reducing or using font-display: swap` : null,
          inlineScriptSize > 50000 ? `Large inline scripts (${Math.round(inlineScriptSize / 1024)}KB)` : null,
        ].filter(Boolean),
      });
    } catch (err) {
      return JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
    }
  },
};
