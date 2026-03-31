// Bulk actions for leads — analyze, outreach, and status changes in batch.

import { prisma } from "../../lib/db/client.js";
import { analysisQueue, outreachGenerateQueue } from "../../workers/queues.js";
import type { LeadStatus } from "@prisma/client";

interface BulkResult {
  queued: number;
  skipped: number;
  reason: string;
}

export async function bulkAnalyze(leadIds: string[]): Promise<BulkResult> {
  const leads = await prisma.lead.findMany({
    where: { id: { in: leadIds } },
    select: { id: true, website: true },
  });

  const withWebsite = leads.filter((l) => l.website);
  const skipped = leads.length - withWebsite.length;

  for (const lead of withWebsite) {
    await analysisQueue.add(
      `analysis:${lead.id}`,
      { leadId: lead.id, website: lead.website },
      { attempts: 3, backoff: { type: "exponential", delay: 5000 } },
    );
  }

  return {
    queued: withWebsite.length,
    skipped,
    reason: skipped > 0 ? `${skipped} leads have no website` : "",
  };
}

export async function bulkOutreach(
  leadIds: string[],
  opts?: { tone?: string; language?: string },
): Promise<BulkResult> {
  // Only generate outreach for leads that have been analyzed and have email or website
  const leads = await prisma.lead.findMany({
    where: {
      id: { in: leadIds },
      analyses: { some: {} },
    },
    select: { id: true },
  });

  const eligible = leads;
  const skipped = leadIds.length - eligible.length;

  for (const lead of eligible) {
    await outreachGenerateQueue.add(
      `outreach:generate:${lead.id}`,
      {
        leadId: lead.id,
        tone: opts?.tone,
        language: opts?.language,
      },
      { attempts: 3, backoff: { type: "exponential", delay: 5000 } },
    );
  }

  return {
    queued: eligible.length,
    skipped,
    reason: skipped > 0 ? `${skipped} leads were not analyzed yet` : "",
  };
}

export async function bulkUpdateStatus(
  leadIds: string[],
  status: LeadStatus,
): Promise<{ updated: number }> {
  const result = await prisma.lead.updateMany({
    where: { id: { in: leadIds } },
    data: { status },
  });
  return { updated: result.count };
}
