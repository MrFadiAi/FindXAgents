// AI-powered email generation with personalization
// Builds structured prompts referencing lead data and analysis findings

import type { EmailTone, EmailLanguage } from "./templates.js";
import { pickColdTemplate, renderTemplate, type TemplateVariables } from "./templates.js";
import { simpleChat } from "../../agents/core/client.js";

export interface LeadContext {
  businessName: string;
  industry?: string;
  city: string;
  hasWebsite: boolean;
  website?: string;
  contactName?: string;
  email?: string;
  findings?: Array<{
    category: string;
    title: string;
    description: string;
    severity: "critical" | "warning" | "info";
  }>;
  opportunities?: Array<{
    title: string;
    description: string;
    impact: string;
  }>;
  overallScore?: number;
}

export interface GeneratedEmail {
  subject: string;
  body: string;
  htmlBody: string;
  language: EmailLanguage;
  tone: EmailTone;
  personalizedDetails: {
    specificInsight: string;
    improvementArea: string;
    estimatedImpact: string;
    contactName: string;
  };
}

// Build the Claude prompt for personalized email generation
function buildGenerationPrompt(
  lead: LeadContext,
  tone: EmailTone,
  language: EmailLanguage,
): string {
  const lang = language === "nl" ? "Dutch" : "English";
  const toneGuide = {
    professional: "Formal business register. Direct, factual, data-driven. In Dutch: use 'u' (not 'je/jij'). No superlatives.",
    friendly: "Professional but approachable. Slightly warmer phrasing, but still factual. In Dutch: use 'u'.",
    urgent: "Matter-of-fact emphasis on what is being lost right now. Stay respectful. In Dutch: use 'u'.",
  }[tone];

  const contactName = lead.contactName || lead.businessName;

  const findingsSummary = lead.findings?.length
    ? lead.findings
        .slice(0, 5)
        .map((f) => `- [${f.severity}] ${f.category}: ${f.title} — ${f.description}`)
        .join("\n")
    : "No detailed analysis available.";

  const opportunitiesSummary = lead.opportunities?.length
    ? lead.opportunities
        .slice(0, 3)
        .map((o) => `- ${o.title}: ${o.description} (Impact: ${o.impact})`)
        .join("\n")
    : "";

  const prompt = `You are a consultant analyzing websites for Dutch SMBs. Based on real audit data, write three short, specific text snippets for a cold outreach email in ${lang}.

TONE: ${toneGuide}

LEAD DATA:
- Company: ${lead.businessName}
- Industry: ${lead.industry || "Unknown"}
- City: ${lead.city}
- Has website: ${lead.hasWebsite ? "Yes" : "No"}
${lead.website ? `- Website: ${lead.website}` : ""}
- Overall website score: ${lead.overallScore ?? "N/A"}/100

ANALYSIS FINDINGS:
${findingsSummary}
${opportunitiesSummary ? `\nOPPORTUNITIES:\n${opportunitiesSummary}` : ""}

YOUR TASK:
Write exactly these 3 fields, referencing real data from the findings above. Be specific and factual.

Output a JSON object with exactly these fields:
{
  "specificInsight": "One concrete observation pulled from the findings. Must reference an actual metric or fact (e.g. a Lighthouse score, a missing element, a load time). Not a generic compliment. Max 120 chars.",
  "improvementArea": "The single highest-impact action they can take, derived from the most critical finding. Max 100 chars.",
  "estimatedImpact": "A realistic, quantified benefit based on industry benchmarks (e.g. '30% meer aanvragen via Google', '2x snellere laadtijd'). No inflated numbers. Max 60 chars."
}

Rules:
- Reference actual findings — every field must contain a specific, verifiable claim
- For no-website leads: focus on absence of online presence and what competitors gain
- For low-scoring websites: focus on the highest-severity finding
- Write in ${lang}
- No hype words (never use: 'geweldig', 'fantastisch', 'amazing', 'incredible', 'revolutionary')
- No vague promises ('more customers', 'betere resultaten') — be precise
- "specificInsight" must sound like a consultant who ran the audit, not a salesperson

Respond with ONLY the JSON object, no other text.`;

  return prompt;
}

function plainTextToHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
    .replace(/\n/g, "<br>\n");
}

export async function generatePersonalizedEmail(
  lead: LeadContext,
  tone: EmailTone = "professional",
  language: EmailLanguage = "nl",
): Promise<GeneratedEmail> {
  // Step 1: Generate personalized details using Claude
  const prompt = buildGenerationPrompt(lead, tone, language);

  const raw = await simpleChat(prompt, { maxTokens: 512 });

  let details: { specificInsight: string; improvementArea: string; estimatedImpact: string };
  try {
    // Extract JSON from response (model may wrap in markdown)
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found");
    details = JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error("Failed to parse AI response as JSON");
  }

  const contactName = lead.contactName || lead.businessName;

  // Step 2: Pick template and render with personalized details
  const template = pickColdTemplate(lead.hasWebsite, language);
  const vars: TemplateVariables = {
    companyName: lead.businessName,
    contactName,
    industry: lead.industry || "lokale markt",
    city: lead.city,
    specificInsight: details.specificInsight,
    improvementArea: details.improvementArea,
    estimatedImpact: details.estimatedImpact,
    overallScore: lead.overallScore != null ? String(lead.overallScore) : undefined,
    senderName: "FindX",
    meetingLink: "https://findx.nl/plan-gesprek",
  };

  const { subject, body } = renderTemplate(template, vars);

  return {
    subject,
    body,
    htmlBody: plainTextToHtml(body),
    language,
    tone,
    personalizedDetails: {
      specificInsight: details.specificInsight,
      improvementArea: details.improvementArea,
      estimatedImpact: details.estimatedImpact,
      contactName,
    },
  };
}

// Generate tone variants for A/B testing
export async function generateToneVariants(
  lead: LeadContext,
  language: EmailLanguage = "nl",
): Promise<Record<EmailTone, GeneratedEmail>> {
  const [professional, friendly, urgent] = await Promise.all([
    generatePersonalizedEmail(lead, "professional", language),
    generatePersonalizedEmail(lead, "friendly", language),
    generatePersonalizedEmail(lead, "urgent", language),
  ]);

  return { professional, friendly, urgent };
}
