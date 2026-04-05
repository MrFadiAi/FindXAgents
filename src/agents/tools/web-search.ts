// SearXNG-powered web search — queries local SearXNG instance
// Replaces direct Google SERP scraping (which gets blocked)

import type { Tool } from "../core/types.js";

function getSearxngBaseUrl(): string {
  return process.env.SEARXNG_URL || "http://localhost:8080";
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  engines?: string[];
  score?: number;
  publishedDate?: string;
}

export async function searxngSearch(
  query: string,
  numResults = 20,
  options?: { categories?: string; language?: string; engines?: string }
): Promise<SearchResult[]> {
  const params = new URLSearchParams({
    q: query,
    format: "json",
  });

  if (options?.categories) params.set("categories", options.categories);
  if (options?.language) params.set("language", options.language);
  if (options?.engines) params.set("engines", options.engines);

  const url = `${getSearxngBaseUrl()}/search?${params.toString()}`;

  const response = await fetch(url, {
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`SearXNG search failed: ${response.status}`);
  }

  const data = (await response.json()) as {
    results: Array<{
      title: string;
      url: string;
      content: string;
      engine: string;
      engines: string[];
      score: number;
      publishedDate: string | null;
    }>;
  };

  const results: SearchResult[] = data.results
    .slice(0, numResults)
    .map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.content || "",
      engines: r.engines || [r.engine],
      score: r.score,
      publishedDate: r.publishedDate || undefined,
    }));

  return results;
}

export const webSearchTool: Tool = {
  name: "web_search",
  description:
    "Search the web for businesses or information using SearXNG meta search. Returns a list of results with titles, URLs, and snippets. Use this to find businesses matching a query.",
  input_schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search query, e.g. 'restaurants in Amsterdam'",
      },
      num_results: {
        type: "number",
        description: "Max number of results (default 20)",
      },
      categories: {
        type: "string",
        description: "Search categories: general, news, videos, images, etc.",
      },
      language: {
        type: "string",
        description: "Language code, e.g. 'nl' for Dutch, 'en' for English",
      },
    },
    required: ["query"],
  },
  async execute(input) {
    const query = input.query as string;
    const numResults = (input.num_results as number) || 20;
    const categories = input.categories as string | undefined;
    const language = input.language as string | undefined;

    try {
      const results = await searxngSearch(query, numResults, {
        categories,
        language,
      });
      return JSON.stringify(results);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return JSON.stringify({
        error: `SearXNG search failed: ${message}. Ensure SearXNG is running at ${getSearxngBaseUrl()}`,
        results: [],
      });
    }
  },
};
