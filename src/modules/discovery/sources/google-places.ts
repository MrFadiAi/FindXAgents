/**
 * Google Places API source adapter.
 *
 * Searches businesses by location/category using Google Places,
 * retrieves website presence and contact info.
 *
 * API: Google Places API (Text Search + Place Details)
 * Rate limit: managed via quota — conservative 5 req/s
 */

import type { DiscoveredLead, DiscoveryParams } from "../discovery.service.js";
import { createGoogleRateLimiter, type RateLimiter } from "./rate-limiter.js";

const PLACES_SEARCH_URL = "https://maps.googleapis.com/maps/api/place/textsearch/json";
const PLACE_DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json";

export interface GooglePlaceResult {
  place_id: string;
  name: string;
  formatted_address: string;
  geometry?: { location: { lat: number; lng: number } };
  types?: string[];
  rating?: number;
  user_ratings_total?: number;
  business_status?: string;
}

export interface GooglePlaceDetails {
  name: string;
  formatted_address: string;
  formatted_phone_number?: string;
  international_phone_number?: string;
  website?: string;
  url?: string;
  types?: string[];
  business_status?: string;
}

export interface GoogleSearchResponse {
  status: string;
  results: GooglePlaceResult[];
  next_page_token?: string;
  error_message?: string;
}

export interface GoogleDetailsResponse {
  status: string;
  result: GooglePlaceDetails;
  error_message?: string;
}

export interface GooglePlacesConfig {
  apiKey: string;
}

function buildSearchQuery(params: DiscoveryParams): string {
  const parts: string[] = ["business"];
  if (params.industry) parts.push(params.industry);
  if (params.city) parts.push(`in ${params.city}`);
  else parts.push("in Netherlands");
  return parts.join(" ");
}

function extractCity(address: string): string {
  // Dutch addresses typically end with "1234 AB City" or "1234AB City"
  const match = address.match(/\d{4}\s?[A-Z]{2}\s+(.+?)(?:,\s*Netherlands)?$/i);
  if (match) return match[1].trim();
  // Fallback: last comma-separated segment
  const segments = address.split(",").map((s) => s.trim());
  const last = segments[segments.length - 1];
  return last?.replace(/Netherlands/i, "").trim() || "Unknown";
}

export class GooglePlacesSource {
  private readonly apiKey: string;
  private readonly rateLimiter: RateLimiter;

  constructor(config: GooglePlacesConfig) {
    this.apiKey = config.apiKey;
    this.rateLimiter = createGoogleRateLimiter();
  }

  async *scrape(
    params: DiscoveryParams,
  ): AsyncGenerator<DiscoveredLead, void, undefined> {
    const limit = params.limit ?? 500;
    let totalFetched = 0;
    let pageToken: string | undefined;

    const query = buildSearchQuery(params);

    while (totalFetched < limit) {
      await this.rateLimiter.acquire();

      const qs = new URLSearchParams({
        query,
        key: this.apiKey,
        language: "nl",
      });
      if (pageToken) qs.set("pagetoken", pageToken);

      const response = await fetch(`${PLACES_SEARCH_URL}?${qs}`);
      if (!response.ok) {
        throw new Error(`Google Places API error: ${response.status}`);
      }

      const data = (await response.json()) as GoogleSearchResponse;

      if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
        throw new Error(
          `Google Places error: ${data.status} — ${data.error_message ?? "unknown"}`,
        );
      }

      if (!data.results?.length) break;

      for (const place of data.results) {
        if (totalFetched >= limit) return;

        // Get details (website, phone) for each place
        const details = await this.getDetails(place.place_id);

        const lead: DiscoveredLead = {
          businessName: place.name,
          address: place.formatted_address,
          city: extractCity(place.formatted_address),
          industry: params.industry,
          website: details?.website,
          phone:
            details?.international_phone_number ??
            details?.formatted_phone_number,
          source: "google",
          sourceId: place.place_id,
        };

        yield lead;
        totalFetched++;
      }

      // Check for next page
      if (!data.next_page_token) break;
      pageToken = data.next_page_token;
      // Google requires a short delay before using next_page_token
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  private async getDetails(
    placeId: string,
  ): Promise<GooglePlaceDetails | null> {
    await this.rateLimiter.acquire();

    const qs = new URLSearchParams({
      place_id: placeId,
      key: this.apiKey,
      fields:
        "name,formatted_address,formatted_phone_number,international_phone_number,website,url,types,business_status",
      language: "nl",
    });

    const response = await fetch(`${PLACE_DETAILS_URL}?${qs}`);
    if (!response.ok) return null;

    const data = (await response.json()) as GoogleDetailsResponse;
    if (data.status !== "OK") return null;

    return data.result;
  }
}
