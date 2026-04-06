// Image quality auditor — checks alt text, sizes, formats, lazy loading, responsive images
import * as cheerio from "cheerio";
import type { Tool } from "../core/types.js";

interface ImageIssue {
  src: string;
  alt: string;
  hasAlt: boolean;
  width: number | null;
  height: number | null;
  loading: string;
  hasLazyLoad: boolean;
  format: string;
  estimatedSize: string;
  issues: string[];
}

export const auditImagesTool: Tool = {
  name: "audit_images",
  description:
    "Audit all images on a webpage for quality issues: missing alt text, missing dimensions, lazy loading, oversized images, format issues. Returns per-image analysis and overall quality score.",
  input_schema: {
    type: "object",
    properties: {
      url: { type: "string", description: "The webpage URL to audit images on" },
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

      const images: ImageIssue[] = [];
      let totalImages = 0;
      let missingAlt = 0;
      let missingDimensions = 0;
      let noLazyLoad = 0;
      let decorativeOnly = 0;

      $("img").each((_, el) => {
        totalImages++;
        const src = $(el).attr("src") || $(el).attr("data-src") || "";
        const alt = $(el).attr("alt") || "";
        const width = $(el).attr("width") ? parseInt($(el).attr("width")!, 10) : null;
        const height = $(el).attr("height") ? parseInt($(el).attr("height")!, 10) : null;
        const loading = $(el).attr("loading") || "";
        const hasLazyLoad = loading === "lazy" || !!$(el).attr("data-src");

        const format = src.match(/\.(jpg|jpeg|png|gif|webp|svg|avif)/i)?.[1]?.toLowerCase() || "unknown";
        const isSvg = format === "svg";

        const issues: string[] = [];
        if (!alt) {
          missingAlt++;
          issues.push("missing alt text");
        }
        if (!width && !height && !isSvg) {
          missingDimensions++;
          issues.push("missing width/height attributes");
        }
        if (!hasLazyLoad && totalImages > 2) {
          noLazyLoad++;
          issues.push("not using lazy loading");
        }
        if (isSvg && src.includes("data:image")) {
          decorativeOnly++;
        }

        // Skip tiny icons and tracking pixels from detailed report
        const isTiny = (width && width < 50) || (height && height < 50);
        if (!isTiny && src) {
          images.push({
            src: src.slice(0, 200),
            alt: alt.slice(0, 100),
            hasAlt: !!alt,
            width,
            height,
            loading,
            hasLazyLoad,
            format,
            estimatedSize: width && height ? `${width}x${height}` : "unknown",
            issues,
          });
        }
      });

      // Background images from CSS (limited detection)
      let bgImageCount = 0;
      $('[style*="background"]').each((_, el) => {
        const style = $(el).attr("style") || "";
        if (/background-image|background:\s*url/i.test(style)) bgImageCount++;
      });

      const qualityScore = totalImages > 0
        ? Math.round(
            ((totalImages - missingAlt) / totalImages) * 30 +
            ((totalImages - missingDimensions) / totalImages) * 20 +
            ((totalImages - noLazyLoad) / totalImages) * 20 +
            (Math.min(images.filter((i) => i.format === "webp" || i.format === "avif").length / Math.max(totalImages, 1), 1)) * 30,
          )
        : 100;

      return JSON.stringify({
        url,
        totalImages,
        backgroundImageCount: bgImageCount,
        qualityScore: Math.max(0, Math.min(100, qualityScore)),
        summary: {
          missingAlt,
          missingDimensions,
          noLazyLoad,
          webpCount: images.filter((i) => i.format === "webp").length,
          avifCount: images.filter((i) => i.format === "avif").length,
          pngCount: images.filter((i) => i.format === "png").length,
          jpgCount: images.filter((i) => i.format === "jpg" || i.format === "jpeg").length,
        },
        issues: images.filter((i) => i.issues.length > 0).slice(0, 20),
        recommendation:
          missingAlt > totalImages * 0.3
            ? `${missingAlt} images missing alt text — impacts SEO and accessibility`
            : noLazyLoad > 3
              ? "Add lazy loading to below-fold images to improve page speed"
              : qualityScore >= 70
                ? "Image quality is good"
                : "Some image optimizations recommended",
      });
    } catch (err) {
      return JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
    }
  },
};
