import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/db/client.js";
import { DiscoveryService } from "../modules/discovery/discovery.service.js";
import {
  analyzeWebsite,
  getLeadAnalyses,
  getAnalysis,
  generateReportForAnalysis,
} from "../modules/analyzer/analyzer.service.js";
import { analysisQueue, discoveryKvkQueue, discoveryGoogleQueue, outreachGenerateQueue, outreachSendQueue, outreachTrackQueue } from "../workers/queues.js";
import {
  generateOutreachEmail,
  approveOutreach,
  sendOutreach,
  trackOutreachEvent,
  getLeadOutreachHistory,
  getOutreach,
  listOutreaches,
  updateOutreachDraft,
  checkRateLimit,
} from "../modules/outreach/outreach.service.js";
import {
  triggerAgentPipeline,
  getAgentRuns,
  getAgentRun,
  getAgentRunEmails,
} from "../agents/orchestrator/service.js";
import {
  getAuthorizationUrl,
  exchangeCodeForTokens,
  getStoredTokens,
  saveTokens,
  deleteTokens,
  getAuthenticatedClient,
  getGmailProfile,
} from "../lib/email/gmail-oauth.js";
import { resetProviderCache } from "../lib/email/client.js";
import { PROVIDER_DEFAULTS } from "../lib/ai/providers/defaults.js";
import { testProvider, getActiveProvider } from "../lib/ai/providers/registry.js";

// In-memory CSRF state for OAuth flow (single-user, short-lived)
const oauthStates = new Map<string, { expires: number }>();

// --- Schemas ---

const discoverSchema = z.object({
  city: z.string().min(1).optional(),
  industry: z.string().min(1).optional(),
  sbiCode: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(1000).default(500),
  sources: z.array(z.enum(["kvk", "google"])).optional(),
  /** If true, run synchronously. Otherwise queue a background job. */
  sync: z.boolean().default(false),
});

const leadListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(25),
  city: z.string().optional(),
  industry: z.string().optional(),
  status: z.string().optional(),
  source: z.string().optional(),
  hasWebsite: z.coerce.boolean().optional(),
  search: z.string().optional(),
});

// --- Routes ---

