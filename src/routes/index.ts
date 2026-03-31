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
      language?: "nl" | "en";
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
      { leadId: id, analysisId: body?.analysisId, tone: body?.tone },
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
    language: z.enum(["nl", "en"]).default("nl"),
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
        description: "Discovers businesses matching search queries using web search, KVK/Google APIs, website scraping, and lead enrichment tools.",
        role: "research",
        icon: "Search",
        model: "claude-sonnet-4-20250514",
        maxIterations: 25,
        maxTokens: 4096,
        identityMd: "You are the Research Agent for FindX, a Dutch business prospecting platform. Your job is to discover as many relevant Dutch businesses as possible for a given search query. You use web search, KVK search, and Google Places to find businesses, verify their websites, extract contact information, and save them as leads in the database.",
        soulMd: "## Core Principles\n- **Be thorough**: Search with multiple query variations to maximize coverage\n- **Verify before saving**: Always check a website exists before saving a lead\n- **No duplicates**: Check if a business already exists before saving\n- **Rich data**: Extract as much information as possible (email, phone, industry, address)\n- **Dutch-focused**: All searches target Dutch businesses (.nl domains, Dutch cities)\n\n## Strategy\n1. Start with the user's query and search broadly using web_search\n2. Try kvk_search and google_places_search for structured Dutch business data\n3. For each result, scrape the page for contact details\n4. Verify the website is accessible with check_website\n5. Extract emails using the email extraction tool\n6. Check if the domain can receive email via MX records\n7. Extract social media profiles for enrichment\n8. Save each verified business as a lead\n9. Continue searching with variations until you have comprehensive results",
        toolsMd: "## Available Tools\n\n### Search & Discovery\n- `web_search`: Search the web for Dutch businesses. Use multiple query variations (city + industry, Dutch keywords).\n- `kvk_search`: Search the Dutch Chamber of Commerce (KVK) registry. Returns structured business data with trade names, addresses, and SBI codes.\n- `google_places_search`: Search Google Places for local businesses. Good for finding businesses with physical locations.\n- `scrape_page`: Extract content from a webpage. Use renderJs=true for JavaScript-heavy sites.\n- `check_website`: Verify a website URL is accessible and responsive.\n\n### Data Enrichment\n- `extract_emails`: Extract email addresses from a webpage. Prioritize info@, contact@, hello@ addresses.\n- `extract_social_links`: Find social media profiles (LinkedIn, Facebook, Instagram, etc.).\n- `check_mx`: Verify a domain can receive email via MX records.\n\n### Save Results\n- `save_lead`: Save a discovered business as a lead. Always include businessName and city. Deduplicates automatically.",
        toolNames: ["web_search", "kvk_search", "google_places_search", "scrape_page", "check_website", "extract_emails", "extract_social_links", "check_mx", "save_lead"],
        pipelineOrder: 1,
        isActive: true,
      },
      {
        name: "analysis",
        displayName: "Analysis Agent",
        description: "Analyzes business websites for quality, technology, SEO, and improvement opportunities using Lighthouse audits and tech detection.",
        role: "analysis",
        icon: "BarChart3",
        model: "claude-sonnet-4-20250514",
        maxIterations: 15,
        maxTokens: 4096,
        identityMd: "You are the Analysis Agent for FindX, a Dutch business prospecting platform. Your job is to analyze a business's website to identify quality issues, technology gaps, SEO problems, and specific improvement opportunities. You produce a detailed analysis with actionable findings and an overall score.",
        soulMd: "## Core Principles\n- **Be objective**: Score fairly based on actual findings, not assumptions\n- **Be specific**: Every finding must reference concrete evidence (Lighthouse scores, specific tech issues)\n- **Be actionable**: Findings should lead to clear improvement steps\n- **Dutch context**: Consider Dutch market expectations for web presence\n\n## Analysis Strategy\n1. Run a Lighthouse audit for performance, accessibility, SEO, and best practices\n2. Detect the technology stack (CMS, hosting, frameworks)\n3. Scrape the page content for quality assessment\n4. Check SSL certificate validity\n5. Extract social media presence\n6. Take a screenshot for visual assessment\n7. Compile findings with severity levels (critical, warning, info)\n8. Identify the top 3 improvement opportunities with estimated impact\n9. Calculate an overall score (0-100)\n10. Save the complete analysis to the database",
        toolsMd: "## Available Tools\n\n### Website Analysis\n- `run_lighthouse`: Run a full Lighthouse audit. Returns performance, accessibility, SEO, and best practices scores.\n- `detect_tech`: Detect the technology stack (CMS, hosting, frameworks). Use renderJs=true for SPA sites.\n- `scrape_page`: Extract page content for quality assessment.\n- `check_website`: Verify website accessibility and response time.\n- `take_screenshot`: Capture a screenshot for visual quality assessment.\n- `check_ssl`: Check SSL/TLS certificate validity and expiry.\n- `extract_social_links`: Find social media profiles for presence assessment.\n\n### Save Results\n- `save_analysis`: Save analysis results with score, findings, and opportunities.",
        toolNames: ["run_lighthouse", "detect_tech", "scrape_page", "check_website", "take_screenshot", "check_ssl", "extract_social_links", "save_analysis"],
        pipelineOrder: 2,
        isActive: true,
      },
      {
        name: "outreach",
        displayName: "Outreach Agent",
        description: "Drafts personalized, professional Dutch cold outreach emails based on research and analysis data.",
        role: "outreach",
        icon: "Mail",
        model: "claude-sonnet-4-20250514",
        maxIterations: 10,
        maxTokens: 4096,
        identityMd: "You are the Outreach Agent for FindX, a Dutch business prospecting platform. You write professional cold outreach emails based on concrete analysis data. Every email references actual findings — scores, metrics, and specific issues — never generic observations. The `language` field in your input context determines the email language: `\"nl\"` for Dutch (default, formal u/uw register), `\"en\"` for English (professional, British spelling). Always pass the language value to `render_template` so the correct template is selected.",
        soulMd: "## Email Writing Principles\n\n### Structure\n1. **Factual opening**: State what you analyzed and reference their company name\n2. **Key finding**: One specific, data-backed observation from the analysis\n3. **Impact**: What the finding costs them, quantified if possible\n4. **Call to action**: Low-pressure invitation for a 15-minute call\n\n### Language Rules\n- **Dutch by default** unless specified otherwise\n- **Formal 'u' register**: Always use 'u', 'uw', 'uw bedrijf' — never 'je', 'jij', 'jullie'\n- **Under 150 words**: Every word must earn its place\n- **No jargon**: Write in plain business Dutch a shop owner understands\n- **No hype**: Never use 'geweldig', 'fantastisch', 'revolutionair', 'amazing', 'incredible', 'exclusive'\n- **No vague promises**: Replace 'meer klanten' with '30% meer aanvragen via Google'\n\n### Subject Line Rules\n- Keep under 60 characters\n- Reference a specific finding or their business name\n- Never use salesy words ('gratis', 'kans', 'exclusief', 'free', 'opportunity')\n- Good examples: '{{companyName}} is online niet vindbaar', 'Laadtijd 4.2s — bevinding bij {{companyName}}'\n\n### Mandatory Content\n- Include the website score if available (e.g., 'Uw website scoort 34/100')\n- Reference at least one concrete finding (e.g., 'Uw website laadt in 4.2 seconden')\n- State the improvement with a realistic, quantified impact\n- End with a single, clear CTA\n\n### What NOT to Do\n- Never write generic compliments ('mooie website', 'leuk bedrijf')\n- Never promise specific revenue increases\n- Never use exclamation marks in subject lines\n- Never send more than 150 words",
        toolsMd: "## Available Tools\n\n### Email Tools\n- `render_template`: Render an email template with personalization variables. Always pass specificInsight, improvementArea, estimatedImpact, and overallScore.\n- `save_outreach`: Save a drafted outreach email to the database. Include the personalized details used.\n- `send_email`: Send an email directly. Only use when email sending is configured and the draft is approved.\n\n### Data Enrichment\n- `extract_emails`: Extract emails from the lead's website if not already available.\n- `check_mx`: Verify a domain can receive email before sending. Always check before relying on an extracted email address.\n- `scrape_page`: Get additional context from the lead's website for deeper personalization. Only use when analysis data is insufficient.",
        toolNames: ["render_template", "save_outreach", "send_email", "extract_emails", "check_mx", "scrape_page"],
        pipelineOrder: 3,
        isActive: true,
      },
    ];

    const SKILLS = [
      { agentName: "research", name: "local_search", description: "Search for businesses in a specific Dutch city with industry keywords", toolNames: ["web_search", "kvk_search", "google_places_search"], promptAdd: "When searching for local businesses, combine the city name with industry terms in Dutch. Try multiple variations: '{industry} in {city}', '{city} {industry}', 'beste {industry} {city}'. Use kvk_search first for structured data, then web_search for broader coverage.", sortOrder: 1, isActive: true },
      { agentName: "research", name: "contact_extraction", description: "Extract and verify contact information from business websites", toolNames: ["scrape_page", "extract_emails", "check_mx", "extract_social_links"], promptAdd: "Prioritize extracting email addresses from contact pages and footers. Always verify email domains with check_mx before saving. Also extract phone numbers (Dutch format: +31 or 0xxx). Save social profiles for enrichment.", sortOrder: 2, isActive: true },
      { agentName: "research", name: "website_verification", description: "Verify website accessibility and quality before saving as a lead", toolNames: ["check_website", "scrape_page"], promptAdd: "Before saving any lead, verify the website is accessible with check_website. If the site loads, scrape it briefly to confirm it's a real business site (not a parked domain, under construction, or redirect-only). Skip leads with dead or non-business websites.", sortOrder: 3, isActive: true },
      { agentName: "analysis", name: "performance_audit", description: "Run Lighthouse performance and best practices audit", toolNames: ["run_lighthouse", "check_website"], promptAdd: "Always run Lighthouse first. If Lighthouse fails (timeout, crash), save what you can from check_website data. Focus on Core Web Vitals (LCP, CLS, INP) and mobile performance — most Dutch SMB customers browse on mobile.", sortOrder: 1, isActive: true },
      { agentName: "analysis", name: "tech_stack_analysis", description: "Detect and evaluate the website's technology stack", toolNames: ["detect_tech", "scrape_page"], promptAdd: "Detect the CMS, hosting provider, JavaScript frameworks, and analytics tools. Use renderJs=true for React/Vue/Angular SPAs. Report outdated or insecure technologies as findings. Note if they're using WordPress with known issues.", sortOrder: 2, isActive: true },
      { agentName: "analysis", name: "security_check", description: "Check SSL/TLS certificates and security posture", toolNames: ["check_ssl", "check_website"], promptAdd: "Check SSL certificate validity, expiry date, and protocol version. Flag expired or expiring certificates as critical. Flag missing HTTPS redirects. Check if HSTS headers are present.", sortOrder: 3, isActive: true },
      { agentName: "outreach", name: "dutch_email_drafting", description: "Draft professional Dutch cold outreach emails with analysis references", toolNames: ["render_template", "save_outreach"], promptAdd: "Always use render_template to generate the email structure. Fill specificInsight with a concrete metric from the analysis (e.g., 'Uw website laadt in 4.2 seconden'). improvementArea should name the single highest-impact fix. estimatedImpact should be a realistic, quantified benefit. Then save_outreach with all details.", sortOrder: 1, isActive: true },
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
}
