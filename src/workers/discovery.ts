/**
 * Discovery BullMQ workers.
 *
 * Processes discovery jobs from the queue:
 * - discovery:kvk    → KVK API scraping
 * - discovery:google → Google Places API scraping
 *
 * Each job triggers the full discovery pipeline (source fetch → dedup → website check → enrich → persist).
 */

import { createWorker } from "../lib/queue/index.js";
import { QUEUE_NAMES } from "./queues.js";
import { DiscoveryService } from "../modules/discovery/discovery.service.js";

export interface DiscoveryJobData {
  source: "kvk" | "google";
  city?: string;
  industry?: string;
  sbiCode?: string;
  limit?: number;
}

export function startDiscoveryWorkers() {
  const service = new DiscoveryService();

  const kvkWorker = createWorker<DiscoveryJobData>(
    QUEUE_NAMES.DISCOVERY_KVK,
    async (job) => {
      console.log(
        `[KVK Discovery] Starting job ${job.id}: city=${job.data.city}, sbiCode=${job.data.sbiCode}`,
      );

      const result = await service.discover({
        city: job.data.city,
        industry: job.data.industry,
        sbiCode: job.data.sbiCode,
        limit: job.data.limit,
        sources: ["kvk"],
      });

      console.log(
        `[KVK Discovery] Job ${job.id} complete: ${result.newLeads} new, ${result.duplicates} dupes, ${result.existingEnriched} enriched`,
      );

      if (result.errors.length > 0) {
        console.warn(`[KVK Discovery] Errors:`, result.errors);
      }

      return result;
    },
  );

  const googleWorker = createWorker<DiscoveryJobData>(
    QUEUE_NAMES.DISCOVERY_GOOGLE,
    async (job) => {
      console.log(
        `[Google Discovery] Starting job ${job.id}: city=${job.data.city}, industry=${job.data.industry}`,
      );

      const result = await service.discover({
        city: job.data.city,
        industry: job.data.industry,
        limit: job.data.limit,
        sources: ["google"],
      });

      console.log(
        `[Google Discovery] Job ${job.id} complete: ${result.newLeads} new, ${result.duplicates} dupes, ${result.existingEnriched} enriched`,
      );

      if (result.errors.length > 0) {
        console.warn(`[Google Discovery] Errors:`, result.errors);
      }

      return result;
    },
  );

  return { kvkWorker, googleWorker };
}
