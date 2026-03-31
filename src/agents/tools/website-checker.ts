import { checkWebsite } from "../../modules/discovery/website-checker.js";
import type { Tool } from "../core/types.js";

import type { WebsiteCheckResult } from "../../modules/discovery/website-checker.js";

export const checkWebsiteTool: Tool = {
  name: "check_website",
  description:
    "Check if a website URL resolves and is accessible. Returns status: active, redirect, error, or none.",
  input_schema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "The URL to check",
      },
    },
    required: ["url"],
  },
  async execute(input: Record<string, unknown>) {
    const url = input.url as string;
    const result: WebsiteCheckResult = await checkWebsite(url);
    return JSON.stringify(result);
  },
};
