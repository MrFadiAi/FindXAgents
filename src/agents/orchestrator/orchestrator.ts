// Orchestrator — streaming pipeline: Research → Analysis → Outreach run concurrently.
// Uses AsyncQueue for producer-consumer handoff between phases.
// Research streams discovered leads to analysis as they agent finds them,
// analysis streams completed leads to outreach immediately.

import { prisma } from "../../lib/db/client.js";
import { loadAgentConfig } from "../core/agent-registry.js";
import { runAgentWithLogging } from "../core/runner.js";

export interface PipelineInput {
  pipelineRunId: string;
  query: string;
  maxResults?: number;
  /** Number of leads to analyze concurrently (default: 3) */
  analysisBatchSize?: number;
  /** Email language: "nl" (Dutch, default) or "en" (English) */
  language?: "en" | "nl" | "ar";
}

export interface PipelineResult {
  pipelineRunId: string;
  status: "completed" | "partial" | "failed";
  totalLeadsDiscovered: number;
  totalLeadsAnalyzed: number;
  totalOutreachSent: number;
  errors: string[];
}

/** Simple async queue for producer-consumer handoff between pipeline phases. */
class AsyncQueue<T> {
  private items: T[] = [];
  private waiting: Array<{ resolve: (value: T) => void }>[] = [];
  private closed = false;
  private closeWaiters: Array<{ resolve: () => void }>[] = [];

  push(item: T): void {
    if (this.closed) throw new Error("Queue is closed");
    if (this.waiting.length > 0) {
      const waiter = this.waiting.shift()!;
      waiter.resolve(item);
    } else {
      this.items.push(item);
    }
  }

  /** Pop an item. Returns undefined when the queue is closed and empty. */
  async pop(): Promise<T | undefined> {
    if (this.items.length > 0) {
      return this.items.shift()!;
    }
    if (this.closed) {
      return undefined;
    }
    return new Promise<T | undefined>((resolve) => {
      this.waiting.push({ resolve });
    });
  }

  /** Signal no more items will be pushed. Resolves pending pops with undefined. */
  close(): void {
    this.closed = true;
    for (const w of this.waiting) w.resolve(undefined);
    this.waiting = [];
    for (const w of this.closeWaiters) w.resolve();
    this.closeWaiters = [];
  }

  /** Wait until the queue is closed and fully drained. */
  async waitUntilClosed(): Promise<void> {
    if (this.closed && this.items.length === 0) return;
    return new Promise<void>((resolve) => {
      this.closeWaiters.push({ resolve });
    });
  }
}