export function registerRoutes(app: FastifyInstance) {
  // Health check
  app.get("/api/health", async () => ({
    status: "ok",
    timestamp: new Date().toISOString(),
  }));

  // --- Discovery ---

  app.post("/api/leads/discover", async (req, reply) => {
    const parsed = discoverSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: parsed.error.flatten(),
      });
    }
    const params = parsed.data;

    // Synchronous mode: run discovery immediately
    if (params.sync) {
      const service = new DiscoveryService();
      const result = await service.discover(params);
      return reply.status(200).send(result);
    }

    // Background mode: queue jobs
    const sources = params.sources ?? (["kvk", "google"] as const);
    const jobs: Array<{ jobId: string | undefined; source: string }> = [];

    for (const source of sources) {
      const jobData = {
        source,
        city: params.city,
        industry: params.industry,
        sbiCode: params.sbiCode,
        limit: params.limit,
      };

      const queue =
        source === "kvk" ? discoveryKvkQueue : discoveryGoogleQueue;
      const job = await queue.add(`discovery:${source}`, jobData, {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
      });
      jobs.push({ jobId: job.id?.toString(), source });
    }

    return reply.status(202).send({
      message: "Discovery jobs queued",
      jobs,
    });
  });

  // --- Leads ---

  const createLeadSchema = z.object({
    businessName: z.string().min(1),
    city: z.string().min(1),
    address: z.string().optional(),
    industry: z.string().optional(),
    website: z.string().url().optional().or(z.literal("")),
    phone: z.string().optional(),
    email: z.string().email().optional().or(z.literal("")),
    kvkNumber: z.string().optional(),
    source: z.string().default("manual"),
  });

  app.post("/api/leads", async (req, reply) => {
    const parsed = createLeadSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: parsed.error.flatten(),
      });
    }

    const data = parsed.data;
    const website = data.website || undefined;

    const lead = await prisma.lead.create({
      data: {
        businessName: data.businessName,
        city: data.city,
        address: data.address,
        industry: data.industry,
        website,
        hasWebsite: !!website,
        phone: data.phone,
        email: data.email || undefined,
        kvkNumber: data.kvkNumber,
        source: data.source,
      },
    });

    return reply.status(201).send({ lead });
  });

  app.get("/api/leads", async (req, reply) => {
    const parsed = leadListSchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: parsed.error.flatten(),
      });
    }
    const { page, pageSize, city, industry, status, source, hasWebsite, search } =
      parsed.data;

    const where: Record<string, unknown> = {};
    if (city) where.city = { contains: city, mode: "insensitive" };
    if (industry)
      where.industry = { contains: industry, mode: "insensitive" };
    if (status) where.status = status;
    if (source) where.source = { contains: source, mode: "insensitive" };
    if (hasWebsite !== undefined) where.hasWebsite = hasWebsite;
    if (search) {
      where.OR = [
        { businessName: { contains: search, mode: "insensitive" } },
        { city: { contains: search, mode: "insensitive" } },
        { industry: { contains: search, mode: "insensitive" } },
      ];
    }

    const [leads, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        orderBy: { discoveredAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          analyses: { orderBy: { analyzedAt: "desc" } },
          outreaches: { orderBy: { createdAt: "desc" } },
        },
      }),
      prisma.lead.count({ where }),
    ]);

    return { leads, total, page, pageSize };
  });

  app.get("/api/leads/:id", async (req) => {
    const { id } = req.params as { id: string };
    const lead = await prisma.lead.findUnique({
      where: { id },
      include: {
        analyses: { orderBy: { analyzedAt: "desc" } },
        outreaches: { orderBy: { createdAt: "desc" } },
        pipelineStage: true,
      },
    });

    if (!lead) {
      return { lead: null };
    }
    return { lead };
  });

  app.patch("/api/leads/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as Record<string, unknown>;

    const allowedFields = [
      "businessName",
      "address",
      "city",
      "industry",
      "website",
      "hasWebsite",
      "phone",
      "email",
      "status",
    ];
    const data: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        data[field] = body[field];
      }
    }

    try {
      const lead = await prisma.lead.update({ where: { id }, data });
      return { lead };
    } catch {
      return reply.status(404).send({ error: "Lead not found" });
    }
  });

  // --- Bulk Actions ---

  app.post("/api/leads/bulk/analyze", async (req, reply) => {
    const body = req.body as { leadIds?: string[] } | undefined;
    if (!body?.leadIds?.length) {
      return reply.status(400).send({ error: "leadIds array is required" });
    }
    if (body.leadIds.length > 100) {
      return reply.status(400).send({ error: "Maximum 100 leads per bulk operation" });
    }
    const { bulkAnalyze } = await import("../modules/leads/bulk-actions.js");
    const result = await bulkAnalyze(body.leadIds);
    return result;
  });

  app.post("/api/leads/bulk/outreach", async (req, reply) => {
    const body = req.body as { leadIds?: string[]; tone?: string; language?: string } | undefined;
    if (!body?.leadIds?.length) {
      return reply.status(400).send({ error: "leadIds array is required" });
    }
    if (body.leadIds.length > 100) {
      return reply.status(400).send({ error: "Maximum 100 leads per bulk operation" });
    }
    const { bulkOutreach } = await import("../modules/leads/bulk-actions.js");
    const result = await bulkOutreach(body.leadIds, { tone: body.tone, language: body.language });
    return result;
  });

  app.patch("/api/leads/bulk/status", async (req, reply) => {
    const schema = z.object({
      leadIds: z.array(z.string().uuid()).min(1).max(100),
      status: z.enum(["discovered", "analyzing", "analyzed", "contacting", "responded", "qualified", "won", "lost"]),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid input", details: parsed.error.flatten() });
    }
    const { leadIds, status } = parsed.data;
    const { bulkUpdateStatus } = await import("../modules/leads/bulk-actions.js");
    const result = await bulkUpdateStatus(leadIds, status);
    return result;
  });

  // --- CSV Import/Export ---

  app.post("/api/leads/import", async (req, reply) => {
    const body = req.body as { csv?: string; skipDuplicates?: boolean } | undefined;
    const csvText = body?.csv;
    if (!csvText || typeof csvText !== "string") {
      return reply.status(400).send({ error: "Missing 'csv' field with CSV text content" });
    }

    const { importCsv } = await import("../modules/import-export/csv-parser.js");
    const result = await importCsv(csvText, body.skipDuplicates ?? true);
    return result;
  });

  app.get("/api/leads/export", async (req, reply) => {
    const query = req.query as Record<string, string>;
    const where: Record<string, unknown> = {};
    if (query.city) where.city = { contains: query.city, mode: "insensitive" };
    if (query.industry) where.industry = { contains: query.industry, mode: "insensitive" };
    if (query.status) where.status = query.status;
    if (query.hasWebsite) where.hasWebsite = query.hasWebsite === "true";
    if (query.search) {
      where.OR = [
        { businessName: { contains: query.search, mode: "insensitive" } },
        { city: { contains: query.search, mode: "insensitive" } },
      ];
    }

    const leads = await prisma.lead.findMany({
      where,
      orderBy: { discoveredAt: "desc" },
      take: 5000,
    });

    const { leadsToCsv } = await import("../modules/import-export/csv-parser.js");
    const csv = leadsToCsv(leads as unknown as Array<Record<string, unknown>>);

    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", "attachment; filename=findx-leads.csv");
    return reply.send(csv);
  });

  app.get("/api/outreaches/export", async (req, reply) => {
    const query = req.query as Record<string, string>;
    const where: Record<string, unknown> = {};
    if (query.status) where.status = query.status;

    const outreaches = await prisma.outreach.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 5000,
      include: { lead: { select: { businessName: true, city: true, website: true } } },
    });

    const { outreachesToCsv } = await import("../modules/import-export/csv-parser.js");
    const flat = outreaches.map((o) => ({
      leadBusinessName: (o.lead as { businessName: string }).businessName,
      leadCity: (o.lead as { city: string }).city,
      leadWebsite: (o.lead as { website: string | null }).website,
      subject: o.subject,
      status: o.status,
      tone: (o.personalizedDetails as Record<string, unknown>)?.tone ?? "",
      language: (o.personalizedDetails as Record<string, unknown>)?.language ?? "",
      sentAt: o.sentAt,
      openedAt: o.openedAt,
      repliedAt: o.repliedAt,
      createdAt: o.createdAt,
    }));
    const csv = outreachesToCsv(flat as unknown as Array<Record<string, unknown>>);

    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", "attachment; filename=findx-outreaches.csv");
    return reply.send(csv);
  });

  // --- Pipeline ---

  app.get("/api/pipeline", async () => {
    const stages = await prisma.pipelineStage.findMany({
      orderBy: { order: "asc" },
      include: {
        _count: { select: { leads: true } },
      },
    });

    const stats = await prisma.lead.groupBy({
      by: ["status"],
      _count: true,
    });

    return { stages, statusCounts: stats };
  });

  // --- Analysis ---

  app.post("/api/leads/:id/analyze", async (req, reply) => {
    const { id } = req.params as { id: string };

    const lead = await prisma.lead.findUnique({ where: { id } });
    if (!lead) {
      return reply.status(404).send({ error: "Lead not found" });
    }
    if (!lead.website) {
      return reply
        .status(400)
        .send({ error: "Lead has no website URL" });
    }

    const body = req.body as { sync?: boolean } | undefined;
    const sync = body?.sync ?? false;

    if (sync) {
      try {
        const result = await analyzeWebsite(
          { leadId: id, url: lead.website },
          { includePdf: false, businessName: lead.businessName },
        );
        return { analysis: result };
      } catch (err) {
        return reply.status(500).send({
          error: "Analysis failed",
          details: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Queue background job
    const job = await analysisQueue.add(
      `analysis:${id}`,
      { leadId: id, website: lead.website },
      { attempts: 3, backoff: { type: "exponential", delay: 5000 } },
    );

    return reply.status(202).send({
      message: "Analysis job queued",
      jobId: job.id?.toString(),
    });
  });

  app.get("/api/leads/:id/analyses", async (req) => {
    const { id } = req.params as { id: string };
    const analyses = await getLeadAnalyses(id);
    return { analyses };
  });

  app.get("/api/analyses/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const analysis = await getAnalysis(id);
    if (!analysis) {
      return reply.status(404).send({ error: "Analysis not found" });
    }
    return { analysis };
  });

  app.get("/api/analyses/:id/report", async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const pdfBuffer = await generateReportForAnalysis(id);
      reply
        .header("Content-Type", "application/pdf")
        .header(
          "Content-Disposition",
          `attachment; filename="findx-analysis-${id}.pdf"`,
        );
      return reply.send(pdfBuffer);
    } catch (err) {
      return reply
        .status(404)
        .send({
          error:
            err instanceof Error ? err.message : "Failed to generate report",
        });
    }
  });

  // --- Outreach ---

  // Generate AI outreach email for a lead
  app.post("/api/leads/:id/outreach/generate", async (req, reply) => {
    const { id } = req.params as { id: string };

    const lead = await prisma.lead.findUnique({ where: { id } });
    if (!lead) {
      return reply.status(404).send({ error: "Lead not found" });
    }

    const body = req.body as {
      sync?: boolean;
      analysisId?: string;
      tone?: "professional" | "friendly" | "urgent";
      language?: "en" | "nl" | "ar";
      generateVariants?: boolean;
    } | undefined;

    const sync = body?.sync ?? false;

    if (sync) {
      try {
        const result = await generateOutreachEmail(id, {
          analysisId: body?.analysisId,
          tone: body?.tone,
          language: body?.language,
          generateVariants: body?.generateVariants,
        });
        return { outreach: result.outreach, variants: result.variants };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Generation failed";
        return reply.status(500).send({ error: message });
      }
    }

    // Queue background job
    const job = await outreachGenerateQueue.add(
      `outreach:generate:${id}`,
      { leadId: id, analysisId: body?.analysisId, tone: body?.tone, language: body?.language },
      { attempts: 3, backoff: { type: "exponential", delay: 5000 } },
    );

    return reply.status(202).send({
      message: "Outreach generation job queued",
      jobId: job.id?.toString(),
    });
  });

  // Get outreach history for a lead
  app.get("/api/leads/:id/outreaches", async (req) => {
    const { id } = req.params as { id: string };
    const outreaches = await getLeadOutreachHistory(id);
    return { outreaches };
  });

  // Send an approved outreach email
  app.post("/api/leads/:id/outreach/send", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { outreachId: string; sync?: boolean } | undefined;

    if (!body?.outreachId) {
      return reply.status(400).send({ error: "outreachId is required" });
    }

    const outreach = await getOutreach(body.outreachId);
    if (!outreach || outreach.leadId !== id) {
      return reply.status(404).send({ error: "Outreach not found for this lead" });
    }

    // Approve if still draft
    if (outreach.status === "draft" || outreach.status === "pending_approval") {
      await approveOutreach(body.outreachId);
    }

    const sync = body.sync ?? false;

    if (sync) {
      const result = await sendOutreach(body.outreachId);
      return result;
    }

    // Queue background job
    const job = await outreachSendQueue.add(
      `outreach:send:${body.outreachId}`,
      { outreachId: body.outreachId },
      { attempts: 3, backoff: { type: "exponential", delay: 5000 } },
    );

    return reply.status(202).send({
      message: "Outreach send job queued",
      jobId: job.id?.toString(),
    });
  });

  // Get a single outreach
  app.get("/api/outreaches/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const outreach = await getOutreach(id);
    if (!outreach) {
      return reply.status(404).send({ error: "Outreach not found" });
    }
    return { outreach };
  });

  // Update a draft outreach
  app.patch("/api/outreaches/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { subject?: string; body?: string; status?: string } | undefined;

    if (body?.status === "approved") {
      try {
        await approveOutreach(id);
        const outreach = await getOutreach(id);
        return { outreach };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Approval failed";
        return reply.status(400).send({ error: message });
      }
    }

    if (body?.subject || body?.body) {
      try {
        const outreach = await updateOutreachDraft(id, {
          subject: body.subject,
          body: body.body,
        });
        return { outreach };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Update failed";
        return reply.status(400).send({ error: message });
      }
    }

    return reply.status(400).send({ error: "No valid fields to update" });
  });

  // List all outreaches with filters
  app.get("/api/outreaches", async (req) => {
    const query = req.query as {
      status?: string;
      leadId?: string;
      page?: string;
      pageSize?: string;
    };

    const result = await listOutreaches({
      status: query.status,
      leadId: query.leadId,
      page: query.page ? parseInt(query.page, 10) : undefined,
      pageSize: query.pageSize ? parseInt(query.pageSize, 10) : undefined,
    });

    return result;
  });

  // Webhook endpoint for Resend tracking events
  app.post("/api/webhooks/resend", async (req, reply) => {
    const body = req.body as {
      type: string;
      data: {
        email_id?: string;
        outreach_id?: string;
        timestamp?: string;
      };
    } | undefined;

    if (!body?.data) {
      return reply.status(400).send({ error: "Invalid webhook payload" });
    }

    // Map Resend event types to our tracking events
    const eventMap: Record<string, "open" | "reply" | "bounce"> = {
      "email.opened": "open",
      "email.replied": "reply",
      "email.bounced": "bounce",
      "email.delivery_failed": "bounce",
    };

    const event = eventMap[body.type];
    if (!event) {
      // Acknowledge unknown events without processing
      return { processed: false, reason: `Unhandled event type: ${body.type}` };
    }

    const outreachId = body.data.outreach_id;
    if (!outreachId) {
      return reply.status(400).send({ error: "Missing outreach_id in webhook data" });
    }

    // Process synchronously for webhooks (low latency requirement)
    if (event === "open" || event === "reply" || event === "bounce") {
      await trackOutreachEvent(outreachId, event, body.data.timestamp);
    }

    return { processed: true };
  });

  // Check outreach rate limit status
  app.get("/api/outreach/rate-limit", async () => {
    return checkRateLimit();
  });

  // --- Dashboard ---

  app.get("/api/dashboard/stats", async () => {
    const [
      totalLeads,
      leadsAnalyzed,
      leadsContacted,
      leadsResponded,
      leadsWon,
    ] = await Promise.all([
      prisma.lead.count(),
      prisma.lead.count({ where: { status: { in: ["analyzed", "contacting", "responded", "won", "lost"] } } }),
      prisma.lead.count({ where: { status: { in: ["contacting", "responded", "won"] } } }),
      prisma.lead.count({ where: { status: "responded" } }),
      prisma.lead.count({ where: { status: "won" } }),
    ]);

    const lastWeek = new Date();
    lastWeek.setDate(lastWeek.getDate() - 7);
    const leadsThisWeek = await prisma.lead.count({
      where: { discoveredAt: { gte: lastWeek } },
    });

    const stats = {
      totalLeads,
      leadsAnalyzed,
      leadsContacted,
      leadsResponded,
      leadsWon,
      leadsThisWeek,
      conversionRate:
        leadsContacted > 0 ? ((leadsWon / leadsContacted) * 100).toFixed(1) : "0",
    };
    return { stats };
  });

  // Score distribution for dashboard
  app.get("/api/leads/score-distribution", async () => {
    const leads = await prisma.lead.findMany({
      where: { leadScore: { not: null } },
      select: { leadScore: true },
    });

    const buckets = {
      cold: 0,    // 0-39
      warm: 0,    // 40-69
      hot: 0,     // 70-100
      unscored: 0,
    };

    const unscored = await prisma.lead.count({ where: { leadScore: null } });
    buckets.unscored = unscored;

    for (const lead of leads) {
      const s = lead.leadScore ?? 0;
      if (s >= 70) buckets.hot++;
      else if (s >= 40) buckets.warm++;
      else buckets.cold++;
    }

    const avgScore = leads.length > 0
      ? Math.round(leads.reduce((sum, l) => sum + (l.leadScore ?? 0), 0) / leads.length)
      : 0;

    return { buckets, avgScore, totalScored: leads.length };
  });

  // --- Agent Pipeline ---

  const agentRunSchema = z.object({
    query: z.string().min(2).max(500),
    sync: z.boolean().default(false),
    maxResults: z.number().int().min(1).max(500).optional(),
    language: z.enum(["en", "nl", "ar"]).default("en"),
  });

  app.post("/api/agents/run", async (req, reply) => {
    const parsed = agentRunSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: parsed.error.flatten(),
      });
    }

    try {
      const result = await triggerAgentPipeline(
        parsed.data.query,
        parsed.data.sync,
        parsed.data.maxResults,
        parsed.data.language,
      );
      const statusCode = parsed.data.sync ? 200 : 202;
      return reply.status(statusCode).send(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Pipeline failed";
      return reply.status(500).send({ error: message });
    }
  });

  app.get("/api/agents/runs", async () => {
    const runs = await getAgentRuns();
    return { runs };
  });

  app.get("/api/agents/runs/:id", async (req) => {
    const { id } = req.params as { id: string };
    const run = await getAgentRun(id);
    if (!run) {
      return { run: null };
    }
    return { run };
  });

  app.get("/api/agents/runs/:id/emails", async (req) => {
    const { id } = req.params as { id: string };
    const emails = await getAgentRunEmails(id);
    if (!emails) {
      return { emails: [] };
    }
    return { emails };
  });

  // --- Agent Management (CRUD) ---

  // List all agents
  app.get("/api/agents", async (req) => {
    const query = req.query as {
      active?: string;
      role?: string;
    };

    const where: Record<string, unknown> = {};
    if (query.active === "true") where.isActive = true;
    if (query.active === "false") where.isActive = false;
    if (query.role) where.role = query.role;

    const agents = await prisma.agent.findMany({
      where,
      orderBy: { pipelineOrder: "asc" },
      include: {
        _count: { select: { skills: true, logs: true } },
      },
    });

    return { agents };
  });

  // Get a single agent with skills
  app.get("/api/agents/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const agent = await prisma.agent.findUnique({
      where: { id },
      include: {
        skills: { orderBy: { sortOrder: "asc" } },
        _count: { select: { logs: true } },
      },
    });

    if (!agent) {
      return reply.status(404).send({ error: "Agent not found" });
    }
    return { agent };
  });

  const createAgentSchema = z.object({
    name: z.string().min(1).max(100),
    displayName: z.string().min(1).max(200),
    description: z.string().min(1),
    role: z.string().min(1),
    icon: z.string().default("Bot"),
    model: z.string().default("claude-sonnet-4-20250514"),
    maxIterations: z.number().int().min(1).max(100).default(15),
    maxTokens: z.number().int().min(256).max(32768).default(4096),
    temperature: z.number().min(0).max(2).optional(),
    identityMd: z.string().default(""),
    soulMd: z.string().default(""),
    toolsMd: z.string().default(""),
    systemPrompt: z.string().default(""),
    toolNames: z.array(z.string()).default([]),
    pipelineOrder: z.number().int().default(0),
    isActive: z.boolean().default(true),
  });

  // Create a new agent
  app.post("/api/agents", async (req, reply) => {
    const parsed = createAgentSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: parsed.error.flatten(),
      });
    }

    try {
      const agent = await prisma.agent.create({
        data: parsed.data,
      });
      return reply.status(201).send({ agent });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to create agent";
      if (message.includes("Unique")) {
        return reply.status(409).send({ error: "Agent name already exists" });
      }
      return reply.status(500).send({ error: message });
    }
  });

  const updateAgentSchema = z.object({
    displayName: z.string().min(1).max(200).optional(),
    description: z.string().min(1).optional(),
    role: z.string().min(1).optional(),
    icon: z.string().optional(),
    model: z.string().optional(),
    maxIterations: z.number().int().min(1).max(100).optional(),
    maxTokens: z.number().int().min(256).max(32768).optional(),
    temperature: z.number().min(0).max(2).nullable().optional(),
    identityMd: z.string().optional(),
    soulMd: z.string().optional(),
    toolsMd: z.string().optional(),
    systemPrompt: z.string().optional(),
    toolNames: z.array(z.string()).optional(),
    pipelineOrder: z.number().int().optional(),
    isActive: z.boolean().optional(),
  });

  // Update an agent
  app.patch("/api/agents/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = updateAgentSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: parsed.error.flatten(),
      });
    }

    try {
      const agent = await prisma.agent.update({
        where: { id },
        data: parsed.data,
      });
      return { agent };
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to update agent";
      if (message.includes("not found")) {
        return reply.status(404).send({ error: "Agent not found" });
      }
      return reply.status(500).send({ error: message });
    }
  });

  // Delete an agent
  app.delete("/api/agents/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      await prisma.agent.delete({ where: { id } });
      return { deleted: true };
    } catch {
      return reply.status(404).send({ error: "Agent not found" });
    }
  });

  // Toggle agent active state
  app.patch("/api/agents/:id/toggle", async (req, reply) => {
    const { id } = req.params as { id: string };
    const agent = await prisma.agent.findUnique({ where: { id } });
    if (!agent) {
      return reply.status(404).send({ error: "Agent not found" });
    }

    const updated = await prisma.agent.update({
      where: { id },
      data: { isActive: !agent.isActive },
    });
    return { agent: updated };
  });

  // --- Agent Skills ---

  // List skills for an agent
  app.get("/api/agents/:id/skills", async (req, reply) => {
    const { id } = req.params as { id: string };
    const agent = await prisma.agent.findUnique({ where: { id } });
    if (!agent) {
      return reply.status(404).send({ error: "Agent not found" });
    }

    const skills = await prisma.agentSkill.findMany({
      where: { agentId: id },
      orderBy: { sortOrder: "asc" },
    });
    return { skills };
  });

  const createSkillSchema = z.object({
    name: z.string().min(1).max(100),
    description: z.string().min(1),
    toolNames: z.array(z.string()).default([]),
    promptAdd: z.string().default(""),
    isActive: z.boolean().default(true),
    sortOrder: z.number().int().default(0),
  });

  // Create a skill for an agent
  app.post("/api/agents/:id/skills", async (req, reply) => {
    const { id } = req.params as { id: string };
    const agent = await prisma.agent.findUnique({ where: { id } });
    if (!agent) {
      return reply.status(404).send({ error: "Agent not found" });
    }

    const parsed = createSkillSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: parsed.error.flatten(),
      });
    }

    try {
      const skill = await prisma.agentSkill.create({
        data: {
          ...parsed.data,
          agentId: id,
        },
      });
      return reply.status(201).send({ skill });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to create skill";
      if (message.includes("Unique")) {
        return reply
          .status(409)
          .send({ error: "Skill name already exists for this agent" });
      }
      return reply.status(500).send({ error: message });
    }
  });

  const updateSkillSchema = z.object({
    description: z.string().min(1).optional(),
    toolNames: z.array(z.string()).optional(),
    promptAdd: z.string().optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
  });

  // Update a skill
  app.patch("/api/agents/:agentId/skills/:skillId", async (req, reply) => {
    const { agentId, skillId } = req.params as {
      agentId: string;
      skillId: string;
    };

    const parsed = updateSkillSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: parsed.error.flatten(),
      });
    }

    try {
      const skill = await prisma.agentSkill.update({
        where: { id: skillId, agentId },
        data: parsed.data,
      });
      return { skill };
    } catch {
      return reply.status(404).send({ error: "Skill not found" });
    }
  });

  // Delete a skill
  app.delete("/api/agents/:agentId/skills/:skillId", async (req, reply) => {
    const { agentId, skillId } = req.params as {
      agentId: string;
      skillId: string;
    };

    try {
      await prisma.agentSkill.delete({
        where: { id: skillId, agentId },
      });
      return { deleted: true };
    } catch {
      return reply.status(404).send({ error: "Skill not found" });
    }
  });

  // --- Agent Logs ---

  const logsQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(500).default(25),
    agentId: z.string().optional(),
    pipelineRunId: z.string().optional(),
    phase: z.string().optional(),
    level: z.string().optional(),
  });

  // List agent logs with filters
  app.get("/api/agents/logs", async (req) => {
    const parsed = logsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return { logs: [], total: 0, page: 1, pageSize: 25 };
    }
    const { page, pageSize, agentId, pipelineRunId, phase, level } =
      parsed.data;

    const where: Record<string, unknown> = {};
    if (agentId) where.agentId = agentId;
    if (pipelineRunId) where.pipelineRunId = pipelineRunId;
    if (phase) where.phase = phase;
    if (level) where.level = level;

    const [logs, total] = await Promise.all([
      prisma.agentLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          agent: { select: { id: true, name: true, displayName: true } },
        },
      }),
      prisma.agentLog.count({ where }),
    ]);

    return { logs, total, page, pageSize };
  });

  // Get logs for a specific pipeline run
  app.get("/api/agents/runs/:id/logs", async (req) => {
    const { id } = req.params as { id: string };
    const logs = await prisma.agentLog.findMany({
      where: { pipelineRunId: id },
      orderBy: { createdAt: "asc" },
      include: {
        agent: { select: { id: true, name: true, displayName: true } },
      },
    });
    return { logs };
  });

  // Get a single log entry
  app.get("/api/agents/logs/:logId", async (req, reply) => {
    const { logId } = req.params as { logId: string };
    const log = await prisma.agentLog.findUnique({
      where: { id: logId },
      include: {
        agent: { select: { id: true, name: true, displayName: true } },
      },
    });
    if (!log) {
      return reply.status(404).send({ error: "Log not found" });
    }
    return { log };
  });

  // --- Agent Lookup by Name ---

  // Get agent by name (for frontend detail pages)
  app.get("/api/agents/name/:name", async (req, reply) => {
    const { name } = req.params as { name: string };
    const agent = await prisma.agent.findUnique({
      where: { name },
      include: {
        skills: { orderBy: { sortOrder: "asc" } },
        _count: { select: { logs: true } },
      },
    });
    if (!agent) {
      return reply.status(404).send({ error: "Agent not found" });
    }
    return { agent };
  });

  // Update agent by name
  app.patch("/api/agents/name/:name", async (req, reply) => {
    const { name } = req.params as { name: string };
    const parsed = updateAgentSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: parsed.error.flatten(),
      });
    }
    try {
      const agent = await prisma.agent.update({
        where: { name },
        data: parsed.data,
      });
      return { agent };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to update agent";
      if (message.includes("not found")) {
        return reply.status(404).send({ error: "Agent not found" });
      }
      return reply.status(500).send({ error: message });
    }
  });

  // --- Tools ---

  // List all registered tools
  app.get("/api/agents/tools", async () => {
    const { getAllToolDefinitions } = await import("../agents/core/tool-registry.js");
    const tools = getAllToolDefinitions();
    return { tools };
  });

  // --- Seed ---

  // Re-seed agents from hardcoded seed data
  app.post("/api/agents/seed", async () => {
    const STAGES = [
      { name: "discovered", order: 0 },
      { name: "analyzing", order: 1 },
      { name: "analyzed", order: 2 },
      { name: "contacting", order: 3 },
      { name: "responded", order: 4 },
      { name: "qualified", order: 5 },
      { name: "won", order: 6 },
      { name: "lost", order: 7 },
    ];

    const AGENTS = [
      {
        name: "research",
        displayName: "Research Agent",
        description: "Discovers businesses matching search queries worldwide using web search, business registries, Google Places, website scraping, and lead enrichment tools.",
        role: "research",
        icon: "Search",
        model: "claude-sonnet-4-20250514",
        maxIterations: 25,
        maxTokens: 4096,
        identityMd: "You are the Research Agent for FindX, a global business prospecting platform. Your job is to discover businesses matching a search query anywhere in the world. You detect the country from the query, use the appropriate business registries and search sources for that region, verify websites, extract contact information, and save them as leads in the database. Always search in the local language for better results.",
        soulMd: "## Core Principles\n- **Be thorough**: Search with multiple query variations to maximize coverage\n- **Verify before saving**: Always check a website exists before saving a lead\n- **No duplicates**: Check if a business already exists before saving\n- **Rich data**: Extract as much information as possible (email, phone, industry, address)\n- **Country-aware**: Detect location from query, use region-appropriate sources and languages\n- **Local language**: Always search in the local language for better results (Dutch for NL, German for DE, French for FR, etc.)\n\n## Strategy\n1. Parse the query to detect city, country, and language\n2. Start with the region-appropriate business registry (KVK for NL, Companies House for UK, Handelsregister for DE, etc.)\n3. Fall back to google_places_search and web_search with local-language terms\n4. For each result, scrape the page for contact details\n5. Verify the website is accessible with check_website\n6. Extract emails using the email extraction tool\n7. Check if the domain can receive email via MX records\n8. Extract social media profiles for enrichment\n9. Save each verified business as a lead\n10. Continue searching with variations until you have comprehensive results",
        toolsMd: "## Available Tools\n\n### Search & Discovery\n- `web_search`: Search the web for businesses globally. Use local-language query variations (city + industry in local language).\n- `kvk_search`: Search the Dutch Chamber of Commerce (KVK) registry. Use for Netherlands queries only.\n- `google_places_search`: Search Google Places for local businesses worldwide. Works in all countries.\n- `scrape_page`: Extract content from a webpage. Use renderJs=true for JavaScript-heavy sites.\n- `check_website`: Verify a website URL is accessible and responsive.\n\n### Data Enrichment\n- `extract_emails`: Extract email addresses from a webpage. Prioritize info@, contact@, hello@ addresses.\n- `extract_social_links`: Find social media profiles (LinkedIn, Facebook, Instagram, etc.).\n- `check_mx`: Verify a domain can receive email via MX records.\n\n### Save Results\n- `save_lead`: Save a discovered business as a lead. Always include businessName, city, and country. Deduplicates automatically.",
        toolNames: ["web_search", "kvk_search", "google_places_search", "scrape_page", "check_website", "extract_emails", "extract_social_links", "check_mx", "save_lead"],
        pipelineOrder: 1,
        isActive: true,
      },
      {
        name: "analysis",
        displayName: "Analysis Agent",
        description: "Deep digital analysis agent: Lighthouse audits, tech detection, revenue leakage calculation, user journey friction mapping, content quality assessment, GDPR/compliance checks, AI/automation opportunity scoring. Produces holistic improvement roadmaps scored 0-100 with projected ROI.",
        role: "analysis",
        icon: "BarChart3",
        model: "claude-sonnet-4-20250514",
        maxIterations: 20,
        maxTokens: 4096,
        identityMd: "You are a deep digital analysis agent for FindX. You evaluate a business's entire digital presence — not just the website, but the business behind it. You run technical audits, assess content quality, calculate revenue impact, check compliance, evaluate AI potential, and produce a holistic improvement roadmap scored 0-100.\n\n## Comprehensive Audit Protocol\n\nRun ALL steps in order. Never skip steps.\n\n### Step 1: Verify accessibility — check_website (record response time)\n### Step 2: Lighthouse audits — run_lighthouse TWICE, average scores. If difference >15 on any metric, run THIRD and take median.\n### Step 3: Technology detection — detect_tech (use renderJs:true for client-side frameworks)\n### Step 4: Content analysis — scrape_page (extract ALL content: text, images, links, forms, metadata)\n### Step 5: SSL certificate check — check_ssl\n### Step 6: Visual record — take_screenshot\n### Step 7: Social presence — extract_social_links\n### Step 8: Competitive context — compare against local competitors in same industry and region\n\n### Step 9: Revenue Leakage Calculation\nUsing ALL collected data, calculate financial impact:\n- **Performance**: Every 1s delay above 3s costs ~7% conversions. Calculate: (load_time - 3) × 7% × estimated_monthly_visitors × lead_value\n- **SEO**: Pages not ranking for business name + city lose local search traffic. Missing schema = no rich results.\n- **Accessibility**: 15-20% of population has accessibility needs. Non-compliant = lost customers + legal risk.\n- **Mobile**: 53% of mobile users abandon sites over 3s load time.\n\n### Step 10: User Journey Friction Analysis\nMap every path from landing to conversion:\n- Contact friction (1 click = excellent, 2 = good, 3+ = poor)\n- Phone number visibility (visible without scrolling? clickable on mobile?)\n- Form length (3-4 fields = good, 5-7 = okay, 8+ = high friction)\n- CTA clarity (ONE clear next step vs competing actions)\n- Booking/purchase path (completable in under 3 clicks?)\n- Trust signals (testimonials, reviews, certifications, guarantees visible?)\n- Exit points (where are users most likely to abandon?)\n\n### Step 11: Content Freshness & Quality Audit\n- Last updated detection (stale content hurts credibility)\n- Missing essential content by industry (restaurants: menu/prices/allergens; retail: catalog/shipping/returns; services: pricing/FAQ/case studies; trades: service area/emergency availability; healthcare: services/insurance/booking)\n- Image quality (professional? stock? properly sized? alt text?)\n- Content depth (surface fluff vs substantive information)\n- Spelling/grammar quality\n\n### Step 12: Compliance & Legal Check\n- **GDPR/Privacy**: Cookie consent banner? Privacy policy? Data collection disclosed? Third-party scripts identified?\n- **Cookie audit**: What cookies are set? Compliant with local regulations?\n- **WCAG Accessibility**: Color contrast, alt text, keyboard navigation, form labels\n- **Industry-specific**: Healthcare (HIPAA), E-commerce (consumer protection, return policy, pricing), Food (allergen info)\n\n### Step 13: AI & Automation Opportunity Assessment\nRate each 1-5 fit + complexity (low/med/high) + expected ROI:\n- Customer-facing AI (chatbot, recommendations, review management, personalization)\n- Operations AI (scheduling, quoting, invoicing, process automation, inventory forecasting)\n- Marketing & Growth AI (ad optimization, content generation, lead scoring, churn prediction)\n- Data & Analytics (analytics setup, behavior analysis, competitive intelligence, dashboards)\n\n### Step 14: Save complete analysis — save_analysis",
        soulMd: "## Tone\n- Technical but accessible\n- Revenue-focused: every finding connects to money\n- Action-oriented: specific next steps, not vague advice\n- Forward-thinking: what's possible, not just what's broken\n\n## Core Principles\n\n### Every finding has a price tag\nDon't just say 'the website is slow'. Say 'the website loads in 8.2 seconds, which is 6.2s above threshold, costing an estimated 29% of mobile visitors — roughly €1,200/month in lost leads for a business of this size.'\n\n### Revenue leakage framework\n| Issue | Impact Formula |\n|-------|----------------|\n| Load time > 3s | 7% conversion loss per second above 3s × estimated traffic × lead value |\n| No mobile responsive | 53% mobile users abandon × mobile traffic % × lead value |\n| Missing SSL | 15% visitor drop-off × traffic × lead value |\n| Poor SEO (not ranking for name+city) | Estimated local search traffic × lead value |\n| No contact CTA above fold | 70% form abandonment for forms with 5+ fields |\n| No online booking/ordering | Industry-specific: % of customers who prefer online vs phone |\n| Stale content | Reduced credibility × return visitor rate × lead value |\n\n### User journey is revenue\nMap the path from landing to conversion. Every extra click, every confusing element, every missing trust signal is a potential customer lost. Think like a customer:\n- Can I find the phone number in under 5 seconds?\n- Can I book/buy/contact in under 3 clicks?\n- Do I trust this business after 10 seconds on the page?\n- Would I come back to this website?\n\n### Industry expertise\nKnow what matters most per industry:\n- **Restaurants**: Menu accessibility, online ordering, reservation ease, photo quality, reviews\n- **Retail**: Product images, pricing clarity, shipping transparency, return policy\n- **Services**: Trust signals (certifications, testimonials, case studies), clear process\n- **Healthcare**: Patient portal, insurance clarity, appointment availability\n- **Trades**: Emergency visibility, response time, service area, instant contact\n\n### Compliance is not optional\nFlag as legal risks, not technical debt:\n- EU: GDPR, WCAG (European Accessibility Act)\n- US: ADA compliance\n- UK: Equality Act\n- Netherlands: Drempelvrijheid\n\n### AI is the future\nFor every business, ask:\n- What manual process is eating their time?\n- What customer interaction could be handled by AI?\n- What data are they sitting on that they're not using?\n- What would their competitors do with AI that they haven't done yet?\n\n## Scoring Guide\n| Range | Label |\n|-------|-------|\n| 0-15 | Critical |\n| 16-30 | Severely lacking |\n| 31-45 | Below average |\n| 46-60 | Average |\n| 61-75 | Good |\n| 76-90 | Very good |\n| 91-100 | Excellent |",
        toolsMd: "## Available Tools\n\n### Website Analysis\n- `run_lighthouse`: Run a full Lighthouse audit. Run TWICE and average. If difference >15, run THIRD and take median.\n- `detect_tech`: Detect the technology stack (CMS, hosting, frameworks). Use renderJs=true for SPA sites.\n- `scrape_page`: Extract ALL page content for quality assessment — text, images, links, forms, metadata.\n- `check_website`: Verify website accessibility and response time. Record: under 1s=excellent, 1-3s=acceptable, 3-5s=slow, 5s+=critical.\n- `take_screenshot`: Capture a screenshot for visual quality assessment.\n- `check_ssl`: Check SSL/TLS certificate validity, expiry, protocol version, chain validity.\n- `extract_social_links`: Find social media profiles (LinkedIn, Facebook, Instagram, Twitter/X).\n\n### Save Results\n- `save_analysis`: Persist ALL findings: scores, tech stack, recommendations, revenue impact, friction points, content gaps, compliance issues, AI opportunities, competitor data.",
        toolNames: ["run_lighthouse", "detect_tech", "scrape_page", "check_website", "take_screenshot", "check_ssl", "extract_social_links", "save_analysis"],
        pipelineOrder: 2,
        isActive: true,
      },
      {
        name: "outreach",
        displayName: "Outreach Agent",
        description: "Drafts personalized cold outreach emails in English, Dutch, or Arabic based on research and analysis data.",
        role: "outreach",
        icon: "Mail",
        model: "claude-sonnet-4-20250514",
        maxIterations: 10,
        maxTokens: 4096,
        identityMd: "You are an outreach specialist for FindX. You draft personalized cold emails to businesses based on their website analysis findings. You never send emails, you only draft them for human review and approval.\n\n## Language Handling\n- English (en): Professional, conversational. Like a consultant sharing observations.\n- Dutch (nl): Conversational 'je/jij' register. Warmer, more human. Not stiff or formal.\n- Arabic (ar): Professional Modern Standard Arabic. Formal business tone.\nAlways pass the language value to render_template.\n\n## Writing Style\nWrite like a real person who genuinely spent time looking at this specific business. Conversational and warm. Short sentences. Genuinely curious: \"I was looking at...\", \"I noticed...\", \"One thing caught my eye...\". No corporate jargon. NEVER use em dashes (\" -- \" or \" — \").\n\n## Mandatory Specificity\nEvery email MUST reference at least 2 specific findings from the analysis. Generic emails are forbidden. If you cannot find at least 2 specific findings, report \"insufficient data for personalization\" and note what data is missing.\n\n## Industry-Specific Hooks\nOpen with a hook tailored to the lead's industry: Restaurant/Cafe (online ordering/reservation gaps), Retail (e-commerce, local search), Services (trust signals, professional presence), Trades (local search, mobile findability), Tech/IT (performance benchmarks, UX gaps), Healthcare (patient acquisition, online booking), Hospitality (booking conversion, review management). For unknown industries, use the strongest finding as the hook.\n\n## Tone Variants\nGenerate 2 variants per lead: Variant A (Data-driven, metrics/benchmarks/competitor comparisons) and Variant B (Story-driven, pain points/opportunity narrative).\n\n## Quality Checklist\nBefore saving, verify: at least 2 specific findings referenced, language matches context, subject line specific to this business, CTA is specific and low-commitment, no hype words, under 200 words, casual but professional sign-off, no generic opening lines, no em dashes, sounds like a real person wrote it.",
        soulMd: "## Core Principle\nEvery email should feel like it was written by a consultant who spent an hour researching this specific business. If it reads like it could have been sent to 100 other companies, it fails.\n\n## Tone\n- Warm and conversational, like a knowledgeable friend giving advice\n- Specific and data-driven, never vague\n- Short paragraphs, easy to scan on mobile\n- Confident but not arrogant\n- Genuinely curious: \"I was looking at...\", \"I noticed...\", \"One thing stood out...\"\n\n## Formatting Rules\n- NEVER use em dashes (\" -- \" or \" — \"). Use colons, periods, or commas.\n- Short sentences. If a sentence has more than 20 words, split it.\n- No corporate jargon. Replace \"optimize\" with \"improve\", \"leverage\" with \"use\".\n\n## Personalization Standards\n- Always use render_template to apply the email template structure\n- Reference specific findings: concrete metrics, identified gaps, missed opportunities\n- Frame issues as opportunities, never as criticism. \"Your website loads in 8.2 seconds\" is factual. \"Your website is slow\" is a judgment. Use the former.\n- Never include the website score/100. It is reductive and unprofessional.\n\n## The Insufficient Data Rule\nIf you cannot find at least 2 specific, concrete findings, do not write the email. Report \"insufficient data for personalization\" instead.\n\n## Business Culture Awareness\n- Dutch: Directness and pragmatism. Conversational je/jij. Dutch professionals distrust hyperbole.\n- English: Professional but approachable. Clear value proposition up front.\n- Arabic: Formal and respectful. Build trust before making requests.\n\n## Opportunity Framing\nNot: \"Your website is slow\" -> Instead: \"Your website can load faster, that could reduce your bounce rate by 40%\"\nNot: \"Your SEO is bad\" -> Instead: \"With targeted SEO adjustments, you could rank higher than your direct competitors\"\n\n## What Not to Do\n- Do not include website scores (e.g., \"34/100\")\n- Do not invent data or metrics not in the analysis\n- Do not use false urgency\n- Do not use superlatives unless quoting specific data\n- Do not write emails longer than 200 words\n- Do not send the same structure to every lead. Vary openings, hooks, and CTAs.\n- Do not use generic salutations. Find the owner's name or use the business name.\n- Do not use em dashes anywhere. Period.\n\n## Values\n- Honesty over exaggeration: trust is built on accuracy\n- Specific over generic: one concrete detail beats three vague claims\n- Helpful over salesy: offer insight, not a pitch\n- Brief over comprehensive: respect the reader's time\n- Human over corporate: sound like a person, not a brand",
        toolsMd: "## Available Tools\n\n### Email Composition\n- `render_template`: Render an email template with personalized variables. Always pass specificInsight, improvementArea, estimatedImpact, and overallScore. Supports Dutch, English, and Arabic, multiple tones (professional, friendly, urgent).\n\n### Persistence\n- `save_outreach`: Save the drafted email to the database. Sets lead status to \"contacting\". Include personalization metadata: which findings were referenced, which industry hook was used, which variant (A or B).\n\n### Data Enrichment\n- `extract_emails`: Extract email addresses from the lead's website if not already available.\n- `check_mx`: Verify a domain can receive email before drafting. Always check before relying on an extracted email address.\n- `scrape_page`: Get additional context from the lead's website for deeper personalization. Only use when analysis data is insufficient for 2 specific references.\n\n## CRITICAL: No Send Capability\nThis agent does NOT have access to send_email. Emails are drafted and saved for human review only. Sending requires separate approval through the outreach workflow.\n\n## Execution Strategy\n1. Review lead data and analysis findings. Identify the 2-3 most impactful findings.\n2. Classify the lead's industry and select the appropriate hook pattern.\n3. Verify email deliverability: extract_emails if needed, check_mx to verify.\n4. Draft Variant A (Data-driven) with render_template, tone=professional.\n5. Draft Variant B (Story-driven) with render_template, tone=friendly.\n6. Quality self-check: 2+ specific findings, correct language, specific subject line, no hype, under 200 words, no em dashes.\n7. Save both variants with save_outreach, including personalization metadata.",
        toolNames: ["render_template", "save_outreach", "extract_emails", "check_mx", "scrape_page"],
        pipelineOrder: 3,
        isActive: true,
      },
    ];

    const SKILLS = [
      { agentName: "research", name: "local_search", description: "Search for businesses in a specific city with industry keywords, using country-appropriate sources", toolNames: ["web_search", "kvk_search", "google_places_search"], promptAdd: "Detect the country from the query. For Netherlands: use kvk_search first, then google_places_search. For other countries: use google_places_search first, then web_search with local-language terms. Try multiple variations in the local language: '{industry} in {city}', '{city} {industry}', 'best {industry} {city}'. For UK: try 'Companies House {business}'. For Germany: try 'Handelsregister {city} {industry}'. For France: try 'societe.com {business}'.", sortOrder: 1, isActive: true },
      { agentName: "research", name: "contact_extraction", description: "Extract and verify contact information from business websites worldwide", toolNames: ["scrape_page", "extract_emails", "check_mx", "extract_social_links"], promptAdd: "Prioritize extracting email addresses from contact pages and footers. Always verify email domains with check_mx before saving. Extract phone numbers in local format (+31 for NL, +44 for UK, +49 for DE, +33 for FR, etc.). Save social profiles for enrichment. Check common contact page paths: /contact, /impressum (DE), /colofon (NL), /mentions-legales (FR), /about.", sortOrder: 2, isActive: true },
      { agentName: "research", name: "website_verification", description: "Verify website accessibility and quality before saving as a lead", toolNames: ["check_website", "scrape_page"], promptAdd: "Before saving any lead, verify the website is accessible with check_website. If the site loads, scrape it briefly to confirm it's a real business site (not a parked domain, under construction, or redirect-only). Skip leads with dead or non-business websites.", sortOrder: 3, isActive: true },
      { agentName: "analysis", name: "performance_audit", description: "Run Lighthouse performance and best practices audit", toolNames: ["run_lighthouse", "check_website"], promptAdd: "Always run Lighthouse first. If Lighthouse fails (timeout, crash), save what you can from check_website data. Focus on Core Web Vitals (LCP, CLS, INP) and mobile performance — most Dutch SMB customers browse on mobile.", sortOrder: 1, isActive: true },
      { agentName: "analysis", name: "tech_stack_analysis", description: "Detect and evaluate the website's technology stack", toolNames: ["detect_tech", "scrape_page"], promptAdd: "Detect the CMS, hosting provider, JavaScript frameworks, and analytics tools. Use renderJs=true for React/Vue/Angular SPAs. Report outdated or insecure technologies as findings. Note if they're using WordPress with known issues.", sortOrder: 2, isActive: true },
      { agentName: "analysis", name: "security_check", description: "Check SSL/TLS certificates and security posture", toolNames: ["check_ssl", "check_website"], promptAdd: "Check SSL certificate validity, expiry date, and protocol version. Flag expired or expiring certificates as critical. Flag missing HTTPS redirects. Check if HSTS headers are present.", sortOrder: 3, isActive: true },
      { agentName: "analysis", name: "revenue_leakage", description: "Calculate financial impact of website issues — turn technical metrics into lost revenue estimates", toolNames: ["check_website", "run_lighthouse", "scrape_page"], promptAdd: "After collecting all audit data, calculate revenue leakage using these formulas:\n- Performance: (load_time - 3) × 7% × estimated_monthly_visitors × average_lead_value\n- Mobile: If mobile score < 50, estimate 53% mobile abandonment × mobile_traffic % × lead_value\n- SEO: If not ranking for business_name + city, estimate local search traffic loss\n- SSL: If missing or expired, estimate 15% visitor drop-off × traffic × lead_value\n- CTA friction: If no contact CTA above fold, estimate 70% drop-off from interested visitors\nPresent as: 'Issue X is costing an estimated €Y/month in lost revenue'. Always show your calculation so the business owner can verify.", sortOrder: 4, isActive: true },
      { agentName: "analysis", name: "user_journey_friction", description: "Map user paths from landing to conversion and identify friction points costing customers", toolNames: ["scrape_page", "take_screenshot"], promptAdd: "Map every path from landing to conversion for this business:\n1. Contact friction: How many clicks to reach a contact method? (1=excellent, 2=good, 3+=poor)\n2. Phone visibility: Is the phone number visible without scrolling? Clickable on mobile?\n3. Form length: Count form fields (3-4=good, 5-7=okay, 8+=high friction)\n4. CTA clarity: Is there ONE clear next step or multiple competing actions?\n5. Booking/purchase path: Can a customer complete their goal in under 3 clicks?\n6. Trust signals: Are testimonials, reviews, certifications, guarantees visible?\n7. Exit points: Where are users most likely to abandon the journey?\nFor each friction point, estimate the % of users lost and the revenue impact.", sortOrder: 5, isActive: true },
      { agentName: "analysis", name: "content_freshness", description: "Audit content quality, freshness, and completeness against industry standards", toolNames: ["scrape_page", "detect_tech"], promptAdd: "Assess content quality and freshness:\n1. Freshness: Can you detect when content was last modified? Stale content hurts credibility.\n2. Missing essential content by industry:\n   - Restaurants: menu with prices, allergen info, online ordering/reservations\n   - Retail: product catalog, pricing, shipping info, return policy\n   - Services: pricing/packages, process explanation, FAQ, case studies\n   - Trades: service area, emergency availability, response time estimates\n   - Healthcare: services, insurance info, online booking, patient resources\n   - All: opening hours, address, phone, email, about page\n3. Image quality: Professional? Stock photos? Properly sized? Alt text present?\n4. Content depth: Surface-level fluff or substantive, useful information?\n5. Spelling/grammar: Professional writing quality?\nReport each as a finding with severity.", sortOrder: 6, isActive: true },
      { agentName: "analysis", name: "compliance_check", description: "Check GDPR, accessibility, cookie consent, and industry-specific legal compliance", toolNames: ["scrape_page", "check_ssl", "detect_tech"], promptAdd: "Assess legal and regulatory compliance:\n1. GDPR/Privacy: Cookie consent banner present? Privacy policy linked and accessible? Data collection disclosed (forms, analytics, tracking pixels)? Third-party scripts identified?\n2. Cookie audit: What cookies are set? Are they compliant with local regulations?\n3. Accessibility (WCAG): Color contrast issues? Missing alt text? Keyboard navigation possible? Form labels present? Required by law in EU (European Accessibility Act), US (ADA), UK (Equality Act).\n4. Industry-specific: Healthcare (HIPAA/patient data), E-commerce (consumer protection, return policy, pricing transparency), Food (allergen information requirements).\nFlag each as a LEGAL RISK (not just technical debt) with the applicable regulation.", sortOrder: 7, isActive: true },
      { agentName: "analysis", name: "ai_automation_assessment", description: "Assess AI and automation opportunities for the business with fit scores and ROI estimates", toolNames: ["scrape_page", "detect_tech", "run_lighthouse"], promptAdd: "Based on all data collected, evaluate AI/automation potential across 4 categories:\n\n1. Customer-Facing AI: Chatbot opportunity (FAQ, bookings, support, lead capture)? AI product/service recommendations? Automated review management? Dynamic personalization?\n\n2. Operations AI: Automated scheduling, quoting, invoicing? Process automation (email sequences, follow-ups, reminders)? Inventory/demand forecasting? Customer onboarding automation?\n\n3. Marketing & Growth AI: AI ad optimization and targeting? Automated content generation (social, blog, email)? Predictive lead scoring? Customer churn prediction and retention?\n\n4. Data & Analytics: Analytics setup — are they tracking anything? Customer behavior analysis? Competitive intelligence automation? Performance dashboards?\n\nFor EACH opportunity: rate fit (1-5), estimate complexity (low/medium/high), and expected ROI. Prioritize by fit × ROI / complexity.", sortOrder: 8, isActive: true },
      { agentName: "outreach", name: "email_drafting", description: "Draft conversational cold outreach emails with analysis references in the specified language", toolNames: ["render_template", "save_outreach"], promptAdd: "Always use render_template to generate the email structure. Write like a real person who looked at their website. Fill specificInsight with a concrete observation written conversationally (e.g., 'Your website loads in 4.2 seconds'). improvementArea should be a natural suggestion, not jargon. estimatedImpact should be a realistic, quantified benefit. Never include the website score/100 in the email. Never use em dashes. Then save_outreach with all details.", sortOrder: 1, isActive: true },
      { agentName: "outreach", name: "email_verification", description: "Verify lead email addresses before outreach", toolNames: ["extract_emails", "check_mx"], promptAdd: "Before drafting outreach, verify the lead has a valid email. If no email is in the lead data, use extract_emails on their website. Always verify the domain with check_mx before relying on an extracted address. If no valid email can be found, note this in the outreach draft.", sortOrder: 2, isActive: true },
    ];

    let stagesSeeded = 0;
    for (const stage of STAGES) {
      await prisma.pipelineStage.upsert({
        where: { name: stage.name },
        update: { order: stage.order },
        create: stage,
      });
      stagesSeeded++;
    }

    let agentsSeeded = 0;
    for (const agent of AGENTS) {
      await prisma.agent.upsert({
        where: { name: agent.name },
        update: {
          displayName: agent.displayName,
          description: agent.description,
          role: agent.role,
          icon: agent.icon,
          model: agent.model,
          maxIterations: agent.maxIterations,
          maxTokens: agent.maxTokens,
          identityMd: agent.identityMd,
          soulMd: agent.soulMd,
          toolsMd: agent.toolsMd,
          toolNames: agent.toolNames,
          pipelineOrder: agent.pipelineOrder,
          isActive: agent.isActive,
        },
        create: agent,
      });
      agentsSeeded++;
    }

    // Seed agent skills
    let skillsSeeded = 0;
    for (const skill of SKILLS) {
      const agent = await prisma.agent.findUnique({ where: { name: skill.agentName } });
      if (!agent) continue;
      await prisma.agentSkill.upsert({
        where: { agentId_name: { agentId: agent.id, name: skill.name } },
        update: {
          description: skill.description,
          toolNames: skill.toolNames,
          promptAdd: skill.promptAdd,
          isActive: skill.isActive,
          sortOrder: skill.sortOrder,
        },
        create: {
          agentId: agent.id,
          name: skill.name,
          description: skill.description,
          toolNames: skill.toolNames,
          promptAdd: skill.promptAdd,
          isActive: skill.isActive,
          sortOrder: skill.sortOrder,
        },
      });
      skillsSeeded++;
    }

    return { seeded: true, stages: stagesSeeded, agents: agentsSeeded, skills: skillsSeeded };
  });

  // Cancel a running pipeline run
  app.post("/api/agents/runs/:id/cancel", async (req, reply) => {
    const { id } = req.params as { id: string };
    const run = await prisma.agentPipelineRun.findUnique({ where: { id } });
    if (!run) {
      return reply.status(404).send({ error: "Pipeline run not found" });
    }
    if (run.status !== "running" && run.status !== "queued") {
      return reply.status(400).send({
        error: `Cannot cancel run with status "${run.status}"`,
      });
    }

    const updated = await prisma.agentPipelineRun.update({
      where: { id },
      data: {
        status: "cancelled",
        completedAt: new Date(),
      },
    });
    return { run: updated };
  });

  // Clear all data (leads, analyses, outreaches, agent logs, pipeline runs)
  app.delete("/api/data/clear-all", async (_req, reply) => {
    try {
      // Delete in dependency order to respect foreign keys
      const outreach = await prisma.outreach.deleteMany({});
      const analysis = await prisma.analysis.deleteMany({});
      const logs = await prisma.agentLog.deleteMany({});
      const runs = await prisma.agentPipelineRun.deleteMany({});
      const leads = await prisma.lead.deleteMany({});

      return reply.send({
        deleted: {
          leads: leads.count,
          analyses: analysis.count,
          outreaches: outreach.count,
          agentLogs: logs.count,
          pipelineRuns: runs.count,
        },
      });
    } catch (err) {
      return reply.status(500).send({
        error: "Failed to clear data",
        details: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // ─── Email Provider ─────────────────────────────────────────────────

  // GET /api/email/provider/status
  app.get("/api/email/provider/status", async (_req, reply) => {
    const hasGmailCredentials = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
    const hasResendKey = !!process.env.RESEND_API_KEY;
    const storedTokens = await getStoredTokens();
    const smtpConfig = await prisma.smtpConfig.findUnique({ where: { id: "default" } });
    const setting = await prisma.emailSetting.findUnique({ where: { id: "default" } });

    let provider: string;
    let configured: boolean;
    let connected = false;
    let email: string | null = null;

    // Check user preference first
    if (setting?.defaultProvider) {
      if (setting.defaultProvider === "smtp" && smtpConfig) {
        provider = "smtp";
        configured = true;
        connected = true;
        email = smtpConfig.fromEmail;
      } else if (setting.defaultProvider === "gmail" && hasGmailCredentials && storedTokens) {
        provider = "gmail";
        configured = true;
        connected = true;
        email = storedTokens.email;
      } else if (setting.defaultProvider === "resend" && hasResendKey) {
        provider = "resend";
        configured = true;
        connected = true;
        email = process.env.EMAIL_FROM || null;
      } else {
        // Preference set but provider not configured — fall through to auto-detect
        provider = "none";
        configured = false;
        connected = false;
      }
    } else if (hasGmailCredentials && storedTokens) {
      provider = "gmail";
      configured = true;
      connected = true;
      email = storedTokens.email;
    } else if (hasGmailCredentials && !storedTokens) {
      provider = "gmail";
      configured = true;
      connected = false;
    } else if (smtpConfig) {
      provider = "smtp";
      configured = true;
      connected = true;
      email = smtpConfig.fromEmail;
    } else if (hasResendKey) {
      provider = "resend";
      configured = true;
      connected = true;
      email = process.env.EMAIL_FROM || null;
    } else {
      provider = "none";
      configured = false;
      connected = false;
    }

    return reply.send({ provider, configured, connected, email });
  });

  // GET /api/email/gmail/connect
  app.get("/api/email/gmail/connect", async (_req, reply) => {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return reply.status(400).send({ error: "Gmail OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET." });
    }

    const state = crypto.randomUUID();
    oauthStates.set(state, { expires: Date.now() + 10 * 60 * 1000 }); // 10 min
    const url = getAuthorizationUrl(state);
    return reply.send({ url });
  });

  // GET /api/email/gmail/callback
  app.get("/api/email/gmail/callback", async (req, reply) => {
    const { code, state } = req.query as { code?: string; state?: string };

    if (!code || !state) {
      return reply.status(400).type("text/html").send("<h1>Error</h1><p>Missing code or state parameter.</p>");
    }

    // Validate CSRF state
    const stored = oauthStates.get(state);
    oauthStates.delete(state);
    if (!stored || stored.expires < Date.now()) {
      return reply.status(400).type("text/html").send("<h1>Error</h1><p>Invalid or expired state. Please try again.</p>");
    }

    try {
      const tokens = await exchangeCodeForTokens(code);
      const client = await getAuthenticatedClient();
      let gmailEmail: string | undefined;
      if (client) {
        gmailEmail = await getGmailProfile(client);
      }

      await saveTokens({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        scope: tokens.scope,
        token_type: tokens.token_type,
        expiry_date: tokens.expiry_date,
        email: gmailEmail,
      });

      resetProviderCache();

      return reply.type("text/html").send(
        '<html><body><h2 style="font-family:sans-serif;color:#10b981">Gmail connected!</h2>' +
        '<p style="font-family:sans-serif">You can close this window.</p>' +
        '<script>window.close()</script></body></html>',
      );
    } catch (err) {
      console.error("[Gmail OAuth] Callback error:", err);
      return reply.status(500).type("text/html").send(
        `<html><body><h2 style="font-family:sans-serif;color:#ef4444">Connection failed</h2>` +
        `<p style="font-family:sans-serif">${err instanceof Error ? err.message : "Unknown error"}</p></body></html>`,
      );
    }
  });

  // POST /api/email/gmail/disconnect
  app.post("/api/email/gmail/disconnect", async (_req, reply) => {
    await deleteTokens();
    resetProviderCache();
    return reply.send({ disconnected: true });
  });

  // ─── SMTP Config ──────────────────────────────────────────────────

  // GET /api/email/smtp/config
  app.get("/api/email/smtp/config", async (_req, reply) => {
    const config = await prisma.smtpConfig.findUnique({ where: { id: "default" } });
    if (!config) {
      return reply.send({ configured: false });
    }
    return reply.send({
      configured: true,
      host: config.host,
      port: config.port,
      secure: config.secure,
      user: config.user,
      fromEmail: config.fromEmail,
      fromName: config.fromName,
    });
  });

  // PUT /api/email/smtp/config
  app.put("/api/email/smtp/config", async (req, reply) => {
    const schema = z.object({
      host: z.string().min(1),
      port: z.number().int().min(1).max(65535).default(465),
      secure: z.boolean().default(true),
      user: z.string().min(1),
      password: z.string().min(1),
      fromEmail: z.string().email(),
      fromName: z.string().min(1).default("FindX"),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid input", details: parsed.error.flatten() });
    }

    const data = parsed.data;
    const config = await prisma.smtpConfig.upsert({
      where: { id: "default" },
      update: data,
      create: { id: "default", ...data },
    });

    resetProviderCache();

    return reply.send({
      configured: true,
      host: config.host,
      port: config.port,
      secure: config.secure,
      user: config.user,
      fromEmail: config.fromEmail,
      fromName: config.fromName,
    });
  });

  // DELETE /api/email/smtp/config
  app.delete("/api/email/smtp/config", async (_req, reply) => {
    await prisma.smtpConfig.deleteMany({ where: { id: "default" } });
    resetProviderCache();
    return reply.send({ deleted: true });
  });

  // POST /api/email/smtp/test
  app.post("/api/email/smtp/test", async (_req, reply) => {
    const config = await prisma.smtpConfig.findUnique({ where: { id: "default" } });
    if (!config) {
      return reply.status(400).send({ error: "SMTP not configured" });
    }

    try {
      const { createSmtpProvider } = await import("../lib/email/providers/smtp.js");
      const provider = createSmtpProvider({
        host: config.host,
        port: config.port,
        secure: config.secure,
        user: config.user,
        password: config.password,
        fromEmail: config.fromEmail,
        fromName: config.fromName,
      });

      const result = await provider.send({
        to: config.fromEmail,
        subject: "FindX SMTP Test",
        html: "<p>This is a test email from FindX. If you received this, SMTP is configured correctly.</p>",
      });

      return reply.send({ success: true, messageId: result.id });
    } catch (err) {
      return reply.send({
        success: false,
        error: err instanceof Error ? err.message : "Test failed",
      });
    }
  });

  // ─── Email Settings (default provider) ─────────────────────────────

  // GET /api/email/settings
  app.get("/api/email/settings", async (_req, reply) => {
    const setting = await prisma.emailSetting.findUnique({ where: { id: "default" } });

    const hasGmailCredentials = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
    const gmailTokens = await getStoredTokens();
    const smtpConfig = await prisma.smtpConfig.findUnique({ where: { id: "default" } });
    const hasResendKey = !!process.env.RESEND_API_KEY;

    return reply.send({
      defaultProvider: setting?.defaultProvider ?? null,
      providers: {
        gmail: {
          configured: hasGmailCredentials,
          connected: !!gmailTokens,
          email: gmailTokens?.email ?? null,
        },
        smtp: {
          configured: !!smtpConfig,
          email: smtpConfig?.fromEmail ?? null,
        },
        resend: {
          configured: hasResendKey,
          email: process.env.EMAIL_FROM ?? null,
        },
      },
    });
  });

  // PUT /api/email/settings
  app.put("/api/email/settings", async (req, reply) => {
    const schema = z.object({
      defaultProvider: z.enum(["resend", "gmail", "smtp"]),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid provider. Must be resend, gmail, or smtp." });
    }

    await prisma.emailSetting.upsert({
      where: { id: "default" },
      update: { defaultProvider: parsed.data.defaultProvider },
      create: { id: "default", defaultProvider: parsed.data.defaultProvider },
    });

    resetProviderCache();

    return reply.send({ defaultProvider: parsed.data.defaultProvider });
  });

  // ============================================================
  // AI Provider Settings
  // ============================================================

  const aiProviderSchema = z.object({
    name: z.string().min(1).max(100),
    providerType: z.enum(["glm", "anthropic", "openai", "ollama", "minimax", "kimi", "deepseek", "groq"]),
    apiKey: z.string().optional(),
    baseUrl: z.string().optional(),
    model: z.string().min(1),
    temperature: z.number().min(0).max(2).optional().nullable(),
    maxTokens: z.number().int().min(1).max(65536).default(4096),
    isActive: z.boolean().default(true),
  });

  // GET /api/ai/providers — list all providers + active provider
  app.get("/api/ai/providers", async (_req, reply) => {
    const providers = await prisma.aiProvider.findMany({ orderBy: { isDefault: "desc" } });
    // Mask API keys in response
    const masked = providers.map((p) => ({
      ...p,
      apiKey: p.apiKey ? `${p.apiKey.slice(0, 8)}${"*".repeat(8)}` : null,
    }));
    // Include currently active provider (from DB or env fallback)
    const activeProvider = await getActiveProvider();
    return reply.send({
      providers: masked,
      defaults: PROVIDER_DEFAULTS,
      activeProvider: {
        name: activeProvider.name,
        providerType: activeProvider.providerType,
        baseUrl: activeProvider.baseUrl,
        model: activeProvider.model,
        isEnvFallback: !activeProvider.id,
      },
    });
  });

  // POST /api/ai/providers — create provider
  app.post("/api/ai/providers", async (req, reply) => {
    const data = aiProviderSchema.parse(req.body);
    const defaults = PROVIDER_DEFAULTS[data.providerType];
    const provider = await prisma.aiProvider.create({
      data: {
        name: data.name,
        providerType: data.providerType,
        apiKey: data.apiKey ?? null,
        baseUrl: data.baseUrl || defaults?.defaultBaseUrl || null,
        model: data.model,
        temperature: data.temperature ?? null,
        maxTokens: data.maxTokens,
        isActive: data.isActive,
        isDefault: false,
      },
    });
    return reply.send({ provider: { ...provider, apiKey: provider.apiKey ? `${provider.apiKey.slice(0, 8)}${"*".repeat(8)}` : null } });
  });

  // PATCH /api/ai/providers/:id — update provider
  app.patch("/api/ai/providers/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const data = aiProviderSchema.partial().parse(req.body);
    const provider = await prisma.aiProvider.update({
      where: { id },
      data,
    });
    return reply.send({ provider: { ...provider, apiKey: provider.apiKey ? `${provider.apiKey.slice(0, 8)}${"*".repeat(8)}` : null } });
  });

  // DELETE /api/ai/providers/:id — delete provider
  app.delete("/api/ai/providers/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const provider = await prisma.aiProvider.delete({ where: { id } });
    return reply.send({ deleted: true, name: provider.name });
  });

  // POST /api/ai/providers/:id/test — test provider connection
  app.post("/api/ai/providers/:id/test", async (req, reply) => {
    const { id } = req.params as { id: string };
    const provider = await prisma.aiProvider.findUnique({ where: { id } });
    if (!provider) {
      return reply.status(404).send({ error: "Provider not found" });
    }
    const defaults = PROVIDER_DEFAULTS[provider.providerType];
    const config = {
      name: provider.name,
      providerType: provider.providerType,
      apiKey: provider.apiKey,
      baseUrl: provider.baseUrl || defaults?.defaultBaseUrl || "",
      model: provider.model,
      maxTokens: provider.maxTokens,
      temperature: provider.temperature,
      isActive: provider.isActive,
      isDefault: provider.isDefault,
    };
    const result = await testProvider(config);
    return reply.send(result);
  });

  // POST /api/ai/providers/:id/default — set as default provider
  app.post("/api/ai/providers/:id/default", async (req, reply) => {
    const { id } = req.params as { id: string };
    const provider = await prisma.aiProvider.findUnique({ where: { id } });
    if (!provider) {
      return reply.status(404).send({ error: "Provider not found" });
    }
    if (!provider.isActive) {
      return reply.status(400).send({ error: "Cannot set inactive provider as default" });
    }
    // Unset current default, set new default in a transaction
    await prisma.$transaction([
      prisma.aiProvider.updateMany({ where: { isDefault: true }, data: { isDefault: false } }),
      prisma.aiProvider.update({ where: { id }, data: { isDefault: true } }),
    ]);
    return reply.send({ success: true, providerId: id });
  });

  // GET /api/ai/providers/defaults — get provider default configs
  app.get("/api/ai/providers/defaults", async (_req, reply) => {
    return reply.send({ defaults: PROVIDER_DEFAULTS });
  });

  // --- Telegram Notifications ---

  // GET /api/telegram/settings - get telegram settings
  app.get("/api/telegram/settings", async (_req, reply) => {
    const settings = await prisma.telegramSetting.findUnique({
      where: { id: "default" },
    });
    return reply.send({
      settings: settings
        ? {
            botToken: settings.botToken ? `${settings.botToken.slice(0, 8)}${"*".repeat(8)}` : null,
            chatId: settings.chatId,
            isActive: settings.isActive,
          }
        : null,
    });
  });

  const telegramSettingsSchema = z.object({
    botToken: z.string().min(1),
    chatId: z.string().min(1),
  });

  // POST /api/telegram/settings - save telegram settings
  app.post("/api/telegram/settings", async (req, reply) => {
    const data = telegramSettingsSchema.parse(req.body);
    const settings = await prisma.telegramSetting.upsert({
      where: { id: "default" },
      create: {
        id: "default",
        botToken: data.botToken,
        chatId: data.chatId,
      },
      update: {
        botToken: data.botToken,
        chatId: data.chatId,
      },
    });
    return reply.send({
      success: true,
      settings: {
        botToken: `${settings.botToken.slice(0, 8)}${"*".repeat(8)}`,
        chatId: settings.chatId,
        isActive: settings.isActive,
      },
    });
  });

  // POST /api/telegram/test - test telegram connection
  app.post("/api/telegram/test", async (req, reply) => {
    const data = telegramSettingsSchema.parse(req.body);
    const { sendTelegramNotification } = await import("../lib/notifications/telegram.js");
    const result = await sendTelegramNotification(
      { botToken: data.botToken, chatId: data.chatId },
      {
        type: "sent",
        leadEmail: "test@example.com",
        leadName: "Test User",
        company: "Test Company",
        additionalInfo: "This is a test notification from FindX",
      }
    );
    return reply.send(result);
  });

  // DELETE /api/telegram/settings - delete telegram settings
  app.delete("/api/telegram/settings", async (_req, reply) => {
    try {
      await prisma.telegramSetting.delete({ where: { id: "default" } });
      return reply.send({ deleted: true });
    } catch {
      return reply.status(404).send({ error: "Settings not found" });
    }
  });

  // --- Email Scheduling ---

  const scheduleEmailSchema = z.object({
    outreachId: z.string().min(1),
    sendAt: z.string().transform((v) => new Date(v)),
  });

  // POST /api/outreaches/:id/schedule - schedule an email
  app.post("/api/outreaches/:id/schedule", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = scheduleEmailSchema.safeParse({ outreachId: id, ...req.body });
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: parsed.error.flatten(),
      });
    }

    const outreach = await prisma.outreach.findUnique({
      where: { id },
      include: { lead: true },
    });

    if (!outreach) {
      return reply.status(404).send({ error: "Outreach not found" });
    }

    const updated = await prisma.outreach.update({
      where: { id },
      data: {
        scheduledAt: parsed.data.sendAt,
        status: "approved",
      },
    });

    return reply.send({ success: true, outreach: updated });
  });

  // DELETE /api/outreaches/:id/schedule - cancel scheduled email
  app.delete("/api/outreaches/:id/schedule", async (req, reply) => {
    const { id } = req.params as { id: string };

    const outreach = await prisma.outreach.findUnique({ where: { id } });
    if (!outreach) {
      return reply.status(404).send({ error: "Outreach not found" });
    }

    const updated = await prisma.outreach.update({
      where: { id },
      data: {
        scheduledAt: null,
        status: "draft",
      },
    });

    return reply.send({ success: true, outreach: updated });
  });
}
