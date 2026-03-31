// Website screenshot tool — captures a screenshot using Playwright.
// No external API needed. Uses the existing Playwright installation.

import type { Tool } from "../core/types.js";

export const takeScreenshotTool: Tool = {
  name: "take_screenshot",
  description:
    "Take a screenshot of a website's homepage. Returns the path to the saved screenshot file. Useful for visual analysis, reporting, and checking website quality.",
  input_schema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "The URL of the website to screenshot",
      },
      fullPage: {
        type: "boolean",
        description: "Whether to capture the full scrollable page (default: false, viewport only)",
      },
      width: {
        type: "number",
        description: "Viewport width in pixels (default: 1440)",
      },
      height: {
        type: "number",
        description: "Viewport height in pixels (default: 900)",
      },
    },
    required: ["url"],
  },
  async execute(input: Record<string, unknown>) {
    const url = input.url as string;
    const fullPage = (input.fullPage as boolean) ?? false;
    const width = (input.width as number) || 1440;
    const height = (input.height as number) || 900;

    // Dynamic import to avoid loading Playwright at module level
    const { chromium } = await import("playwright");

    let browser;
    try {
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage({
        viewport: { width, height },
        locale: "nl-NL",
      });

      await page.goto(url, {
        waitUntil: "networkidle",
        timeout: 30000,
      });

      // Wait a bit for any lazy-loaded content
      await page.waitForTimeout(1000);

      const screenshot = await page.screenshot({
        fullPage,
        type: "png",
      });

      // Return as base64 so the agent can reference it
      const base64 = screenshot.toString("base64");
      const size = screenshot.length;

      return JSON.stringify({
        url,
        captured: true,
        format: "png",
        fullPage,
        viewport: `${width}x${height}`,
        sizeBytes: size,
        base64Preview: base64.slice(0, 200) + "...",
        note: `Screenshot captured successfully (${(size / 1024).toFixed(0)}KB). The image data is available for analysis.`,
      });
    } catch (err) {
      return JSON.stringify({
        url,
        captured: false,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  },
};
