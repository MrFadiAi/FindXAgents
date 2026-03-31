// Orchestrator — chains Research → Analysis → Outreach agents sequentially.
// Uses dynamic agent configs from DB via agent-registry + runAgentWithLogging for execution + logging.

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
  language?: "nl" | "en";
}

export interface PipelineResult {
  pipelineRunId: string;
  status: "completed" | "partial" | "failed";
  totalLeadsDiscovered: number;
  totalLeadsAnalyzed: number;
  totalOutreachSent: number;
  errors: string[];
}

export class AgentOrchestrator {
  async runPipeline(input: PipelineInput): Promise<PipelineResult> {
    const errors: string[] = [];
    let totalLeadsDiscovered = 0;
    let totalLeadsAnalyzed = 0;
    let totalOutreachSent = 0;
    const batchSize = input.analysisBatchSize ?? 3;

    try {
      // ── Phase 1: Research ────────────────────────────────────────────
      console.log(`[Orchestrator] Starting research for: "${input.query}" (maxResults: ${input.maxResults ?? "unlimited"})`);
      const researchAgent = await loadAgentConfig("research");

      await prisma.agentPipelineRun.update({
        where: { id: input.pipelineRunId },
        data: { status: "running" },
      });

      // Inject maxResults limit into the research prompt if specified
      let researchPrompt = input.query;
      if (input.maxResults && input.maxResults > 0) {
        researchPrompt = `${input.query}\n\nIMPORTANT: Find at most ${input.maxResults} businesses. Stop searching once you have found ${input.maxResults} leads.`;
      }

      const researchResult = await runAgentWithLogging(
        researchAgent,
        { agentId: researchAgent.id, pipelineRunId: input.pipelineRunId, phase: "research" },
        researchPrompt,
      );

      // Extract lead IDs from save_lead tool call outputs in the run result
      let leadIds = this.extractLeadIdsFromToolCalls(researchResult.toolCalls);

      // ── Research Fallback ──────────────────────────────────────────
      // If no leads found, try broader queries before giving up
      if (leadIds.length === 0) {
        console.log(`[Orchestrator] No leads from initial query, trying broader search`);

        // Attempt 1: Strip city constraint, use just industry
        const broaderPrompt = this.buildBroaderQuery(input.query);
        if (broaderPrompt !== researchPrompt) {
          console.log(`[Orchestrator] Retry 1: broader query "${broaderPrompt}"`);
          try {
            const retry1 = await runAgentWithLogging(
              researchAgent,
              { agentId: researchAgent.id, pipelineRunId: input.pipelineRunId, phase: "research" },
              broaderPrompt,
            );
            leadIds = this.extractLeadIdsFromToolCalls(retry1.toolCalls);
          } catch (err) {
            console.warn(`[Orchestrator] Broader query failed: ${err instanceof Error ? err.message : String(err)}`);
          }
        }

        // Attempt 2: Use web_search with city-based fallback
        if (leadIds.length === 0) {
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
              );
              leadIds = this.extractLeadIdsFromToolCalls(retry2.toolCalls);
            } catch (err) {
              console.warn(`[Orchestrator] Web search fallback failed: ${err instanceof Error ? err.message : String(err)}`);
            }
          }
        }

