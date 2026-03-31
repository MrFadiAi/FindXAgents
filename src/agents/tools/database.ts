// Database tools — save_lead, save_analysis, save_outreach
// Agents use these to persist results to the existing Prisma models

import { prisma } from "../../lib/db/client.js";
import type { Tool } from "../core/types.js";
import { calculateLeadScore } from "../../modules/leads/lead-scorer.js";

export const saveLeadTool: Tool = {
  name: "save_lead",
  description:
    "Save a discovered business as a lead in the database. Provide business details. Returns the lead ID. If a lead with the same website or business name+city already exists, it updates it instead.",
  input_schema: {
    type: "object",
    properties: {
      businessName: { type: "string", description: "Business name" },
      city: { type: "string", description: "City" },
      address: { type: "string", description: "Street address" },
      industry: { type: "string", description: "Industry or business type" },
      website: { type: "string", description: "Website URL" },
      email: { type: "string", description: "Email address" },
      phone: { type: "string", description: "Phone number" },
      kvkNumber: { type: "string", description: "KVK registration number" },
      description: { type: "string", description: "What the business does" },
      source: { type: "string", description: "How this lead was found (default: agent)" },
    },
    required: ["businessName", "city"],
  },
  async execute(input) {
    const website = (input.website as string) || undefined;
    const kvkNumber = (input.kvkNumber as string) || undefined;
    const businessName = input.businessName as string;
    const city = input.city as string;

    // Build update data shared by all dedup paths
    const updateData = {
      website: website || undefined,
      hasWebsite: !!website,
      email: (input.email as string) || undefined,
      phone: (input.phone as string) || undefined,
      industry: (input.industry as string) || undefined,
      address: (input.address as string) || undefined,
    };

    const createData = {
      businessName,
      city,
      address: (input.address as string) || undefined,
      industry: (input.industry as string) || undefined,
      website,
      hasWebsite: !!website,
      phone: (input.phone as string) || undefined,
      email: (input.email as string) || undefined,
      kvkNumber,
      source: (input.source as string) || "agent",
    };

    // Dedup strategy: prefer kvkNumber (unique), then website, then businessName+city
    if (kvkNumber) {
      const lead = await prisma.lead.upsert({
        where: { kvkNumber },
        update: updateData,
        create: createData,
      });

      // Calculate lead score
      const score = calculateLeadScore({
        hasBusinessName: !!lead.businessName,
        hasCity: !!lead.city,
        hasIndustry: !!lead.industry,
        hasAddress: !!lead.address,
        hasKvkNumber: !!lead.kvkNumber,
        hasWebsite: !!lead.website,
        hasEmail: !!lead.email,
        hasPhone: !!lead.phone,
        hasValidMx: false, // Not known at save_lead time
        hasSocialProfiles: false, // Not known at save_lead time
        websiteScore: null, // No analysis yet
      });
      await prisma.lead.update({ where: { id: lead.id }, data: { leadScore: score } });

      return JSON.stringify({
        id: lead.id,
        businessName: lead.businessName,
        city: lead.city,
        website: lead.website,
        created: lead.createdAt === lead.updatedAt,
      });
    }

    // Fallback: find existing by website or businessName+city
    const existing = website
      ? await prisma.lead.findFirst({ where: { website } })
      : await prisma.lead.findFirst({ where: { businessName, city } });

    if (existing) {
      const lead = await prisma.lead.update({
        where: { id: existing.id },
        data: { ...updateData, kvkNumber },
      });

      // Calculate lead score
      const score = calculateLeadScore({
        hasBusinessName: !!lead.businessName,
        hasCity: !!lead.city,
        hasIndustry: !!lead.industry,
        hasAddress: !!lead.address,
        hasKvkNumber: !!lead.kvkNumber,
        hasWebsite: !!lead.website,
        hasEmail: !!lead.email,
        hasPhone: !!lead.phone,
        hasValidMx: false,
        hasSocialProfiles: false,
        websiteScore: null,
      });
      await prisma.lead.update({ where: { id: lead.id }, data: { leadScore: score } });

      return JSON.stringify({
        id: lead.id,
        businessName: lead.businessName,
        city: lead.city,
        website: lead.website,
        created: false,
      });
    }

    // No match found — create new lead
    const lead = await prisma.lead.create({ data: createData });

    // Calculate lead score
    const score = calculateLeadScore({
      hasBusinessName: !!lead.businessName,
      hasCity: !!lead.city,
      hasIndustry: !!lead.industry,
      hasAddress: !!lead.address,
      hasKvkNumber: !!lead.kvkNumber,
      hasWebsite: !!lead.website,
      hasEmail: !!lead.email,
      hasPhone: !!lead.phone,
      hasValidMx: false,
      hasSocialProfiles: false,
      websiteScore: null,
    });
    await prisma.lead.update({ where: { id: lead.id }, data: { leadScore: score } });

    return JSON.stringify({
      id: lead.id,
      businessName: lead.businessName,
      city: lead.city,
      website: lead.website,
      created: true,
    });
  },
};

