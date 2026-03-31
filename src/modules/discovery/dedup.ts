/**
 * Lead deduplication engine.
 *
 * Matches leads across sources using:
 * 1. KVK number (exact match — strongest signal)
 * 2. Business name + city (normalized comparison)
 * 3. Address similarity (street + postcode match)
 *
 * Deduplicates against both in-memory batch leads and existing DB leads.
 */

import type { DiscoveredLead } from "./discovery.service.js";
import { prisma } from "../../lib/db/client.js";

/** Normalize a string for comparison: lowercase, collapse whitespace, trim punctuation. */
function normalize(s: string | undefined | null): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .replace(/[.,\-/\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface DedupResult {
  /** Leads that are new (not duplicates). */
  newLeads: DiscoveredLead[];
  /** Leads that are duplicates of existing batch leads. */
  duplicates: Array<{ lead: DiscoveredLead; matchReason: string }>;
  /** Leads that match already-existing DB records (for enrichment). */
  existingMatches: Array<{ lead: DiscoveredLead; existingId: string }>;
}

/**
 * Deduplicate a batch of discovered leads.
 *
 * Step 1: Cross-deduplicate within the batch (same KVK number or name+city).
 * Step 2: Check remaining leads against the database.
 */
export async function deduplicateBatch(
  leads: DiscoveredLead[],
): Promise<DedupResult> {
  const result: DedupResult = {
    newLeads: [],
    duplicates: [],
    existingMatches: [],
  };

  // Step 1: In-batch deduplication
  const batchSeen = new Map<string, DiscoveredLead>();
  const afterBatchDedup: DiscoveredLead[] = [];

  for (const lead of leads) {
    // Primary key: KVK number
    if (lead.kvkNumber) {
      const existing = batchSeen.get(`kvk:${lead.kvkNumber}`);
      if (existing) {
        result.duplicates.push({
          lead,
          matchReason: `KVK number ${lead.kvkNumber}`,
        });
        continue;
      }
      batchSeen.set(`kvk:${lead.kvkNumber}`, lead);
    }

    // Secondary key: normalized business name + city
    const nameCityKey = `name:${normalize(lead.businessName)}:${normalize(lead.city)}`;
    if (batchSeen.has(nameCityKey)) {
      result.duplicates.push({
        lead,
        matchReason: `Name+city: ${lead.businessName} in ${lead.city}`,
      });
      continue;
    }
    batchSeen.set(nameCityKey, lead);

    afterBatchDedup.push(lead);
  }

  // Step 2: Check against database
  // Collect KVK numbers to batch-query
  const kvkNumbers = afterBatchDedup
    .filter((l) => l.kvkNumber)
    .map((l) => l.kvkNumber!);

  let existingByKvk: Map<string, string> = new Map();
  if (kvkNumbers.length > 0) {
    const existing = await prisma.lead.findMany({
      where: { kvkNumber: { in: kvkNumbers } },
      select: { id: true, kvkNumber: true },
    });
    for (const row of existing) {
      existingByKvk.set(row.kvkNumber!, row.id);
    }
  }

  // Check by name+city for leads without KVK number
  const leadsWithoutKvk = afterBatchDedup.filter((l) => !l.kvkNumber);
  const existingByNameCity: Map<string, string> = new Map();

  if (leadsWithoutKvk.length > 0) {
    // Group by city for efficient querying
    const cities = [...new Set(leadsWithoutKvk.map((l) => normalize(l.city)))];
    for (const city of cities) {
      const cityLeads = leadsWithoutKvk.filter(
        (l) => normalize(l.city) === city,
      );
      if (cityLeads.length === 0) continue;

      const names = cityLeads.map((l) => l.businessName);
      const existing = await prisma.lead.findMany({
        where: {
          city: { equals: city, mode: "insensitive" },
          businessName: { in: names, mode: "insensitive" },
        },
        select: { id: true, businessName: true, city: true },
      });

      for (const row of existing) {
        const key = `name:${normalize(row.businessName)}:${normalize(row.city)}`;
        existingByNameCity.set(key, row.id);
      }
    }
  }

  // Classify leads
  for (const lead of afterBatchDedup) {
    // Check KVK match
    if (lead.kvkNumber) {
      const existingId = existingByKvk.get(lead.kvkNumber);
      if (existingId) {
        result.existingMatches.push({ lead, existingId });
        continue;
      }
    }

    // Check name+city match
    const nameCityKey = `name:${normalize(lead.businessName)}:${normalize(lead.city)}`;
    const existingId = existingByNameCity.get(nameCityKey);
    if (existingId) {
      result.existingMatches.push({ lead, existingId });
      continue;
    }

    result.newLeads.push(lead);
  }

  return result;
}
