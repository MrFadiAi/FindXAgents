import type { Tool } from "../core/types.js";
import { GooglePlacesSource } from "../../modules/discovery/sources/google-places.js";

export const googlePlacesTool: Tool = {
  name: "google_places_search",
  description:
    "Search Google Places API for businesses by location and category. Returns structured data including name, address, phone, website, and city. Only available if GOOGLE_MAPS_API_KEY is configured.",
  input_schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search query, e.g. 'restaurants in Amsterdam'",
      },
      city: {
        type: "string",
        description: "City to search in (e.g. 'Amsterdam')",
      },
      industry: {
        type: "string",
        description: "Industry or category to filter by",
      },
      limit: {
        type: "number",
        description: "Max number of results (default 50)",
      },
    },
    required: ["query"],
  },
  async execute(input: Record<string, unknown>) {
    if (!process.env.GOOGLE_MAPS_API_KEY) {
      return JSON.stringify({
        available: false,
        message:
          "Google Places API is not configured (missing GOOGLE_MAPS_API_KEY). Use web_search instead to find businesses.",
      });
    }

    try {
      const source = new GooglePlacesSource({
        apiKey: process.env.GOOGLE_MAPS_API_KEY,
      });
      const leads: Array<Record<string, unknown>> = [];

      const query = input.query as string;
      // Extract city from query if not explicitly provided
      const city = (input.city as string) || undefined;
      const industry = (input.industry as string) || undefined;

      // Build params — use query text as the industry/city hint for the
      // source when explicit params are missing, so the search stays useful.
      for await (const lead of source.scrape({
        city,
        industry: industry ?? query,
        limit: (input.limit as number) || 50,
      })) {
        leads.push({
          businessName: lead.businessName,
          address: lead.address,
          city: lead.city,
          industry: lead.industry,
          website: lead.website,
          phone: lead.phone,
          placeId: lead.sourceId,
        });
      }

      return JSON.stringify({
        available: true,
        source: "google_places",
        totalFound: leads.length,
        results: leads,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : String(err);
      return JSON.stringify({
        available: true,
        error: `Google Places API call failed: ${message}`,
        results: [],
      });
    }
  },
};
