import type { Tool } from "../core/types.js";
import { KvkSource } from "../../modules/discovery/sources/kvk.js";

export const kvkSearchTool: Tool = {
  name: "kvk_search",
  description:
    "Search the Dutch Chamber of Commerce (KVK) API for businesses. Returns structured business data including name, address, city, KVK number, and website. Only available if KVK_API_KEY is configured.",
  input_schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Business name or trade name to search",
      },
      city: {
        type: "string",
        description: "City to filter by",
      },
      industry: {
        type: "string",
        description: "SBI code or industry description to filter by",
      },
      limit: {
        type: "number",
        description: "Max number of results (default 50)",
      },
    },
    required: ["query"],
  },
  async execute(input: Record<string, unknown>) {
    if (!process.env.KVK_API_KEY) {
      return JSON.stringify({
        available: false,
        message:
          "KVK API is not configured (missing KVK_API_KEY). Use web_search instead to find businesses.",
      });
    }

    try {
      const source = new KvkSource({ apiKey: process.env.KVK_API_KEY });
      const leads: Array<Record<string, unknown>> = [];

      for await (const lead of source.scrape({
        city: input.city as string | undefined,
        industry: input.industry as string | undefined,
        limit: (input.limit as number) || 50,
      })) {
        leads.push({
          businessName: lead.businessName,
          kvkNumber: lead.kvkNumber,
          address: lead.address,
          city: lead.city,
          industry: lead.industry,
          website: lead.website,
          postcode: lead.postcode,
        });
      }

      return JSON.stringify({
        available: true,
        source: "kvk",
        totalFound: leads.length,
        results: leads,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : String(err);
      return JSON.stringify({
        available: true,
        error: `KVK API call failed: ${message}`,
        results: [],
      });
    }
  },
};
