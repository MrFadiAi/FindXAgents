// Analysis completeness skill — validates that analysis results are thorough and actionable.

import type { AgentSkill, SkillValidationContext, SkillIssue } from "./types.js";

/** Required fields in a complete analysis */
const REQUIRED_FINDINGS_FIELDS = ["findings", "score", "opportunities"];

/** Patterns suggesting prioritized recommendations */
const PRIORITIZATION_PATTERNS = [
  /\b(?:hoog|medium|laag)\s+(?:prioriteit|urgentie|impact)\b/i,
  /\b(?:high|medium|low)\s+(?:priority|urgency|impact)\b/i,
  /\b(?:1\.|2\.|3\.|#1|#2|#3|eerste|tweede|derde)\b/i,
  /\b(?:belangrijkst|meest urgent|kritiek|essentieel)\b/i,
  /\b(?:dringend|snel|onmiddellijk)\b/i,
];

/** Extract tool call output or final output for analysis validation */
function extractAnalysisOutput(
  context: SkillValidationContext,
): { text: string; toolCallName?: string } {
  // Check for save_analysis tool call
  if (context.toolCall?.name === "save_analysis") {
    const output = context.toolCall.output;
    const text =
      typeof output === "string"
        ? output
        : JSON.stringify(output ?? "");
    return { text, toolCallName: "save_analysis" };
  }

  if (context.finalOutput) {
    return { text: context.finalOutput };
  }

  // Scan tool calls from messages
  for (const msg of [...context.messages].reverse()) {
    if (typeof msg.content === "string" && msg.content.length > 50) {
      return { text: msg.content };
    }
  }

  return { text: "" };
}

export const analysisCompleteness: AgentSkill = {
  name: "analysis-completeness",
  description:
    "Validates that analysis results include scores, findings, opportunities, and prioritized recommendations.",

  async validate(context: SkillValidationContext): Promise<SkillIssue[]> {
    const issues: SkillIssue[] = [];
    const { text, toolCallName } = extractAnalysisOutput(context);

    if (!text || text.length < 20) {
      // If no save_analysis call found, that's a warning
      if (context.toolCall?.name !== "save_analysis" && !context.finalOutput) {
        issues.push({
          severity: "warning",
          message: "No save_analysis tool call detected in the conversation",
          suggestion:
            "Ensure the analysis agent calls save_analysis with structured findings",
        });
      }
      return issues;
    }

    // 1. Check that save_analysis was called
    if (toolCallName !== "save_analysis" && !context.finalOutput) {
      issues.push({
        severity: "warning",
        message: "Analysis did not use save_analysis tool call",
        suggestion:
          "Always use the save_analysis tool to persist results for downstream use",
      });
    }

    // 2. Check for presence of required fields in output text
    const lower = text.toLowerCase();
    const missingFields: string[] = [];

    for (const field of REQUIRED_FINDINGS_FIELDS) {
      if (!lower.includes(field)) {
        missingFields.push(field);
      }
    }

    if (missingFields.length > 0) {
      issues.push({
        severity: "warning",
        message: `Analysis output may be missing fields: ${missingFields.join(", ")}`,
        suggestion:
          "Include all required fields: findings, score, and opportunities",
      });
    }

    // 3. Check for numeric score
    const hasNumericScore =
      /\b(?:score|rating|cijfer)\s*(?::|=|van)?\s*\d+/.test(lower) ||
      /\b\d+\s*(?:\/\s*\d+|%|punten)\b/.test(lower);
    if (!hasNumericScore) {
      issues.push({
        severity: "warning",
        message: "No numeric score found in analysis output",
        suggestion:
          "Include a quantifiable score (e.g., 45/100, 72%) to make results actionable",
      });
    }

    // 4. Check for prioritized recommendations
    const hasPrioritization = PRIORITIZATION_PATTERNS.some((p) => p.test(text));
    if (!hasPrioritization) {
      issues.push({
        severity: "info",
        message: "Recommendations do not appear to be prioritized",
        suggestion:
          "Prioritize recommendations by impact (high/medium/low) to help the business focus on quick wins",
      });
    }

    return issues;
  },

  getPromptAddition(): string {
    return `## Analysis Completeness Guidelines
- Always call save_analysis with structured findings
- Include a numeric overall score (0-100) and category scores
- List clear findings with specific data points
- Identify concrete opportunities for improvement
- Prioritize recommendations by impact (high/medium/low)
- Provide actionable next steps the business can take immediately`;
  },
};
