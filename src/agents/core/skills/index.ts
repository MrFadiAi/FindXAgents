// Skills registry — exports all skill implementations and types.

export type { AgentSkill, SkillValidationContext, SkillIssue } from "./types.js";
export { dutchEmailQuality } from "./dutch-email-quality.js";
export { outreachSpecificity } from "./outreach-specificity.js";
export { analysisCompleteness } from "./analysis-completeness.js";

import { dutchEmailQuality } from "./dutch-email-quality.js";
import { outreachSpecificity } from "./outreach-specificity.js";
import { analysisCompleteness } from "./analysis-completeness.js";
import type { AgentSkill } from "./types.js";

/** Map skill names to implementations */
export const skillImplementations: Record<string, AgentSkill> = {
  "dutch-email-quality": dutchEmailQuality,
  "outreach-specificity": outreachSpecificity,
  "analysis-completeness": analysisCompleteness,
};
