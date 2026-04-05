// Wrapper: render email templates
// Reuses existing templates.ts

import {
  pickColdTemplate,
  renderTemplate,
  type TemplateVariables,
} from "../../modules/outreach/templates.js";
import type { Tool } from "../core/types.js";

export const renderTemplateTool: Tool = {
  name: "render_template",
  description:
    "Render an email template with personalized variables. Provide the template variables and get back a formatted subject and body. Use for Dutch or English emails.",
  input_schema: {
    type: "object",
    properties: {
      has_website: {
        type: "boolean",
        description: "Whether the business has a website (affects template choice)",
      },
      language: {
        type: "string",
        enum: ["en", "nl", "ar"],
        description: "Email language (default: en)",
      },
      company_name: { type: "string" },
      contact_name: { type: "string" },
      industry: { type: "string" },
      city: { type: "string" },
      specific_insight: { type: "string" },
      improvement_area: { type: "string" },
      estimated_impact: { type: "string" },
    },
    required: ["has_website", "company_name", "contact_name", "city"],
  },
  async execute(input) {
    const language = (input.language as "en" | "nl" | "ar") || "en";
    const template = pickColdTemplate(input.has_website as boolean, language);
    // Strip em dashes from agent-generated content
    const strip = (s: string) => s
      .replace(/\s*—\s*/g, ": ")
      .replace(/\s*–\s*/g, ", ")
      .replace(/\s*--\s*/g, ": ");

    const vars: TemplateVariables = {
      companyName: strip(input.company_name as string),
      contactName: strip(input.contact_name as string),
      industry: (input.industry as string) ?? "lokale markt",
      city: input.city as string,
      specificInsight: strip((input.specific_insight as string) || ""),
      improvementArea: strip((input.improvement_area as string) || ""),
      estimatedImpact: strip((input.estimated_impact as string) || ""),
      senderName: "FindX",
      meetingLink: "https://findx.nl/plan-gesprek",
    };

    const result = renderTemplate(template, vars);
    return JSON.stringify(result);
  },
};
