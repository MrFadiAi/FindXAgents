import { detectTechnologies } from "../../modules/analyzer/audits/tech-detect.js";
import type { Tool } from "../core/types.js";

export const detectTechTool: Tool = {
  name: "detect_tech",
  description:
    "Detect technologies used by a website: CMS (WordPress, Shopify, etc.), hosting, analytics tools, JavaScript frameworks. Set renderJs=true for JS-heavy sites to detect client-side frameworks more accurately.",
  input_schema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "The website URL to analyze",
      },
      renderJs: {
        type: "boolean",
        description: "Set to true for JS-heavy sites (renders with headless browser for better framework detection). Default: false.",
      },
    },
    required: ["url"],
  },
  async execute(input: Record<string, unknown>) {
    const url = input.url as string;
    const renderJs = input.renderJs as boolean | undefined;
    try {
      const result = await detectTechnologies(url, { renderJs });
      return JSON.stringify(result.technologies);
    } catch (err) {
      return JSON.stringify({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },
};
