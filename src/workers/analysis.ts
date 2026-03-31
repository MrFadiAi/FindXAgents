import { createWorker } from "../lib/queue/index.js";
import { QUEUE_NAMES } from "./queues.js";
import { analyzeWebsite } from "../modules/analyzer/analyzer.service.js";

export interface AnalysisJobData {
  leadId: string;
  website: string;
}

export function startAnalysisWorker() {
  const worker = createWorker<AnalysisJobData>(
    QUEUE_NAMES.ANALYSIS_WEBSITE,
    async (job) => {
      const { leadId, website } = job.data;
      console.log(`[Analysis] Processing job ${job.id} for ${website}`);

      const result = await analyzeWebsite(
        { leadId, url: website },
        { includePdf: true },
      );

      console.log(
        `[Analysis] Completed for ${website} — Score: ${result.overallScore}/100, Findings: ${result.findings.length}, Opportunities: ${result.opportunities.length}`,
      );

      return {
        leadId,
        overallScore: result.overallScore,
        findingsCount: result.findings.length,
        opportunitiesCount: result.opportunities.length,
      };
    },
  );

  worker.on("completed", (job) => {
    console.log(`[Analysis] Job ${job.id} completed successfully`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[Analysis] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
