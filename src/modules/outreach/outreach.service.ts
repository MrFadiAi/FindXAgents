// Outreach Generator Service
// Full implementation: AI email generation, template rendering, send, tracking, rate limiting

import { prisma } from "../../lib/db/client.js";
import { sendEmail, isEmailConfigured } from "../../lib/email/client.js";
import {
  generatePersonalizedEmail,
  generateToneVariants,
  type LeadContext,
  type GeneratedEmail,
} from "./generator.js";
import type { EmailTone, EmailLanguage } from "./templates.js";
import type { OutreachGenerateJobData, OutreachSendJobData, OutreachTrackJobData } from "../../workers/outreach.js";

// --- Rate Limiting ---
const MAX_DAILY_EMAILS = 200;

async function getDailySendCount(): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  return prisma.outreach.count({
    where: {
      sentAt: { gte: startOfDay },
      status: { in: ["sent", "opened", "replied"] },
    },
  });
}

export async function checkRateLimit(): Promise<{ allowed: boolean; remaining: number }> {
  const sent = await getDailySendCount();
  return {
    allowed: sent < MAX_DAILY_EMAILS,
    remaining: Math.max(0, MAX_DAILY_EMAILS - sent),
  };
}

// --- Core Service Functions ---

export interface OutreachRequest {
  businessName: string;
  industry?: string;
  city: string;
  hasWebsite: boolean;
  analysisFindings?: Record<string, unknown>;
}

/**
 * Generate an outreach email for a lead using Claude AI.
 * Creates an Outreach record in draft status.
 */
export async function generateOutreachEmail(
  leadId: string,
  options?: {
    analysisId?: string;
    tone?: EmailTone;
    language?: EmailLanguage;
    generateVariants?: boolean;
  },
): Promise<{ outreach: GeneratedEmail; variants?: Record<EmailTone, GeneratedEmail> }> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: {
      analyses: {
        orderBy: { analyzedAt: "desc" },
        take: 1,
      },
    },
  });

  if (!lead) throw new Error(`Lead ${leadId} not found`);

  // Use specified analysis or latest
  const analysis = options?.analysisId
    ? await prisma.analysis.findUnique({ where: { id: options.analysisId } })
    : lead.analyses[0];

  // Build lead context for AI generation
  const leadContext: LeadContext = {
    businessName: lead.businessName,
    industry: lead.industry ?? undefined,
    city: lead.city,
    hasWebsite: lead.hasWebsite,
    website: lead.website ?? undefined,
    contactName: lead.businessName, // No separate contact model yet
    findings: analysis?.findings
      ? (Array.isArray(analysis.findings) ? analysis.findings as Array<{
          category: string;
          title: string;
          description: string;
          severity: "critical" | "warning" | "info";
        }> : [])
      : [],
    opportunities: analysis?.opportunities
      ? (Array.isArray(analysis.opportunities) ? analysis.opportunities as Array<{
          title: string;
          description: string;
          impact: string;
        }> : [])
      : [],
    overallScore: analysis?.score ?? undefined,
  };

  const tone = options?.tone ?? "professional";
  const language = options?.language ?? "en";

  // Generate primary email
  const email = await generatePersonalizedEmail(leadContext, tone, language);

  // Optionally generate all tone variants
  let variants: Record<EmailTone, GeneratedEmail> | undefined;
  if (options?.generateVariants) {
    variants = await generateToneVariants(leadContext, language);
  }

  // Persist the primary email as a draft Outreach record
  await prisma.outreach.create({
    data: {
      leadId,
      status: "draft",
      subject: email.subject,
      body: email.body,
      personalizedDetails: JSON.parse(JSON.stringify(email.personalizedDetails)),
    },
  });

  // Update lead status to contacting
  await prisma.lead.update({
    where: { id: leadId },
    data: { status: "contacting" },
  });

  return { outreach: email, variants };
}

/**
 * Approve a draft outreach email for sending.
 */
export async function approveOutreach(outreachId: string): Promise<void> {
  const outreach = await prisma.outreach.findUnique({ where: { id: outreachId } });
  if (!outreach) throw new Error(`Outreach ${outreachId} not found`);
  if (outreach.status !== "draft" && outreach.status !== "pending_approval") {
    throw new Error(`Cannot approve outreach in status ${outreach.status}`);
  }

  await prisma.outreach.update({
    where: { id: outreachId },
    data: { status: "approved" },
  });
}

/**
 * Send an approved outreach email via Resend.
 * Respects the daily send rate limit.
 */