        if (leadIds.length === 0) {
          console.log(`[Orchestrator] No leads found after all fallback attempts`);
        }
      }

      // Enforce hard cap on results
      if (input.maxResults && input.maxResults > 0 && leadIds.length > input.maxResults) {
        console.log(`[Orchestrator] Capping results from ${leadIds.length} to ${input.maxResults}`);
        leadIds = leadIds.slice(0, input.maxResults);
      }
      totalLeadsDiscovered = leadIds.length;
      console.log(`[Orchestrator] Research complete. Found ${totalLeadsDiscovered} leads.`);

      await prisma.agentPipelineRun.update({
        where: { id: input.pipelineRunId },
        data: { leadsFound: totalLeadsDiscovered },
      });

      if (leadIds.length === 0) {
        console.log(`[Orchestrator] No leads found — completing pipeline with empty results`);
        return this.finalize(input.pipelineRunId, totalLeadsDiscovered, totalLeadsAnalyzed, totalOutreachSent, errors);
      }

      // ── Phase 2: Analysis ────────────────────────────────────────────
      console.log(`[Orchestrator] Starting analysis for ${leadIds.length} leads (batch size: ${batchSize})`);
      const leads = await prisma.lead.findMany({
        where: { id: { in: leadIds } },
        include: { analyses: { orderBy: { analyzedAt: "desc" } } },
      });

      const leadsWithWebsites = leads.filter((lead) => lead.website);
      if (leadsWithWebsites.length === 0) {
        console.log(`[Orchestrator] No leads with websites found, skipping analysis`);
      } else {
        const analysisAgent = await loadAgentConfig("analysis");
        for (let i = 0; i < leadsWithWebsites.length; i += batchSize) {
          const batch = leadsWithWebsites.slice(i, i + batchSize);

          for (const lead of batch) {
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
              totalLeadsAnalyzed++;
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              const isTimeout = msg.toLowerCase().includes("timeout") || msg.toLowerCase().includes("timed out");

              // ── Analysis Error Tolerance ──────────────────────────────
              if (isTimeout) {
                console.warn(`[Orchestrator] Analysis timeout for ${lead.businessName}, retrying with extended timeout`);
                try {
                  // Retry once — the tool itself handles the longer timeout
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
                  totalLeadsAnalyzed++;
                } catch (retryErr) {
                  const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
                  console.warn(`[Orchestrator] Analysis retry also failed for ${lead.businessName}: ${retryMsg}`);
                  errors.push(`Analysis failed (timeout) for ${lead.businessName}: ${retryMsg}`);
                }
              } else {
                errors.push(`Analysis failed for ${lead.businessName}: ${msg}`);
              }
              // Continue with remaining leads regardless
            }
          }
        }
      }

      console.log(`[Orchestrator] Analysis complete. Analyzed: ${totalLeadsAnalyzed}/${leadsWithWebsites.length}`);

      await prisma.agentPipelineRun.update({
        where: { id: input.pipelineRunId },
        data: { leadsAnalyzed: totalLeadsAnalyzed },
      });

      // ── Phase 3: Outreach ────────────────────────────────────────────
      console.log(`[Orchestrator] Starting outreach for analyzed leads`);
      const analyzedLeads = await prisma.lead.findMany({
        where: {
          id: { in: leadIds },
          analyses: { some: {} },
        },
        include: { analyses: { orderBy: { analyzedAt: "desc" }, take: 1 } },
      });

      const outreachAgent = await loadAgentConfig("outreach");
      for (const lead of analyzedLeads) {
        try {
          const latestAnalysis = lead.analyses[0];
          const outreachContext = JSON.stringify({
            language: input.language ?? "nl",
            lead: {
              id: lead.id,
              businessName: lead.businessName,
              city: lead.city,
              industry: lead.industry,
              website: lead.website,
              email: lead.email,
              phone: lead.phone,
            },
            analysis: latestAnalysis
              ? {
                  score: latestAnalysis.score,
                  findings: latestAnalysis.findings,
                  opportunities: latestAnalysis.opportunities,
                  socialPresence: latestAnalysis.socialPresence,
                  competitors: latestAnalysis.competitors,
                  serviceGaps: latestAnalysis.serviceGaps,
                  revenueImpact: latestAnalysis.revenueImpact,
                }
              : null,
          });

          await runAgentWithLogging(
            outreachAgent,
            { agentId: outreachAgent.id, pipelineRunId: input.pipelineRunId, phase: "outreach" },
            outreachContext,
          );
          totalOutreachSent++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`Outreach failed for ${lead.businessName}: ${msg}`);
        }
      }

      console.log(`[Orchestrator] Outreach complete. Emails drafted: ${totalOutreachSent}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Pipeline error: ${msg}`);
      console.error(`[Orchestrator] Pipeline error: ${msg}`);
    }

    return this.finalize(input.pipelineRunId, totalLeadsDiscovered, totalLeadsAnalyzed, totalOutreachSent, errors);
  }

  /**
   * Extract lead IDs from save_lead tool call results.
   * Each save_lead call returns JSON like {"id":"clxxx...", "businessName":"..."}.
   */
  private extractLeadIdsFromToolCalls(toolCalls: Array<{ tool: string; output: string }>): string[] {
    const ids: string[] = [];
    for (const call of toolCalls) {
      if (call.tool === "save_lead") {
        try {
          const parsed = JSON.parse(call.output);
          if (typeof parsed.id === "string" && parsed.id) {
            ids.push(parsed.id);
          }
        } catch {
          // Not valid JSON — skip
        }
      }
    }
    return [...new Set(ids)];
  }

  /**
   * Build a broader query by removing city/location constraints.
   * Falls back to just the industry if the city part can be stripped.
   */
  private buildBroaderQuery(originalQuery: string): string {
    // Remove common Dutch city/location patterns
    return originalQuery
      .replace(/\b(?:in|te|bij|rond|in de buurt van)\s+[A-Z][a-z]+(?:\s[A-Z][a-z]+)*/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  /**
   * Write final status to DB and return the pipeline result.
   */
  private async finalize(
    pipelineRunId: string,
    totalLeadsDiscovered: number,
    totalLeadsAnalyzed: number,
    totalOutreachSent: number,
    errors: string[],
  ): Promise<PipelineResult> {
    // Check if the run was cancelled while executing
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

    // ── Partial Pipeline Completion ──────────────────────────────────
    const hasProgress = totalOutreachSent > 0 || totalLeadsAnalyzed > 0;
    const noLeadsFound = totalLeadsDiscovered === 0;

    let finalStatus: "completed" | "partial" | "failed";
    if (noLeadsFound && errors.length === 0) {
      // No leads but no errors — clean completion, not a failure
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
