// Multi-language email quality skill — validates language-specific quality, brevity, and professionalism.
// Applies Dutch rules for "nl", English rules for "en", Arabic rules for "ar".

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

/** Detect the target language from the conversation context */
function detectLanguage(context: SkillValidationContext): "en" | "nl" | "ar" {
  // Check messages for language instruction
  for (const msg of [...context.messages].reverse()) {
    const text = typeof msg.content === "string"
      ? msg.content
      : JSON.stringify(msg.content);
    // Look for explicit language instruction in user message
    const langMatch = text.match(/"language"\s*:\s*"(nl|en|ar)"/);
    if (langMatch) return langMatch[1] as "en" | "nl" | "ar";
    // Look for "Write this email in Dutch/Arabic/English" pattern
    if (/write.*(?:email|this).*in\s+dutch/i.test(text)) return "nl";
    if (/write.*(?:email|this).*in\s+arabic/i.test(text)) return "ar";
    if (/write.*(?:email|this).*in\s+english/i.test(text)) return "en";
  }
  // Check tool calls for language parameter
  if (context.toolCall?.input?.language) {
    return context.toolCall.input.language as "en" | "nl" | "ar";
  }
  // Default to English
  return "en";
}

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
    const language = detectLanguage(context);

    if (!text || text.length < 20) {
      return issues;
    }

    const lower = text.toLowerCase();

    // --- Language-specific checks ---
    if (language === "nl") {
      // Dutch: check formal "u/uw" vs informal "je/jij"
      const formalMatches = lower.match(/\b(u|uw|uwe|uwed)\b/g);
      const informalMatches = lower.match(/\b(je|jij|jouw|jullie)\b/g);
      const formalCount = formalMatches?.length ?? 0;
      const informalCount = informalMatches?.length ?? 0;
      if (formalCount > 0 && informalCount > 0) {
        issues.push({
          severity: "error",
          message: `Mixed formality: found ${formalCount} formal ("u/uw") and ${informalCount} informal ("je/jij") references`,
          suggestion: 'Use consistent formal address ("u/uw") throughout the email for Dutch business communication',
        });
      }
      // Dutch: check for anglicisms
      const foundAnglicisms = ANGLICISMS.filter((w) => lower.includes(w));
      if (foundAnglicisms.length > 0) {
        issues.push({
          severity: "warning",
          message: `Found English anglicisms: ${foundAnglicisms.join(", ")}`,
          suggestion: "Replace with proper Dutch business terminology to maintain professionalism",
        });
      }
      // Dutch: check for hype words
      const foundHype = HYPE_WORDS.filter((w) => lower.includes(w.toLowerCase()));
      if (foundHype.length > 0) {
        issues.push({
          severity: "warning",
          message: `Found hype/marketing words: ${foundHype.join(", ")}`,
          suggestion: "Dutch business culture favors understated, factual language over hype",
        });
      }
      // Dutch: check subject line in Dutch
      const subject = extractSubjectLine(text);
      if (!subject) {
        if (lower.includes("beste") || lower.includes("geachte")) {
          issues.push({
            severity: "warning",
            message: "Email appears to have no subject line",
            suggestion: 'Include a clear subject line (e.g., "Subject: ..." or "Onderwerp: ...")',
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
    } else if (language === "ar") {
      // Arabic: check for mixed RTL/LTR issues
      const hasArabic = /[\u0600-\u06FF]/.test(text);
      if (!hasArabic) {
        issues.push({
          severity: "error",
          message: "Email language is set to Arabic but contains no Arabic text",
          suggestion: "Write the entire email in Modern Standard Arabic (فصحى)",
        });
      }
      // Arabic: check for informal address
      if (/\bإنت\b/.test(text) || /\bإنتي\b/.test(text)) {
        issues.push({
          severity: "error",
          message: 'Found informal Arabic address "إنت/إنتي"',
          suggestion: 'Use formal address: "حضرتكم" or "أنتم"',
        });
      }
      // Arabic: subject line
      const subject = extractSubjectLine(text);
      if (!subject && (text.includes("السيد") || text.includes("السيدة") || text.includes("السلام"))) {
        issues.push({
          severity: "warning",
          message: "Email appears to have no subject line",
          suggestion: 'Include a subject line (e.g., "الموضوع: ..." or "Subject: ...")',
        });
      }
    } else {
      // English: check for buzzwords
      const foundBuzzwords = ANGLICISMS.filter((w) => lower.includes(w));
      if (foundBuzzwords.length > 0) {
        issues.push({
          severity: "warning",
          message: `Found business buzzwords: ${foundBuzzwords.join(", ")}`,
          suggestion: "Use plain, direct language. Business outreach should be factual and understated.",
        });
      }
      // English: check for hype words
      const foundHype = HYPE_WORDS.filter((w) => lower.includes(w.toLowerCase()));
      if (foundHype.length > 0) {
        issues.push({
          severity: "warning",
          message: `Found hype/marketing words: ${foundHype.join(", ")}`,
          suggestion: "Professional outreach should be factual and understated — avoid superlatives",
        });
      }
    }

    // Universal checks (all languages)
    const words = wordCount(text);
    if (words > 200) {
      issues.push({
        severity: "warning",
        message: `Email is ${words} words, exceeding the 200-word guideline`,
        suggestion: "Keep emails concise. Business communication values directness — aim for under 200 words",
      });
    }

    return issues;
  },

  getPromptAddition(): string {
    return `## Email Quality Guidelines (Language-Aware)
The \`language\` field in your input context determines the email language. Apply the rules for the matching language:

### When language = "nl" (Dutch)
- Use consistent formal address: always "u/uw", never mix with "je/jij/jouw"
- Write in proper Dutch — avoid English business jargon and anglicisms
- Avoid hype and superlatives — Dutch business culture favors understated, factual language
- Include a subject line under 8 words in Dutch
- Subject line must be in Dutch — NEVER English for Dutch emails

### When language = "en" (English)
- Use professional British English (colour, optimise, analyse)
- Avoid buzzwords: no leverage, synergy, disruptive, cutting-edge, game-changer
- Be direct and factual — no hype, no superlatives
- Include a subject line under 8 words
- Keep emails under 200 words

### When language = "ar" (Arabic)
- Write in Modern Standard Arabic (فصحى) — no colloquial dialects
- Use formal register: حضرتكم/أنتم — NEVER إنت/إنتي
- Full Arabic for subject line, body, greeting, and closing
- Include a subject line under 8 words in Arabic
- Professional and factual tone — avoid exaggerated language

### Universal Rules (All Languages)
- Keep emails under 200 words — every word earns its place
- Use numbers, not adjectives: "4.2 seconds" not "very slow"
- Include exactly ONE specific finding with a data point
- Subject line under 60 characters
- NEVER use: free, opportunity, exclusive, or equivalents in any language
- You are one person — say "I"/"ik"/"أنا", never "we"/"wij"/"نحن"`;
  },
};