export const saveAnalysisTool: Tool = {
  name: "save_analysis",
  description:
    "Save a comprehensive digital presence analysis to the database. Includes website findings, social presence, competitor data, service gaps, and revenue impact estimates.",
  input_schema: {
    type: "object",
    properties: {
      leadId: { type: "string", description: "The lead ID this analysis belongs to" },
      type: { type: "string", description: "Analysis type (default: comprehensive)" },
      score: { type: "number", description: "Overall score 0-100 — how much revenue they're leaving on the table (100 = losing the most)" },
      findings: {
        type: "string",
        description: "JSON array of findings: [{category, title, description, severity}]. Categories: website, social, reviews, seo, competitors, automation",
      },
      opportunities: {
        type: "string",
        description: "JSON array of opportunities: [{title, description, impact, serviceType}]. serviceType: automation|ai_tool|booking|crm|email_marketing|payment|website|seo|social|other",
      },
      socialPresence: {
        type: "string",
        description: 'JSON object: {linkedin:{url,followers},facebook:{url,likes},instagram:{url,followers},googleBusiness:{rating,reviewCount,url}}',
      },
      competitors: {
        type: "string",
        description: "JSON array: [{name,website,strengths,weaknesses,score}] — top 2-3 competitors found",
      },
      serviceGaps: {
        type: "string",
        description: "JSON array: [{service,need:'high'|'medium'|'low',reasoning,estimatedRevenueImpact}] — services this business needs that a software engineer could provide",
      },
      revenueImpact: {
        type: "string",
        description: 'JSON object: {totalEstimatedLoss: number, currency:"EUR", breakdown:[{area,estimatedLoss,reasoning}]}',
      },
    },
    required: ["leadId"],
  },
  async execute(input) {
    const leadId = input.leadId as string;

    const parseJson = (val: unknown, fallback: unknown) => {
      if (!val) return fallback;
      try { return JSON.parse(val as string); } catch { return fallback; }
    };

    const findings = parseJson(input.findings, []);
    const opportunities = parseJson(input.opportunities, null);
    const socialPresence = parseJson(input.socialPresence, {});
    const competitors = parseJson(input.competitors, []);
    const serviceGaps = parseJson(input.serviceGaps, []);
    const revenueImpact = parseJson(input.revenueImpact, {});

    const analysis = await prisma.analysis.create({
      data: {
        leadId,
        type: (input.type as string) || "comprehensive",
        score: (input.score as number) || null,
        findings,
        opportunities,
        socialPresence,
        competitors,
        serviceGaps,
        revenueImpact,
      },
    });

    // Update lead status to analyzed and recalculate score
    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (lead) {
      const score = calculateLeadScore({
        hasBusinessName: !!lead.businessName,
        hasCity: !!lead.city,
        hasIndustry: !!lead.industry,
        hasAddress: !!lead.address,
        hasKvkNumber: !!lead.kvkNumber,
        hasWebsite: !!lead.website,
        hasEmail: !!lead.email,
        hasPhone: !!lead.phone,
        hasValidMx: false,
        hasSocialProfiles: Object.keys(socialPresence).length > 0,
        websiteScore: (input.score as number) || null,
      });
      await prisma.lead.update({
        where: { id: leadId },
        data: { status: "analyzed", leadScore: score },
      });
    }

    return JSON.stringify({
      id: analysis.id,
      leadId,
      score: analysis.score,
      findingCount: Array.isArray(findings) ? findings.length : 0,
      serviceGapsCount: Array.isArray(serviceGaps) ? serviceGaps.length : 0,
      competitorCount: Array.isArray(competitors) ? competitors.length : 0,
    });
  },
};

export const saveOutreachTool: Tool = {
  name: "save_outreach",
  description:
    "Save a drafted outreach email to the database. Provide lead ID, subject, body, and personalization details. Saves as draft status for human review.",
  input_schema: {
    type: "object",
    properties: {
      leadId: { type: "string", description: "The lead ID this outreach is for" },
      subject: { type: "string", description: "Email subject line" },
      body: { type: "string", description: "Email body text" },
      htmlBody: { type: "string", description: "Email body HTML (optional)" },
      tone: { type: "string", enum: ["professional", "friendly", "urgent"] },
      language: { type: "string", enum: ["nl", "en"] },
      personalizedDetails: {
        type: "string",
        description: "JSON object with specificInsight, improvementArea, estimatedImpact",
      },
    },
    required: ["leadId", "subject", "body"],
  },
  async execute(input) {
    const leadId = input.leadId as string;

    let personalizedDetails = {};
    if (input.personalizedDetails) {
      try {
        personalizedDetails = JSON.parse(input.personalizedDetails as string);
      } catch {
        personalizedDetails = {};
      }
    }

    const outreach = await prisma.outreach.create({
      data: {
        leadId,
        status: "draft",
        subject: input.subject as string,
        body: input.body as string,
        personalizedDetails: {
          ...personalizedDetails,
          tone: input.tone || "professional",
          language: input.language || "nl",
          htmlBody: input.htmlBody || undefined,
        },
      },
    });

    // Update lead status to contacting
    await prisma.lead.update({
      where: { id: leadId },
      data: { status: "contacting" },
    });

    return JSON.stringify({
      id: outreach.id,
      leadId,
      subject: outreach.subject,
      status: outreach.status,
    });
  },
};
