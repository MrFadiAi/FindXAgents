// Extract structured data — Schema.org, JSON-LD, Open Graph, microdata parser
import * as cheerio from "cheerio";
import type { Tool } from "../core/types.js";

interface StructuredItem {
  type: string;
  schema: string;
  data: Record<string, unknown>;
}

export const extractStructuredDataTool: Tool = {
  name: "extract_structured_data",
  description:
    "Extract structured data (Schema.org, JSON-LD, Open Graph, microdata) from a webpage. Returns all structured data items found including LocalBusiness, Product, Article, FAQ, BreadcrumbList, and other schema types.",
  input_schema: {
    type: "object",
    properties: {
      url: { type: "string", description: "The webpage URL to extract structured data from" },
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
        return JSON.stringify({ error: `Failed to fetch ${url}: ${response.status}` });
      }
      const html = await response.text();
      const $ = cheerio.load(html);
      const items: StructuredItem[] = [];

      // JSON-LD
      $('script[type="application/ld+json"]').each((_, el) => {
        try {
          const data = JSON.parse($(el).html());
          const graph = data["@graph"];
          const graphType = data["@type"];
          if (graph && Array.isArray(graph)) {
            for (const item of graph) {
              items.push({
                type: (item["@type"] as string[])?.join(", ") || "unknown",
                schema: "JSON-LD",
                data: item,
              });
            }
          } else if (graphType) {
            items.push({
              type: (data["@type"] as string)?.toString() || "unknown",
              schema: "JSON-LD",
              data,
            });
          }
        } catch { /* skip invalid JSON-LD */ }
      });

      // Microdata (itemscope / itemtype attributes)
      $("[itemscope], [itemtype]").each((_, el) => {
        const scope = $(el).attr("itemscope") || "";
        const itemType = $(el).attr("itemtype") || "";
        if (scope || itemType) {
          const props: Record<string, string> = {};
          $(el).find("[itemprop]").each((_, propEl) => {
            const prop = $(propEl).attr("itemprop");
            const content = $(propEl).attr("content") || $(propEl).text().trim();
            if (prop && content) props[prop] = content;
          });
          items.push({
            type: itemType || scope,
            schema: "Microdata",
            data: props,
          });
        }
      });

      // Open Graph meta tags
      const ogData: Record<string, string> = {};
      $('meta[property^="og:"]').each((_, el) => {
        const prop = $(el).attr("property");
        const content = $(el).attr("content");
        if (prop && content) ogData[prop] = content;
      });
      if (Object.keys(ogData).length > 0) {
        items.push({
          type: ogData["og:type"] || "website",
          schema: "OpenGraph",
          data: ogData,
        });
      }

      // Twitter Card meta tags
      const tcData: Record<string, string> = {};
      $('meta[name^="twitter:"]').each((_, el) => {
        const name = $(el).attr("name");
        const content = $(el).attr("content");
        if (name && content) tcData[name] = content;
      });
      if (Object.keys(tcData).length > 0) {
        items.push({
          type: "TwitterCard",
          schema: "TwitterCard",
          data: tcData,
        });
      }

      // Summarize business-specific data
      const localBusiness = items.find(
        (i) => i.type.includes("LocalBusiness") || i.type.includes("Restaurant") || i.type.includes("Store"),
      );
      const hasProductSchema = items.some((i) => i.type.includes("Product"));
      const hasArticleSchema = items.some((i) => i.type.includes("Article"));
      const hasFaqSchema = items.some((i) => i.type.includes("FAQPage"));

      return JSON.stringify({
        url,
        totalItems: items.length,
        schemas: [...new Set(items.map((i) => i.schema))],
        hasLocalBusiness: !!localBusiness,
        hasProductSchema,
        hasArticleSchema,
        hasFaqSchema,
        items: items.slice(0, 30),
      });
    } catch (err) {
      return JSON.stringify({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },
};