export async function sendOutreach(outreachId: string): Promise<{ sent: boolean; reason?: string }> {
  const outreach = await prisma.outreach.findUnique({
    where: { id: outreachId },
    include: { lead: true },
  });

  if (!outreach) throw new Error(`Outreach ${outreachId} not found`);
  if (outreach.status !== "approved" && outreach.status !== "pending_approval") {
    throw new Error(`Cannot send outreach in status ${outreach.status}`);
  }

  if (!outreach.lead.email) {
    await prisma.outreach.update({
      where: { id: outreachId },
      data: { status: "failed" },
    });
    return { sent: false, reason: "Lead has no email address" };
  }

  // Check rate limit
  const rateLimit = await checkRateLimit();
  if (!rateLimit.allowed) {
    return { sent: false, reason: `Daily send limit reached (${MAX_DAILY_EMAILS})` };
  }

  try {
    // Convert plain text body to simple HTML for email
    const htmlBody = outreach.body
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
      .replace(/\n/g, "<br>\n");

    const result = await sendEmail(outreach.lead.email, outreach.subject, htmlBody);

    if (result.simulated) {
      // Resend not configured — save as "saved" instead of "sent"
      console.warn(
        `[Outreach] Email sending not configured (no RESEND_API_KEY). ` +
        `Outreach ${outreachId} saved but not sent.`,
      );
      await prisma.outreach.update({
        where: { id: outreachId },
        data: {
          status: "saved",
          sentAt: new Date(),
        },
      });

      return { sent: false, reason: "Email sending not configured (RESEND_API_KEY missing). Email saved as draft." };
    }

    await prisma.outreach.update({
      where: { id: outreachId },
      data: {
        status: "sent",
        sentAt: new Date(),
      },
    });

    return { sent: true };
  } catch (err) {
    await prisma.outreach.update({
      where: { id: outreachId },
      data: { status: "failed" },
    });

    const reason = err instanceof Error ? err.message : "Unknown error";
    return { sent: false, reason };
  }
}

/**
 * Process a tracking event (open, reply, bounce) from webhooks.
 */
export async function trackOutreachEvent(
  outreachId: string,
  event: "open" | "reply" | "bounce",
  timestamp?: string,
): Promise<void> {
  const outreach = await prisma.outreach.findUnique({
    where: { id: outreachId },
    include: { lead: true },
  });

  if (!outreach) {
    console.warn(`[Outreach Track] Outreach ${outreachId} not found, skipping`);
    return;
  }

  const ts = timestamp ? new Date(timestamp) : new Date();
  const updates: Record<string, unknown> = {};

  switch (event) {
    case "open":
      updates.status = "opened";
      updates.openedAt = outreach.openedAt ?? ts; // keep first open time
      break;
    case "reply":
      updates.status = "replied";
      updates.repliedAt = ts;
      break;
    case "bounce":
      updates.status = "bounced";
      break;
  }

  await prisma.outreach.update({
    where: { id: outreachId },
    data: updates,
  });

  // Update lead status based on outreach event
  if (event === "reply") {
    await prisma.lead.update({
      where: { id: outreach.leadId },
      data: { status: "responded" },
    });
  } else if (event === "bounce") {
    // Don't change lead status on bounce — they might have a different contact
    console.log(`[Outreach Track] Bounce for ${outreach.leadId}, lead status unchanged`);
  }
}

/**
 * Get outreach history for a lead.
 */
export async function getLeadOutreachHistory(leadId: string) {
  return prisma.outreach.findMany({
    where: { leadId },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Get a single outreach by ID.
 */
export async function getOutreach(outreachId: string) {
  return prisma.outreach.findUnique({
    where: { id: outreachId },
    include: { lead: true },
  });
}

/**
 * List outreaches with optional filters.
 */
export async function listOutreaches(filters?: {
  status?: string;
  leadId?: string;
  page?: number;
  pageSize?: number;
}) {
  const page = filters?.page ?? 1;
  const pageSize = filters?.pageSize ?? 25;

  const where: Record<string, unknown> = {};
  if (filters?.status) where.status = filters.status;
  if (filters?.leadId) where.leadId = filters.leadId;

  const [outreaches, total] = await Promise.all([
    prisma.outreach.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { lead: { select: { businessName: true, city: true, email: true } } },
    }),
    prisma.outreach.count({ where }),
  ]);

  return { outreaches, total, page, pageSize };
}

/**
 * Update an outreach draft (subject, body).
 */
export async function updateOutreachDraft(
  outreachId: string,
  data: { subject?: string; body?: string },
) {
  const outreach = await prisma.outreach.findUnique({ where: { id: outreachId } });
  if (!outreach) throw new Error(`Outreach ${outreachId} not found`);
  if (outreach.status !== "draft" && outreach.status !== "pending_approval") {
    throw new Error(`Cannot edit outreach in status ${outreach.status}`);
  }

  return prisma.outreach.update({
    where: { id: outreachId },
    data,
  });
}

// --- Worker Processors ---

/**
 * Process outreach:generate jobs from BullMQ.
 */
export async function processGenerateJob(data: OutreachGenerateJobData): Promise<{ outreachId: string }> {
  const result = await generateOutreachEmail(data.leadId, {
    analysisId: data.analysisId,
    tone: data.tone,
    language: data.language,
  });
  // The generateOutreachEmail already creates the DB record
  // Return a placeholder — the actual outreach ID is from the DB
  const latest = await prisma.outreach.findFirst({
    where: { leadId: data.leadId },
    orderBy: { createdAt: "desc" },
  });
  return { outreachId: latest?.id ?? "unknown" };
}

/**
 * Process outreach:send jobs from BullMQ.
 */
export async function processSendJob(data: OutreachSendJobData): Promise<{ sent: boolean }> {
  // Auto-approve if still in draft/pending
  const outreach = await prisma.outreach.findUnique({ where: { id: data.outreachId } });
  if (outreach && (outreach.status === "draft" || outreach.status === "pending_approval")) {
    await approveOutreach(data.outreachId);
  }

  const result = await sendOutreach(data.outreachId);
  return { sent: result.sent };
}

/**
 * Process outreach:track jobs from BullMQ.
 */
export async function processTrackJob(data: OutreachTrackJobData): Promise<void> {
  await trackOutreachEvent(data.outreachId, data.event, data.timestamp);
}
