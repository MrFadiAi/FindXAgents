// Outreach specificity skill — validates that outreach emails reference specific data points.

import type { AgentSkill, SkillValidationContext, SkillIssue } from "./types.js";

/** Minimum number of specific references expected in a good outreach email */
const MIN_SPECIFIC_REFS = 2;

/** Patterns that indicate specific data references */
const SPECIFIC_DATA_PATTERNS = [
  // Scores and metrics (e.g., "score van 45", "45/100", "72%")
  /\b\d+(\.\d+)?\s*(?:\/|%|procent|punten|score|rating)\b/i,
  /\b(?:score|rating|cijfer)\s+(?:van\s+)?\d+/i,

  // Specific technology names (capitalized words that look like tech)
  /\b(?:WordPress|Shopify|Wix|Squarespace|Joomla|Drupal|Magento|React|Vue|Angular|Next\.?js|Node\.?js|PHP|Python|Ruby|Laravel|Symfony|AngularJS|Vue\.?js|Bootstrap|Tailwind|jQuery)\b/,

  // Competitor or business names in quotes
  /"[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*"/,

  // Specific tools/platforms
  /\b(?:Google Analytics|Meta Pixel|Facebook Pixel|Google Tag Manager|Hotjar|Clarity|Mailchimp|Sendinblue|HubSpot|Salesforce)\b/i,

  // Specific metrics with units
  /\b\d+\s*(?:seconden|seconde|ms|MB|KB|pixels|bezoekers|klanten|werknemers)\b/i,

  // Lighthouse/performance scores
  /\b(?:performance|accessibility|SEO|best practices)\s*:\s*\d+/i,
  /\b(?:LCP|FID|CLS|FCP|TTFB|INP)\b/i,
];

/** Extract text to validate */
function extractText(context: SkillValidationContext): string {
  if (context.finalOutput) {
    return context.finalOutput;
  }

  if (context.toolCall) {
    const output = context.toolCall.output;
    if (typeof output === "string") return output;
    if (typeof output === "object" && output !== null) {
      const obj = output as Record<string, unknown>;
      if (typeof obj.body === "string") return obj.body;
      if (typeof obj.content === "string") return obj.content;
    }
  }

  // Scan messages in reverse for substantial content
  for (const msg of [...context.messages].reverse()) {
    const text =
      typeof msg.content === "string"
        ? msg.content
        : JSON.stringify(msg.content);
    if (text.length > 100) return text;
  }

  return "";
}

/** Count how many specific data patterns match */
function countSpecificReferences(text: string): number {
  let count = 0;
  for (const pattern of SPECIFIC_DATA_PATTERNS) {
    if (pattern.test(text)) {
      count++;
    }
  }
  return count;
}

export const outreachSpecificity: AgentSkill = {
  name: "outreach-specificity",
  description:
    "Validates that outreach emails include specific data references (scores, metrics, tech names, competitor names).",

  async validate(context: SkillValidationContext): Promise<SkillIssue[]> {
    const issues: SkillIssue[] = [];
    const text = extractText(context);

    if (!text || text.length < 20) {
      return issues;
    }

    const refCount = countSpecificReferences(text);

    if (refCount < MIN_SPECIFIC_REFS) {
      issues.push({
        severity: "warning",
        message: `Email contains only ${refCount} specific data reference(s) (minimum: ${MIN_SPECIFIC_REFS})`,
        suggestion:
          "Reference specific analysis findings: e.g., website scores, detected technologies, performance metrics, or competitor names. Generic emails get lower response rates.",
      });
    }

    return issues;
  },

  getPromptAddition(): string {
    return `## Outreach Specificity Guidelines
- Always reference at least 2 specific data points from the analysis
- Include concrete scores, metrics, or technology names (e.g., "Uw website scoort 45/100 op performance", "Uw site gebruikt WordPress 5.x")
- Mention specific competitors or industry benchmarks when available
- Generic outreach without specific references has significantly lower response rates`;
  },
};
