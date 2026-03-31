/**
 * KVK Open API source adapter.
 *
 * Connects to the Dutch Chamber of Commerce (KVK) business registry to
 * discover companies by SBI code, city, and other filters.
 *
 * API docs: https://developers.kvk.nl/
 * Rate limit: ~10 req/s
 */

import type { DiscoveredLead, DiscoveryParams } from "../discovery.service.js";
import { createKvkRateLimiter, type RateLimiter } from "./rate-limiter.js";

const KVK_BASE_URL = "https://api.kvk.nl/api/v2/zoeken";
const KVK_PAGE_SIZE = 100; // max allowed by API

export interface KvkSearchResult {
  kvkNummer: string;
  vestigingsnummer?: string;
  handelsnamen?: Array<{ naam: string; volgorde: number }>;
  adressen?: Array<{
    type: string;
    straatnaam?: string;
    huisnummer?: string;
    plaats?: string;
    postcode?: string;
    land?: string;
  }>;
  sbiActiviteiten?: Array<{
    sbiCode: string;
    sbiOmschrijving: string;
    indicatieHoofdactiviteit: boolean;
  }>;
  websites?: string[];
  links?: Array<{ rel: string; href: string; method: string }>;
}

export interface KvkSearchResponse {
  pagina: number;
  aantal: number;
  totaal: number;
  resultaten: KvkSearchResult[];
}

export interface KvkSourceConfig {
  apiKey: string;
  baseUrl?: string;
}

function buildQueryString(params: DiscoveryParams, page: number): string {
  const qs = new URLSearchParams();
  qs.set("pagina", String(page));
  qs.set("aantal", String(KVK_PAGE_SIZE));

  if (params.city) qs.set("plaats", params.city);
  if (params.industry) qs.set("sbiCode", params.industry);

  return qs.toString();
}

function mapKvkResultToLead(result: KvkSearchResult): DiscoveredLead {
  const primaryName =
    result.handelsnamen?.sort((a, b) => a.volgorde - b.volgorde)[0]?.naam ??
    "Unknown";

  const bezoekAdres = result.adressen?.find((a) => a.type === "bezoekadres");
  const address =
    bezoekAdres && bezoekAdres.straatnaam
      ? `${bezoekAdres.straatnaam} ${bezoekAdres.huisnummer ?? ""}`.trim()
      : undefined;
  const city = bezoekAdres?.plaats ?? "";
  const postcode = bezoekAdres?.postcode;

  const hoofdactiviteit = result.sbiActiviteiten?.find(
    (s) => s.indicatieHoofdactiviteit,
  );
  const industry = hoofdactiviteit?.sbiOmschrijving;

  // Build full address including postcode if available
  const fullAddress =
    postcode && address ? `${address}, ${postcode}` : address;

  return {
    businessName: primaryName,
    kvkNumber: result.kvkNummer,
    address: fullAddress,
    city,
    industry,
    website: result.websites?.[0],
    phone: undefined, // KVK basis API doesn't expose phone
    email: undefined, // KVK basis API doesn't expose email
    source: "kvk",
    sourceId: result.vestigingsnummer ?? result.kvkNummer,
    postcode,
  };
}

export class KvkSource {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly rateLimiter: RateLimiter;

  constructor(config: KvkSourceConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? KVK_BASE_URL;
    this.rateLimiter = createKvkRateLimiter();
  }

  async *scrape(
    params: DiscoveryParams,
  ): AsyncGenerator<DiscoveredLead, void, undefined> {
    let page = 1;
    let totalFetched = 0;
    const limit = params.limit ?? 1000;

    while (totalFetched < limit) {
      await this.rateLimiter.acquire();

      const qs = buildQueryString(params, page);
      const url = `${this.baseUrl}?${qs}`;

      const response = await fetch(url, {
        headers: {
          apikey: this.apiKey,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        if (response.status === 429) {
          // Rate limited — back off and retry
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
        const body = await response.text().catch(() => "");
        throw new Error(
          `KVK API error ${response.status}: ${body.slice(0, 200)}`,
        );
      }

      const data = (await response.json()) as KvkSearchResponse;

      if (!data.resultaten?.length) break;

      for (const result of data.resultaten) {
        if (totalFetched >= limit) return;
        yield mapKvkResultToLead(result);
        totalFetched++;
      }

      // Check if there are more pages
      const totalPages = Math.ceil(data.totaal / KVK_PAGE_SIZE);
      if (page >= totalPages) break;
      page++;
    }
  }
}
