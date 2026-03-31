// Service layer — API-facing functions for the agent pipeline

import { prisma } from "../../lib/db/client.js";
import { AgentOrchestrator, type PipelineResult } from "./orchestrator.js";

export async function triggerAgentPipeline(
  query: string,
  sync = false,
  maxResults?: number,
  language: "nl" | "en" = "nl",
): Promise<{ runId: string; status: string } | PipelineResult> {
  // Create pipeline run record
  const run = await prisma.agentPipelineRun.create({
    data: {
      query,
      status: "running",
    },
  });

  if (sync) {
    // Run synchronously
    const orchestrator = new AgentOrchestrator();
    const result = await orchestrator.runPipeline({
      query,
      pipelineRunId: run.id,
      maxResults,
      language,
    });
    return result;
  }

  // Queue background job
  const { agentPipelineQueue } = await import("../../workers/queues.js");
  await agentPipelineQueue.add(
    "agent-pipeline",
    { query, pipelineRunId: run.id, maxResults, language },
    { attempts: 1 },
  );

  return { runId: run.id, status: "queued" };
}

export async function getAgentRuns() {
  return prisma.agentPipelineRun.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export async function getAgentRun(id: string) {
  const run = await prisma.agentPipelineRun.findUnique({ where: { id } });
  if (!run) return null;

  // Get leads that were discovered during this run (by time window)
  const leads = await prisma.lead.findMany({
    where: {
      createdAt: {
        gte: run.createdAt,
        lte: run.completedAt || new Date(),
      },
    },
    include: {
      analyses: { orderBy: { analyzedAt: "desc" }, take: 1 },
      outreaches: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    take: 100,
  });

  return { ...run, leads };
}

export async function getAgentRunEmails(id: string) {
  const run = await prisma.agentPipelineRun.findUnique({ where: { id } });
  if (!run) return null;

  const outreaches = await prisma.outreach.findMany({
    where: {
      createdAt: {
        gte: run.createdAt,
        lte: run.completedAt || new Date(),
      },
    },
    include: {
      lead: {
        select: {
          id: true,
          businessName: true,
          city: true,
          website: true,
          industry: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return outreaches;
}
