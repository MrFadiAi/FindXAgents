/**
 * Enrichment pipeline.
 *
 * Merges data from KVK and Google sources into unified Lead records.
 * Strategy:
 * - KVK is authoritative for: kvkNumber, businessName, address, industry, postcode
 * - Google is authoritative for: website, phone, email (when available)
 * - First source to provide a field wins for non-authoritative fields
 */

import type { DiscoveredLead } from "./discovery.service.js";
import type { WebsiteStatus } from "./website-checker.js";

export interface EnrichedLead extends DiscoveredLead {
  hasWebsite: boolean;
  websiteStatus?: WebsiteStatus;
  enrichmentSources: string[];
}

/**
 * Enrich leads by merging data from multiple sources and website checks.
 *
 * Groups leads by dedup key (kvkNumber or name+city) and merges
 * data from all sources that matched the same business.
 */
export function enrichLeads(
  leads: DiscoveredLead[],
  websiteResults: Map<string, { status: WebsiteStatus; finalUrl?: string }>,
): EnrichedLead[] {
  return leads.map((lead) => {
    const website = lead.website;
    const websiteCheck = website ? websiteResults.get(website) : undefined;

    // Determine final website URL (follow redirect to final URL)
    const finalWebsite =
      websiteCheck?.status === "active"
        ? (websiteCheck.finalUrl ?? website)
        : website;

    const hasWebsite =
      websiteCheck?.status === "active" || websiteCheck?.status === "redirect";

    return {
      ...lead,
      website: finalWebsite,
      hasWebsite,
      websiteStatus: websiteCheck?.status,
      enrichmentSources: [lead.source],
    };
  });
}

/**
 * Merge two leads from different sources into one.
 * KVK data is authoritative for official business info.
 * Google data supplements with contact/website info.
 */
export function mergeLeads(
  kvkLead: DiscoveredLead | null,
  googleLead: DiscoveredLead | null,
): EnrichedLead {
  const sources: string[] = [];
  if (kvkLead) sources.push("kvk");
  if (googleLead) sources.push("google");

  const base = kvkLead ?? googleLead!;

  return {
    businessName: kvkLead?.businessName ?? googleLead?.businessName ?? "",
    kvkNumber: kvkLead?.kvkNumber ?? googleLead?.kvkNumber,
    address: kvkLead?.address ?? googleLead?.address,
    city: kvkLead?.city ?? googleLead?.city ?? "",
    industry: kvkLead?.industry ?? googleLead?.industry,
    // Google is authoritative for contact info
    website: googleLead?.website ?? kvkLead?.website,
    phone: googleLead?.phone ?? kvkLead?.phone,
    email: googleLead?.email ?? kvkLead?.email,
    source: kvkLead ? "kvk" : "google",
    sourceId: kvkLead?.sourceId ?? googleLead?.sourceId,
    hasWebsite: !!(googleLead?.website ?? kvkLead?.website),
    enrichmentSources: sources,
  };
}
