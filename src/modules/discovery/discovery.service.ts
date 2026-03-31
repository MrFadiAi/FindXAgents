/**
 * Lead Discovery Service.
 *
 * Orchestrates the full discovery pipeline:
 * 1. Fetch leads from configured sources (KVK, Google Places)
 * 2. Deduplicate across sources and against existing DB records
 * 3. Check website existence for leads with URLs
 * 4. Enrich and merge data into unified Lead records
 * 5. Persist new leads to the database
 */

import { prisma } from "../../lib/db/client.js";
import { KvkSource } from "./sources/kvk.js";
import { GooglePlacesSource } from "./sources/google-places.js";
import { deduplicateBatch } from "./dedup.js";
import { checkWebsites, extractUrlsFromLeads } from "./website-checker.js";
import { enrichLeads, type EnrichedLead } from "./enrichment.js";
import type { WebsiteStatus } from "./website-checker.js";

// --- Public types ---

export interface DiscoveryParams {
  city?: string;
  industry?: string;
  /** SBI code for KVK search (e.g. "62.01" for IT consulting) */
  sbiCode?: string;
  limit?: number;
  /** Which sources to query. Defaults to both. */
  sources?: Array<"kvk" | "google">;
}

export interface DiscoveredLead {
  businessName: string;
  kvkNumber?: string;
  address?: string;
  city: string;
  industry?: string;
  website?: string;
  phone?: string;
  email?: string;
  source: string;
  sourceId?: string;
  /** Extra fields not in original interface but needed downstream */
  postcode?: string;
}

export interface DiscoveryResult {
  totalDiscovered: number;
  newLeads: number;
  duplicates: number;
  existingEnriched: number;
  websiteChecked: number;
  errors: string[];
}

// --- Service ---

export class DiscoveryService {
  private readonly kvkSource: KvkSource | null;
  private readonly googleSource: GooglePlacesSource | null;

  constructor() {
    const kvkApiKey = process.env.KVK_API_KEY;
    const googleApiKey = process.env.GOOGLE_MAPS_API_KEY;

    this.kvkSource = kvkApiKey ? new KvkSource({ apiKey: kvkApiKey }) : null;
    this.googleSource = googleApiKey
      ? new GooglePlacesSource({ apiKey: googleApiKey })
      : null;
  }

  /**
   * Run a full discovery pipeline for the given search parameters.
   * Returns stats about what was found, deduplicated, and persisted.
   */
  async discover(params: DiscoveryParams): Promise<DiscoveryResult> {
    const errors: string[] = [];
    const activeSources = params.sources ?? (["kvk", "google"] as const);

    // Step 1: Collect raw leads from all sources
    const allLeads: DiscoveredLead[] = [];

    if (activeSources.includes("kvk")) {
      if (!this.kvkSource) {
        errors.push("KVK API key not configured (KVK_API_KEY)");
      } else {
        try {
          for await (const lead of this.kvkSource.scrape({
            city: params.city,
            industry: params.sbiCode ?? params.industry,
            limit: params.limit,
          })) {
            allLeads.push(lead);
          }
        } catch (err) {
          errors.push(
            `KVK source error: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }

    if (activeSources.includes("google")) {
      if (!this.googleSource) {
        errors.push(
          "Google Maps API key not configured (GOOGLE_MAPS_API_KEY)",
        );
      } else {
        try {
          for await (const lead of this.googleSource.scrape({
            city: params.city,
            industry: params.industry,
            limit: params.limit,
          })) {
            allLeads.push(lead);
          }
        } catch (err) {
          errors.push(
            `Google Places source error: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }

    if (allLeads.length === 0) {
      return {
        totalDiscovered: 0,
        newLeads: 0,
        duplicates: 0,
        existingEnriched: 0,
        websiteChecked: 0,
        errors,
      };
    }

    // Step 2: Deduplicate
    const dedupResult = await deduplicateBatch(allLeads);

    // Step 3: Check websites for new leads with URLs
    const leadsToEnrich = dedupResult.newLeads;
    const urls = extractUrlsFromLeads(leadsToEnrich);
    let websiteResults: Map<string, { status: WebsiteStatus; finalUrl?: string }> =
      new Map();

    if (urls.length > 0) {
      try {
        websiteResults = await checkWebsites(urls);
      } catch (err) {
        errors.push(
          `Website check error: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // Step 4: Enrich leads with website data
    const enrichedLeads = enrichLeads(leadsToEnrich, websiteResults);

    // Step 5: Persist new leads to database
    await this.persistLeads(enrichedLeads);

    // Step 6: Enrich existing DB matches with new data
    await this.enrichExistingLeads(dedupResult.existingMatches);

    return {
      totalDiscovered: allLeads.length,
      newLeads: dedupResult.newLeads.length,
      duplicates: dedupResult.duplicates.length,
      existingEnriched: dedupResult.existingMatches.length,
      websiteChecked: urls.length,
      errors,
    };
  }

  private async persistLeads(leads: EnrichedLead[]): Promise<void> {
    if (leads.length === 0) return;

    // Batch create using createMany for efficiency
    // But we need upsert behavior for kvkNumber uniqueness
    const operations = leads.map((lead) =>
      prisma.lead.upsert({
        where: {
          kvkNumber: lead.kvkNumber ?? `_gen_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        },
        create: {
          businessName: lead.businessName,
          kvkNumber: lead.kvkNumber,
          address: lead.address,
          city: lead.city,
          industry: lead.industry,
          website: lead.website,
          hasWebsite: lead.hasWebsite,
          phone: lead.phone,
          email: lead.email,
          source: lead.enrichmentSources.join(","),
          sourceId: lead.sourceId,
          status: "discovered",
        },
        update: {
          // Update with richer data if we have it
          website: lead.website ?? undefined,
          hasWebsite: lead.hasWebsite,
          phone: lead.phone ?? undefined,
          email: lead.email ?? undefined,
          industry: lead.industry ?? undefined,
        },
      }),
    );

    // Execute in batches of 50 to avoid overwhelming the DB
    const BATCH_SIZE = 50;
    for (let i = 0; i < operations.length; i += BATCH_SIZE) {
      const batch = operations.slice(i, i + BATCH_SIZE);
      await Promise.all(batch);
    }
  }

  private async enrichExistingLeads(
    matches: Array<{ lead: DiscoveredLead; existingId: string }>,
  ): Promise<void> {
    if (matches.length === 0) return;

    for (const { lead, existingId } of matches) {
      const updateData: Record<string, unknown> = {};
      let needsUpdate = false;

      // Add data that's missing from the existing record
      if (lead.website) {
        updateData.website = lead.website;
        updateData.hasWebsite = true;
        needsUpdate = true;
      }
      if (lead.phone) {
        updateData.phone = lead.phone;
        needsUpdate = true;
      }
      if (lead.email) {
        updateData.email = lead.email;
        needsUpdate = true;
      }
      if (lead.industry) {
        updateData.industry = lead.industry;
        needsUpdate = true;
      }

      if (needsUpdate) {
        await prisma.lead.update({
          where: { id: existingId },
          data: updateData,
        });
      }
    }
  }
}
