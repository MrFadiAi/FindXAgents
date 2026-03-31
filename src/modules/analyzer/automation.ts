/**
 * Automation opportunity detection using AI.
 *
 * Analyzes Lighthouse findings and technology stack to suggest
 * specific improvements: missing tools, UX issues, automation potential.
 */

import type { Finding, DetectedTechnology, AutomationOpportunity } from "./types.js";

const API_KEY = process.env.GLM_API_KEY;
const BASE_URL = process.env.GLM_BASE_URL || "https://api.z.ai/api/anthropic";
const MODEL = process.env.GLM_MODEL || "claude-sonnet-4-20250514";

async function chat(systemPrompt: string, userPrompt: string, maxTokens = 2048): Promise<string> {
  const response = await fetch(`${BASE_URL}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY || "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`AI API error (${response.status}): ${text}`);
  }

  const data = await response.json() as {
    content: Array<{ type: string; text: string }>;
  };
  return data.content?.[0]?.text || "";
}

const SYSTEM_PROMPT = `You are a web consultant analyzing website audit results for Dutch businesses.
Your task is to identify automation opportunities and specific improvements.

For each opportunity, provide:
- title: Short name of the opportunity
- description: What the issue is and why it matters
- impact: "high", "medium", or "low"
- effort: "low", "medium", or "high"
- category: The area it relates to (e.g., "performance", "seo", "accessibility", "technology", "conversion")

Focus on actionable items that a web agency could sell as services.
Respond with valid JSON only.`;

interface AIOpportunity {
  title: string;
  description: string;
  impact: "high" | "medium" | "low";
  effort: "low" | "medium" | "high";
  category: string;
}

export async function detectOpportunities(
  findings: Finding[],
  technologies: DetectedTechnology[],
  url: string,
): Promise<AutomationOpportunity[]> {
  if (findings.length === 0 && technologies.length === 0) {
    return [];
  }

  const prompt = buildPrompt(findings, technologies, url);

  try {
    const text = await chat(SYSTEM_PROMPT, prompt);
    if (!text) {
      return [];
    }

    const parsed = JSON.parse(text);
    const opportunities: AIOpportunity[] = Array.isArray(parsed)
      ? parsed
      : parsed.opportunities ?? [];

    return opportunities.map((opp) => ({
      title: opp.title,
      description: opp.description,
      impact: opp.impact,
      effort: opp.effort,
      category: opp.category,
    }));
  } catch {
    // If AI fails, generate basic opportunities from findings
    return generateFallbackOpportunities(findings);
  }
}

function buildPrompt(
  findings: Finding[],
  technologies: DetectedTechnology[],
  url: string,
): string {
  const sections: string[] = [];

  sections.push(`Website: ${url}\n`);

  if (technologies.length > 0) {
    sections.push("## Detected Technologies");
    for (const tech of technologies) {
      sections.push(`- ${tech.name} (${tech.category})`);
    }
    sections.push("");
  }

  if (findings.length > 0) {
    sections.push("## Audit Findings");
    for (const f of findings.slice(0, 20)) {
      sections.push(
        `- [${f.severity.toUpperCase()}] ${f.category}: ${f.title}${f.value ? ` (${f.value})` : ""}`,
      );
    }
  }

  sections.push(`
Identify 3-8 automation/improvement opportunities. Consider:
- Missing tools (no analytics, no CRM, no booking system)
- Performance issues that affect conversion
- SEO gaps that hurt visibility
- Accessibility problems limiting audience
- Technology choices that could be modernized

Respond as JSON array:
[{"title": "...", "description": "...", "impact": "high|medium|low", "effort": "low|medium|high", "category": "..."}]`);

  return sections.join("\n");
}

function generateFallbackOpportunities(
  findings: Finding[],
): AutomationOpportunity[] {
  const opportunities: AutomationOpportunity[] = [];

  // Group findings by category
  const byCategory = new Map<string, Finding[]>();
  for (const f of findings) {
    const list = byCategory.get(f.category) ?? [];
    list.push(f);
    byCategory.set(f.category, list);
  }

  for (const [category, catFindings] of byCategory) {
    const criticalCount = catFindings.filter(
      (f) => f.severity === "critical",
    ).length;
    if (criticalCount > 0) {
      opportunities.push({
        title: `Fix ${criticalCount} critical ${category} issues`,
        description: `${criticalCount} critical ${category} issues found that significantly impact user experience.`,
        impact: "high",
        effort: "medium",
        category,
      });
    }
  }

  return opportunities.slice(0, 5);
}
