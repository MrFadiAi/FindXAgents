// Pipeline Management Service
// Manages lead pipeline stages and transitions

export const PIPELINE_STAGES = [
  { name: "discovered", order: 0 },
  { name: "analyzing", order: 1 },
  { name: "analyzed", order: 2 },
  { name: "contacting", order: 3 },
  { name: "responded", order: 4 },
  { name: "qualified", order: 5 },
  { name: "won", order: 6 },
  { name: "lost", order: 7 },
] as const;

export type PipelineStageName = (typeof PIPELINE_STAGES)[number]["name"];
