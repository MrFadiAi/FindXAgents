import type { Tool } from "./types.js";

import { webSearchTool } from "../tools/web-search.js";
import { scrapePageTool } from "../tools/web-scraper.js";
import { checkWebsiteTool } from "../tools/website-checker.js";
import { kvkSearchTool } from "../tools/kvk-search.js";
import { googlePlacesTool } from "../tools/google-places.js";
import { saveLeadTool, saveAnalysisTool, saveOutreachTool } from "../tools/database.js";
import { renderTemplateTool } from "../tools/email-template.js";
import { runLighthouseTool } from "../tools/lighthouse.js";
import { detectTechTool } from "../tools/tech-detect.js";
import { extractEmailsTool } from "../tools/extract-emails.js";
import { checkMxTool } from "../tools/check-mx.js";
import { takeScreenshotTool } from "../tools/take-screenshot.js";
import { checkSslTool } from "../tools/check-ssl.js";
import { extractSocialTool } from "../tools/extract-social.js";
import { sendEmailTool } from "../tools/email-send.js";
import { placeDetailsTool } from "../tools/place-details.js";
import { competitorCompareTool } from "../tools/competitor-compare.js";
import { domainAgeCheckTool } from "../tools/domain-age-check.js";
import { checkMobileFriendlyTool } from "../tools/check-mobile-friendly.js";

const ALL_TOOLS: Tool[] = [
  webSearchTool,
  scrapePageTool,
  checkWebsiteTool,
  kvkSearchTool,
  googlePlacesTool,
  saveLeadTool,
  saveAnalysisTool,
  saveOutreachTool,
  renderTemplateTool,
  runLighthouseTool,
  detectTechTool,
  extractEmailsTool,
  checkMxTool,
  takeScreenshotTool,
  checkSslTool,
  extractSocialTool,
  sendEmailTool,
  placeDetailsTool,
  competitorCompareTool,
  domainAgeCheckTool,
  checkMobileFriendlyTool,
];

const registry = new Map<string, Tool>();
for (const tool of ALL_TOOLS) {
  registry.set(tool.name, tool);
}

export function getTool(name: string): Tool | undefined {
  return registry.get(name);
}

export function getTools(names: string[]): Tool[] {
  return names.map((n) => registry.get(n)).filter((t): t is Tool => !!t);
}

export function getAllToolDefinitions(): Array<{ name: string; description: string }> {
  return ALL_TOOLS.map((t) => ({ name: t.name, description: t.description }));
}

export function getAllToolNames(): string[] {
  return ALL_TOOLS.map((t) => t.name);
}
