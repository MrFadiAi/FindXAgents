// Competitor comparison tool — searches SearXNG for competing businesses
// Uses the same SearXNG endpoint as web-search tool

import { searxngSearch } from "./web-search.js";
import type { Tool } from "../core/types.js";

export const competitorCompareTool: Tool = {
  name: "competitor_compare",
  description:
    "Find competitors for a business in a given city or region. Searches the web and returns the top 5 competing businesses with names, websites, and descriptions. Use this to understand a business's competitive landscape.",
  input_schema: {
    type: "object",
    properties: {
      businessName: {
        type: "string",
        description: "The name of the business to find competitors for",
      },
      city: {
        type: "string",
        description: "The city or region to search in (e.g. 'Amsterdam')",
      },
      industry: {
        type: "string",
        description: "The industry or category (e.g. 'restaurant', 'plumber', 'bakery')",
      },
      website: {
        type: "string",
        description: "The business's own website (used to exclude from results)",
      },
    },
    required: ["businessName", "city"],
  },
  async execute(input) {
    const businessName = input.businessName as string;
    const city = input.city as string;
    const industry = input.industry as string | undefined;
    const website = input.website as string | undefined;

    try {
      // Build search query based on available info
      let query: string;
      if (industry) {
        query = `${industry} in ${city}`;
      } else {
        query = `${businessName} competitors ${city}`;
      }

      const results = await searxngSearch(query, 10, {
        language: "nl",
      });

      // Exclude the business's own website from results
      const ownDomain = website
        ? new URL(website.startsWith("http") ? website : `https://${website}`).hostname.replace(/^www\./, "")
        : "";

      const competitors = results
        .filter((r) => {
          const resultDomain = new URL(r.url).hostname.replace(/^www\./, "");
          return resultDomain !== ownDomain;
        })
        .slice(0, 5)
        .map((r) => ({
          name: r.title,
          url: r.url,
          snippet: r.snippet,
        }));

      return JSON.stringify({
        businessName,
        city,
        query,
        competitors,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return JSON.stringify({
        businessName,
        city,
        competitors: [],
        note: `Could not fetch competitor data: ${message}. SearXNG may be unavailable.`,
      });
    }
  },
};
