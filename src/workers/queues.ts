import { createQueue, createWorker } from "../lib/queue/index.js";

// Queue names matching the architecture spec
export const QUEUE_NAMES = {
  DISCOVERY_KVK: "discovery-kvk",
  DISCOVERY_GOOGLE: "discovery-google",
  ANALYSIS_WEBSITE: "analysis-website",
  OUTREACH_GENERATE: "outreach-generate",
  OUTREACH_SEND: "outreach-send",
  OUTREACH_TRACK: "outreach-track",
  AGENT_PIPELINE: "agent-pipeline",
  EMAIL_SCHEDULER: "email-scheduler",
  EMAIL_FOLLOWUP: "email-followup",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

// Pre-built queues for each job type
export const discoveryKvkQueue = createQueue(QUEUE_NAMES.DISCOVERY_KVK);
export const discoveryGoogleQueue = createQueue(QUEUE_NAMES.DISCOVERY_GOOGLE);
export const analysisQueue = createQueue(QUEUE_NAMES.ANALYSIS_WEBSITE);
export const outreachGenerateQueue = createQueue(QUEUE_NAMES.OUTREACH_GENERATE);
export const outreachSendQueue = createQueue(QUEUE_NAMES.OUTREACH_SEND);
export const outreachTrackQueue = createQueue(QUEUE_NAMES.OUTREACH_TRACK);
export const agentPipelineQueue = createQueue(QUEUE_NAMES.AGENT_PIPELINE);
export const emailSchedulerQueue = createQueue(QUEUE_NAMES.EMAIL_SCHEDULER);
export const emailFollowUpQueue = createQueue(QUEUE_NAMES.EMAIL_FOLLOWUP);
