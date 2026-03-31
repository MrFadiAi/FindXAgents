// Mobile friendliness checker — loads page at mobile and desktop viewports
// Uses Playwright to assess responsive design. No external API needed.

import type { Tool } from "../core/types.js";

export const checkMobileFriendlyTool: Tool = {
  name: "check_mobile_friendly",
  description:
    "Check if a website is mobile-friendly by loading it at mobile and desktop viewports. Returns a score (0-100), checks for viewport meta tag, horizontal scrolling, tiny text, and tap target issues. Use this to assess mobile usability.",
  input_schema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "The URL of the website to check",
      },
    },
    required: ["url"],
  },
  async execute(input) {
    const url = input.url as string;

    const { chromium } = await import("playwright");

    let browser;
    try {
      browser = await chromium.launch({ headless: true });

      // --- Mobile pass (375x812, iPhone X) ---
      const mobilePage = await browser.newPage({
        viewport: { width: 375, height: 812 },
        isMobile: true,
        hasTouch: true,
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
        locale: "nl-NL",
      });

      await mobilePage.goto(url, {
        waitUntil: "networkidle",
        timeout: 30000,
      });
      await mobilePage.waitForTimeout(1000);

      const mobileScreenshot = await mobilePage.screenshot({ type: "png" });
      const screenshotMobile = mobileScreenshot.toString("base64");

      // Check viewport meta tag using Playwright locator
      let viewportMeta = false;
      try {
        const content = await mobilePage
          .locator('meta[name="viewport"]')
          .getAttribute("content");
        viewportMeta = content?.includes("width=device-width") ?? false;
      } catch {
        viewportMeta = false;
      }

      // String-based evaluate avoids TypeScript DOM type issues — runs in browser
      const horizontalScroll = (await mobilePage.evaluate(
        "document.documentElement.scrollWidth > document.documentElement.clientWidth"
      )) as boolean;

      const tinyTextFound = (await mobilePage.evaluate(
        `(() => {
          const els = document.querySelectorAll('p, span, a, li, td, th, label, div');
          let count = 0;
          for (const el of els) {
            if (parseFloat(getComputedStyle(el).fontSize) < 12) count++;
          }
          return count;
        })()`
      )) as number;

      const tapTargetIssues = (await mobilePage.evaluate(
        `(() => {
          const els = document.querySelectorAll("a, button, [role='button'], input[type='submit']");
          let count = 0;
          for (const el of els) {
            const r = el.getBoundingClientRect();
            if (r.width < 48 || r.height < 48) count++;
          }
          return count;
        })()`
      )) as number;

      await mobilePage.close();

      // --- Desktop pass (1280x720) ---
      const desktopPage = await browser.newPage({
        viewport: { width: 1280, height: 720 },
        locale: "nl-NL",
      });

      await desktopPage.goto(url, {
        waitUntil: "networkidle",
        timeout: 30000,
      });
      await desktopPage.waitForTimeout(500);

      const desktopScreenshot = await desktopPage.screenshot({ type: "png" });
      const screenshotDesktop = desktopScreenshot.toString("base64");

      await desktopPage.close();

      // --- Score calculation ---
      const issues: string[] = [];
      let score = 0;

      if (viewportMeta) {
        score += 30;
      } else {
        issues.push("Missing viewport meta tag with width=device-width");
      }

      if (!horizontalScroll) {
        score += 30;
      } else {
        issues.push("Page has horizontal scrolling on mobile viewport");
      }

      if (tinyTextFound === 0) {
        score += 20;
      } else {
        issues.push(
          `Found ${tinyTextFound} text elements with font-size below 12px`
        );
      }

      if (tapTargetIssues === 0) {
        score += 20;
      } else {
        issues.push(
          `Found ${tapTargetIssues} tap targets smaller than 48x48px`
        );
      }

      return JSON.stringify({
        url,
        score,
        viewportMeta,
        horizontalScroll,
        tinyTextCount: tinyTextFound,
        smallTapTargets: tapTargetIssues,
        issues,
        screenshotMobile: screenshotMobile.slice(0, 200) + "...",
        screenshotDesktop: screenshotDesktop.slice(0, 200) + "...",
      });
    } catch (err) {
      return JSON.stringify({
        url,
        score: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  },
};
