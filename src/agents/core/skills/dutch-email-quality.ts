// Dutch email quality skill — validates formal Dutch, brevity, and professionalism.

import type { AgentSkill, SkillValidationContext, SkillIssue } from "./types.js";

/** Common English words that should be avoided in Dutch outreach */
const ANGLICISMS = [
  "exciting", "amazing", "awesome", "leverage", "synergy", "disrupt",
  "innovative", "cutting-edge", "game-changer", "best-in-class",
  "reach out", "touch base", "circle back", "move the needle",
  "deep dive", "bandwidth", "low-hanging fruit", "pipeline",
];

/** Hype/marketing words to avoid in professional Dutch emails */
const HYPE_WORDS = [
  "revolutionair", "baanbrekend", "ongeëvenaard", "ongeëvenaard",
  "verbluffend", "ongelooflijk", "levenveranderend",
  "game-changing", "disruptive", "next-gen",
];

/** Extract the text to validate — from finalOutput or from relevant tool calls */
function extractEmailText(context: SkillValidationContext): string {
  if (context.finalOutput) {
    return context.finalOutput;
  }

  if (
    context.toolCall &&
    (context.toolCall.name === "render_template" ||
      context.toolCall.name === "save_outreach")
  ) {
    const output = context.toolCall.output;
    if (typeof output === "string") return output;
    if (typeof output === "object" && output !== null) {
      const obj = output as Record<string, unknown>;
      if (typeof obj.body === "string") return obj.body;
      if (typeof obj.content === "string") return obj.content;
      if (typeof obj.emailBody === "string") return obj.emailBody;
      return JSON.stringify(output);
    }
  }

  // Also scan messages for email-like content
  for (const msg of [...context.messages].reverse()) {
    const text =
      typeof msg.content === "string"
        ? msg.content
        : JSON.stringify(msg.content);
    if (text.length > 100) return text;
  }

  return "";
}

/** Count words in text (handles both English and Dutch whitespace) */
function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/** Extract subject line from email text (looks for "Subject:" or "Onderwerp:") */
function extractSubjectLine(text: string): string | null {
  const match = text.match(/(?:subject|onderwerp)\s*:\s*(.+)/i);
  return match ? match[1].trim() : null;
}

export const dutchEmailQuality: AgentSkill = {
  name: "dutch-email-quality",
  description:
    "Validates Dutch email quality: formal address consistency, brevity, no anglicisms, no hype words, and subject line quality.",

  async validate(context: SkillValidationContext): Promise<SkillIssue[]> {
    const issues: SkillIssue[] = [];
    const text = extractEmailText(context);

    if (!text || text.length < 20) {
      // Not enough content to validate
      return issues;
    }

    const lower = text.toLowerCase();

    // 1. Check for mixing formal "u/uw" with informal "je/jij"
    const formalMatches = lower.match(/\b(u|uw|uwe|uwed)\b/g);
    const informalMatches = lower.match(/\b(je|jij|jouw|jullie)\b/g);

    const formalCount = formalMatches?.length ?? 0;
    const informalCount = informalMatches?.length ?? 0;

    if (formalCount > 0 && informalCount > 0) {
      issues.push({
        severity: "error",
        message: `Mixed formality: found ${formalCount} formal ("u/uw") and ${informalCount} informal ("je/jij") references`,
        suggestion:
          'Use consistent formal address ("u/uw") throughout the email for Dutch business communication',
      });
    }

    // 2. Check for anglicisms
    const foundAnglicisms = ANGLICISMS.filter((w) => lower.includes(w));
    if (foundAnglicisms.length > 0) {
      issues.push({
        severity: "warning",
        message: `Found English anglicisms: ${foundAnglicisms.join(", ")}`,
        suggestion:
          "Replace with proper Dutch business terminology to maintain professionalism",
      });
    }

    // 3. Check word count (under 200 words)
    const words = wordCount(text);
    if (words > 200) {
      issues.push({
        severity: "warning",
        message: `Email is ${words} words, exceeding the 200-word guideline`,
        suggestion:
          "Keep emails concise. Dutch business communication values directness — aim for under 200 words",
      });
    }

    // 4. Check for hype words
    const foundHype = HYPE_WORDS.filter((w) => lower.includes(w.toLowerCase()));
    if (foundHype.length > 0) {
      issues.push({
        severity: "warning",
        message: `Found hype/marketing words: ${foundHype.join(", ")}`,
        suggestion:
          "Dutch business culture favors understated, factual language over hype",
      });
    }

    // 5. Check subject line
    const subject = extractSubjectLine(text);
    if (!subject) {
      // Check if this looks like a complete email (has body indicators) but no subject
      if (lower.includes("beste") || lower.includes("geachte") || lower.includes("best regards")) {
        issues.push({
          severity: "warning",
          message: "Email appears to have no subject line",
          suggestion:
            'Include a clear subject line (e.g., "Subject: ..." or "Onderwerp: ...")',
        });
      }
    } else {
      const subjectWords = wordCount(subject);
      if (subjectWords > 8) {
        issues.push({
          severity: "info",
          message: `Subject line is ${subjectWords} words (guideline: under 8)`,
          suggestion: "Shorter subject lines have higher open rates in Dutch B2B outreach",
        });
      }
    }

    return issues;
  },

  getPromptAddition(): string {
    return `## Dutch Email Quality Guidelines
- Use consistent formal address: always "u/uw", never mix with "je/jij/jouw"
- Write in proper Dutch — avoid English business jargon and anglicisms
- Keep emails under 200 words — Dutch business culture values brevity and directness
- Avoid hype and superlatives — be factual and understated
- Include a subject line under 8 words`;
  },
};