export class AgentOrchestrator {
  async runPipeline(input: PipelineInput): Promise<PipelineResult> {
    const errors: string[] = [];
    let totalLeadsDiscovered = 0;
    let totalLeadsAnalyzed = 0;
    let totalOutreachSent = 0;

    const leadQueue = new AsyncQueue<string>();
    const analyzedQueue = new AsyncQueue<{ leadId: string }>();

    try {
      await prisma.agentPipelineRun.update({
        where: { id: input.pipelineRunId },
        data: { status: "running" },
      });

      // Run all three phases concurrently
      const results = await Promise.allSettled([
        // Phase 1: Research — streams discovered lead IDs to leadQueue
        this.runResearch(input, leadQueue, errors),
        // Phase 2: Analysis — consumes from leadQueue, streams to analyzedQueue
        this.runAnalysis(input, leadQueue, analyzedQueue, errors),
        // Phase 3: Outreach — consumes from analyzedQueue
        this.runOutreach(input, analyzedQueue, errors),
      ]);

      // Collect any phase errors
      for (const result of results) {
        if (result.status === "rejected") {
          console.error(`[Orchestrator] Phase rejected: ${result.reason}`);
        }
      }

      // Aggregate counts from phase results
      for (const result of results) {
        if (result.status === "fulfilled" && result.value) {
          totalLeadsDiscovered += result.value.leadsDiscovered ?? 0;
          totalLeadsAnalyzed += result.value.leadsAnalyzed ?? 0;
          totalOutreachSent += result.value.outreachSent ?? 0;
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Pipeline error: ${msg}`);
      console.error(`[Orchestrator] Pipeline error: ${msg}`);
    }

    return this.finalize(input.pipelineRunId, totalLeadsDiscovered, totalLeadsAnalyzed, totalOutreachSent, errors);
  }

  private async runResearch(
    input: PipelineInput,
    leadQueue: AsyncQueue<string>,
    errors: string[],
  ): Promise<{ leadsDiscovered: number }> {
    const researchAgent = await loadAgentConfig("research");
    const pushedIds = new Set<string>();
    let leadsDiscovered = 0;
    const maxCap = input.maxResults;

    // Inject maxResults limit into the research prompt
    let researchPrompt = input.query;
    if (maxCap && maxCap > 0) {
      researchPrompt = `${input.query}\n\nIMPORTANT: Find at most ${maxCap} businesses. Stop searching once you have found ${maxCap} leads.`;
    }

    // Stream save_lead results to the lead queue as the agent discovers them
    const onToolResult = (toolName: string, output: string) => {
      if (toolName !== "save_lead") return;
      try {
        const parsed = JSON.parse(output);
        const id = typeof parsed.id === "string" && parsed.id;
        if (id && !pushedIds.has(id)) {
          // Enforce maxResults cap
          if (maxCap && pushedIds.size >= maxCap) return;
          pushedIds.add(id);
          leadQueue.push(id);
          leadsDiscovered++;
        }
      } catch { /* not valid JSON — skip */ }
    };

    console.log(`[Orchestrator] Starting research for: "${input.query}" (maxResults: ${maxCap ?? "unlimited"})`);

    const researchResult = await runAgentWithLogging(
      researchAgent,
      { agentId: researchAgent.id, pipelineRunId: input.pipelineRunId, phase: "research" },
      researchPrompt,
      onToolResult,
    );

    // Also collect any IDs from tool call logs (for leads saved near the end)
    for (const call of researchResult.toolCalls) {
      if (call.tool === "save_lead") {
        try {
          const parsed = JSON.parse(call.output);
          const id = typeof parsed.id === "string" && parsed.id;
          if (id && !pushedIds.has(id)) {
            if (maxCap && pushedIds.size >= maxCap) continue;
            pushedIds.add(id);
            leadQueue.push(id);
            leadsDiscovered++;
          }
        } catch { /* skip */ }
      }
    }

    // Fallback if no leads found
    if (pushedIds.size === 0) {
      console.log(`[Orchestrator] No leads from initial query, trying broader search`);
      const broaderPrompt = this.buildBroaderQuery(input.query);
      if (broaderPrompt !== researchPrompt) {
        console.log(`[Orchestrator] Retry 1: broader query "${broaderPrompt}"`);
        try {
          const retry1 = await runAgentWithLogging(
            researchAgent,
            { agentId: researchAgent.id, pipelineRunId: input.pipelineRunId, phase: "research" },
            broaderPrompt,
            onToolResult,
          );
          // Collect from retry tool calls
          for (const call of retry1.toolCalls) {
            if (call.tool === "save_lead") {
              try {
              const parsed = JSON.parse(call.output);
              const id = typeof parsed.id === "string" && parsed.id;
              if (id && !pushedIds.has(id)) {
                if (maxCap && pushedIds.size >= maxCap) continue;
                pushedIds.add(id);
                leadQueue.push(id);
                leadsDiscovered++;
              }
            } catch { /* skip */ }
            }
          }
        } catch (err) {
          console.warn(`[Orchestrator] Broader query failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      // Attempt 2: web_search fallback
      if (pushedIds.size === 0) {
        const cityMatch = input.query.match(/(?:in|te|bij)\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)/);
        const city = cityMatch?.[1];
        if (city) {
          const webSearchPrompt = `Use web_search to find "businesses in ${city}" and surrounding area. Look for companies in any industry.`;
          console.log(`[Orchestrator] Retry 2: web search fallback "${webSearchPrompt}"`);
          try {
            const retry2 = await runAgentWithLogging(
              researchAgent,
              { agentId: researchAgent.id, pipelineRunId: input.pipelineRunId, phase: "research" },
              webSearchPrompt,
              onToolResult,
            );
            for (const call of retry2.toolCalls) {
              if (call.tool === "save_lead") {
                try {
                  const parsed = JSON.parse(call.output);
                  const id = typeof parsed.id === "string" && parsed.id;
                  if (id && !pushedIds.has(id)) {
                    if (maxCap && pushedIds.size >= maxCap) continue;
                    pushedIds.add(id);
                    leadQueue.push(id);
                    leadsDiscovered++;
                  }
                } catch { /* skip */ }
              }
            }
          } catch (err) {
            console.warn(`[Orchestrator] Web search fallback failed: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      }

      if (pushedIds.size === 0) {
        console.log(`[Orchestrator] No leads found after all fallback attempts`);
      }
    }

    // Close the queue — analysis will drain remaining items
    leadQueue.close();
    leadsDiscovered = pushedIds.size;

    await prisma.agentPipelineRun.update({
      where: { id: input.pipelineRunId },
      data: { leadsFound: leadsDiscovered },
    });

    console.log(`[Orchestrator] Research complete. Found ${leadsDiscovered} leads.`);
    return { leadsDiscovered };
  }

  private async runAnalysis(
    input: PipelineInput,
    leadQueue: AsyncQueue<string>,
    analyzedQueue: AsyncQueue<{ leadId: string }>,
    errors: string[],
  ): Promise<{ leadsAnalyzed: number }> {
    const analysisAgent = await loadAgentConfig("analysis");
    const batchSize = input.analysisBatchSize ?? 3;
    let leadsAnalyzed = 0;
    const activeBatches: Promise<void>[] = [];

    console.log(`[Orchestrator] Analysis waiting for leads from research...`);

    // Process leads as they come in, with batch concurrency
    while (true) {
      const leadId = await leadQueue.pop();
      if (leadId === undefined) break; // Queue closed, no more leads

      // Check cancellation
      const current = await prisma.agentPipelineRun.findUnique({ where: { id: input.pipelineRunId } });
      if (current?.status === "cancelled") break;

      const lead = await prisma.lead.findUnique({ where: { id: leadId } });
      if (!lead?.website) continue;

      // Run analysis — when batch is full, wait for a slot
      const analysisPromise = (async () => {
        try {
          const leadContext = JSON.stringify({
            id: lead.id,
            businessName: lead.businessName,
            website: lead.website,
            city: lead.city,
            industry: lead.industry,
            email: lead.email,
            phone: lead.phone,
          });

          await runAgentWithLogging(
            analysisAgent,
            { agentId: analysisAgent.id, pipelineRunId: input.pipelineRunId, phase: "analysis" },
            leadContext,
          );
          leadsAnalyzed++;
          analyzedQueue.push({ leadId: lead.id });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          const isTimeout = msg.toLowerCase().includes("timeout") || msg.toLowerCase().includes("timed out");

          if (isTimeout) {
            console.warn(`[Orchestrator] Analysis timeout for ${lead.businessName}, retrying`);
            try {
              const leadContext = JSON.stringify({
                id: lead.id,
                businessName: lead.businessName,
                website: lead.website,
                city: lead.city,
                industry: lead.industry,
                email: lead.email,
                phone: lead.phone,
                _retry: true,
                _extendedTimeout: true,
              });

              await runAgentWithLogging(
                analysisAgent,
                { agentId: analysisAgent.id, pipelineRunId: input.pipelineRunId, phase: "analysis" },
                leadContext,
              );
              leadsAnalyzed++;
              analyzedQueue.push({ leadId: lead.id });
            } catch (retryErr) {
              const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
              console.warn(`[Orchestrator] Analysis retry failed for ${lead.businessName}: ${retryMsg}`);
              errors.push(`Analysis failed (timeout) for ${lead.businessName}: ${retryMsg}`);
            }
          } else {
            errors.push(`Analysis failed for ${lead.businessName}: ${msg}`);
          }
        }
      })();

      activeBatches.push(analysisPromise);

      // Wait for oldest batch to finish when concurrency limit reached
      if (activeBatches.length >= batchSize) {
        await activeBatches.shift();
      }
    }

    // Wait for remaining analyses to complete
    await Promise.allSettled(activeBatches);
    analyzedQueue.close();

    await prisma.agentPipelineRun.update({
      where: { id: input.pipelineRunId },
      data: { leadsAnalyzed: leadsAnalyzed },
    });

    console.log(`[Orchestrator] Analysis complete. Analyzed: ${leadsAnalyzed}`);
    return { leadsAnalyzed };
  }

  private async runOutreach(
    input: PipelineInput,
    analyzedQueue: AsyncQueue<{ leadId: string }>,
    errors: string[],
  ): Promise<{ outreachSent: number }> {
    const outreachAgent = await loadAgentConfig("outreach");
    const outreachLanguage = input.language ?? "en";
    let outreachSent = 0;

    console.log(`[Orchestrator] Outreach waiting for analyzed leads...`);

    while (true) {
      const item = await analyzedQueue.pop();
      if (item === undefined) break; // Queue closed

      // Check cancellation
      const current = await prisma.agentPipelineRun.findUnique({ where: { id: input.pipelineRunId } });
      if (current?.status === "cancelled") break;

      const lead = await prisma.lead.findUnique({
        where: { id: item.leadId },
        include: { analyses: { orderBy: { analyzedAt: "desc" }, take: 1 } },
      });
      if (!lead) continue;

      const latestAnalysis = lead.analyses?.[0];
      if (!latestAnalysis) continue;

      try {
        const outreachContext = JSON.stringify({
          language: outreachLanguage,
          lead: {
            id: lead.id,
            businessName: lead.businessName,
            city: lead.city,
            industry: lead.industry,
            website: lead.website,
            email: lead.email,
            phone: lead.phone,
          },
          analysis: {
            score: latestAnalysis.score,
            findings: latestAnalysis.findings,
            opportunities: latestAnalysis.opportunities,
            socialPresence: latestAnalysis.socialPresence,
            competitors: latestAnalysis.competitors,
            serviceGaps: latestAnalysis.serviceGaps,
            revenueImpact: latestAnalysis.revenueImpact,
          },
        }, null, 2);

        const outreachPrompt = `IMPORTANT: Write this email in ${outreachLanguage === "nl" ? "Dutch" : outreachLanguage === "ar" ? "Arabic" : "English"}. You MUST pass language: "${outreachLanguage}" to the render_template tool.\n\n${outreachContext}`;

        await runAgentWithLogging(
          outreachAgent,
          { agentId: outreachAgent.id, pipelineRunId: input.pipelineRunId, phase: "outreach" },
          outreachPrompt,
        );
        outreachSent++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Outreach failed for ${lead.businessName}: ${msg}`);
      }
    }

    console.log(`[Orchestrator] Outreach complete. Emails drafted: ${outreachSent}`);
    return { outreachSent };
  }

  private buildBroaderQuery(originalQuery: string): string {
    return originalQuery
      .replace(/\b(?:in|te|bij|rond|in de buurt van)\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  private async finalize(
    pipelineRunId: string,
    totalLeadsDiscovered: number,
    totalLeadsAnalyzed: number,
    totalOutreachSent: number,
    errors: string[],
  ): Promise<PipelineResult> {
    const current = await prisma.agentPipelineRun.findUnique({ where: { id: pipelineRunId } });
    if (current?.status === "cancelled") {
      return {
        pipelineRunId,
        status: "failed",
        totalLeadsDiscovered,
        totalLeadsAnalyzed,
        totalOutreachSent,
        errors: [...errors, "Pipeline was cancelled"],
      };
    }

    const hasProgress = totalOutreachSent > 0 || totalLeadsAnalyzed > 0;
    const noLeadsFound = totalLeadsDiscovered === 0;

    let finalStatus: "completed" | "partial" | "failed";
    if (noLeadsFound && errors.length === 0) {
      finalStatus = "completed";
    } else if (errors.length === 0) {
      finalStatus = "completed";
    } else if (hasProgress) {
      finalStatus = "partial";
    } else {
      finalStatus = "failed";
    }

    await prisma.agentPipelineRun.update({
      where: { id: pipelineRunId },
      data: {
        status: finalStatus,
        leadsFound: totalLeadsDiscovered,
        leadsAnalyzed: totalLeadsAnalyzed,
        emailsDrafted: totalOutreachSent,
        error: errors.length > 0 ? errors.join("; ") : null,
        completedAt: new Date(),
      },
    });

    console.log(
      `[Orchestrator] Done (status: ${finalStatus}). Found: ${totalLeadsDiscovered}, Analyzed: ${totalLeadsAnalyzed}, Emails: ${totalOutreachSent}`,
    );

    return {
      pipelineRunId,
      status: finalStatus,
      totalLeadsDiscovered,
      totalLeadsAnalyzed,
      totalOutreachSent,
      errors,
    };
  }
}
