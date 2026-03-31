import { createWorker } from "../lib/queue/index.js";
import { QUEUE_NAMES } from "./queues.js";
import {
  processGenerateJob,
  processSendJob,
  processTrackJob,
} from "../modules/outreach/outreach.service.js";

export interface OutreachGenerateJobData {
  leadId: string;
  analysisId?: string;
  tone?: "professional" | "friendly" | "urgent";
}

export interface OutreachSendJobData {
  outreachId: string;
}

export interface OutreachTrackJobData {
  outreachId: string;
  event: "open" | "reply" | "bounce";
  timestamp: string;
}

export function startOutreachWorkers() {
  const generateWorker = createWorker<OutreachGenerateJobData>(
    QUEUE_NAMES.OUTREACH_GENERATE,
    async (job) => {
      console.log(
        `[Outreach Generate] Processing job ${job.id} for lead ${job.data.leadId}`,
      );
      const result = await processGenerateJob(job.data);
      console.log(
        `[Outreach Generate] Job ${job.id} complete — outreach ${result.outreachId}`,
      );
      return result;
    },
  );

  const sendWorker = createWorker<OutreachSendJobData>(
    QUEUE_NAMES.OUTREACH_SEND,
    async (job) => {
      console.log(
        `[Outreach Send] Processing job ${job.id} for outreach ${job.data.outreachId}`,
      );
      const result = await processSendJob(job.data);
      console.log(
        `[Outreach Send] Job ${job.id} complete — sent: ${result.sent}`,
      );
      return result;
    },
  );

  const trackWorker = createWorker<OutreachTrackJobData>(
    QUEUE_NAMES.OUTREACH_TRACK,
    async (job) => {
      console.log(
        `[Outreach Track] Processing job ${job.id} — ${job.data.event} for outreach ${job.data.outreachId}`,
      );
      await processTrackJob(job.data);
      console.log(`[Outreach Track] Job ${job.id} complete`);
    },
  );

  return { generateWorker, sendWorker, trackWorker };
}
