// Agent pipeline worker — processes agent pipeline jobs from BullMQ

import { createWorker } from "../lib/queue/index.js";
import { QUEUE_NAMES } from "./queues.js";
import { AgentOrchestrator } from "../agents/orchestrator/orchestrator.js";

export function startAgentWorker() {
  const worker = createWorker(
    QUEUE_NAMES.AGENT_PIPELINE,
    async (job) => {
      const { query, pipelineRunId, maxResults } = job.data as {
        query: string;
        pipelineRunId: string;
        maxResults?: number;
      };

      console.log(`[AgentWorker] Starting pipeline for: "${query}" (maxResults: ${maxResults ?? "unlimited"})`);
      const orchestrator = new AgentOrchestrator();
      return orchestrator.runPipeline({ query, pipelineRunId, maxResults });
    },
  );

  worker.on("completed", (job) => {
    console.log(`[AgentWorker] Pipeline completed: ${job.id}`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[AgentWorker] Pipeline failed: ${job?.id}`, err.message);
  });

  return worker;
}
