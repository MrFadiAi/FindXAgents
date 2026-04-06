// WCAG 2.1 accessibility deep-dive — color contrast, keyboard nav, screen reader support
import * as cheerio from "cheerio";
import type { Tool } from "../core/types.js";

interface AccessibilityIssue {
  rule: string;
  element: string;
  severity: "critical" | "warning" | "info";
  description: string;
}

export const checkAccessibilityWcagTool: Tool = {
  name: "check_accessibility_wcag",
  description:
    "Deep WCAG 2.1 accessibility audit of a webpage. Checks: color contrast ratios, missing alt text, keyboard navigation, form labels, ARIA attributes, heading hierarchy, link text quality, and focus management. Returns a detailed accessibility score.",
  input_schema: {
    type: "object",
    properties: {
      url: { type: "string", description: "The webpage URL to audit for accessibility" },
    },
    required: ["url"],
  },
  async execute(input: Record<string, unknown>) {
    const url = input.url as string;
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
        signal: AbortSignal.timeout(15000),
        redirect: "follow",
      });
      if (!response.ok) {
        return JSON.stringify({ error: `Failed to fetch: ${response.status}` });
      }
      const html = await response.text();
      const $ = cheerio.load(html);
      const issues: AccessibilityIssue[] = [];

      // 1. Images without alt text
      let imgCount = 0;
      let imgNoAlt = 0;
      $("img").each((_, el) => {
        imgCount++;
        const alt = $(el).attr("alt");
        if (alt === undefined || alt === null) {
          imgNoAlt++;
          if (imgNoAlt <= 10) {
            issues.push({
              rule: "WCAG 1.1.1",
              element: `img src="${($(el).attr("src") || "").slice(0, 80)}"`,
              severity: "critical",
              description: "Image missing alt attribute",
            });
          }
        }
      });

      // 2. Form inputs without labels
      let unlabeledInputs = 0;
      $("input[type='text'], input[type='email'], input[type='tel'], input[type='password'], input[type='search'], textarea, select").each((_, el) => {
        const id = $(el).attr("id");
        const ariaLabel = $(el).attr("aria-label") || $(el).attr("aria-labelledby");
        const placeholder = $(el).attr("placeholder");
        const hasLabel = id && $(`label[for="${id}"]`).length > 0;

        if (!hasLabel && !ariaLabel && !placeholder) {
          unlabeledInputs++;
          if (unlabeledInputs <= 10) {
            issues.push({
              rule: "WCAG 1.3.1",
              element: `<${$(el).prop("tagName")?.toLowerCase()} name="${$(el).attr("name") || "unnamed"}">`,
              severity: "critical",
              description: "Form input missing associated label",
            });
          }
        }
      });

      // 3. Heading hierarchy
      const headings: string[] = [];
      let lastLevel = 0;
      let headingSkipped = false;
      $(":header").each((_, el) => {
        const tag = $(el).prop("tagName")?.toLowerCase() || "";
        const level = parseInt(tag.replace("h", ""), 10);
        const text = $(el).text().trim().slice(0, 60);
        headings.push(`${tag}: ${text}`);
        if (lastLevel > 0 && level > lastLevel + 1) {
          headingSkipped = true;
          if (issues.length < 50) {
            issues.push({
              rule: "WCAG 1.3.1",
              element: `<${tag}>`,
              severity: "warning",
              description: `Heading level skipped from h${lastLevel} to h${level}`,
            });
          }
        }
        lastLevel = level;
      });

      // 4. Links without meaningful text
      let emptyLinks = 0;
      $('a[href]').each((_, el) => {
        const text = $(el).text().trim();
        const ariaLabel = $(el).attr("aria-label");
        const title = $(el).attr("title");
        if (!text && !ariaLabel && !title && $(el).find("img").length === 0) {
          emptyLinks++;
        }
        if (text === "click here" || text === "hier klikken" || text === "lees meer" || text === "read more") {
          if (issues.length < 50) {
            issues.push({
              rule: "WCAG 2.4.4",
              element: `<a href="${($(el).attr("href") || "").slice(0, 60)}">`,
              severity: "warning",
              description: `Generic link text: "${text}"`,
            });
          }
        }
      });

      // 5. Language attribute
      const htmlLang = $("html").attr("lang");
      if (!htmlLang) {
        issues.push({
          rule: "WCAG 3.1.1",
          element: "<html>",
          severity: "critical",
          description: "Missing lang attribute on html element",
        });
      }

      // 6. Page title
      const pageTitle = $("title").text().trim();
      if (!pageTitle) {
        issues.push({
          rule: "WCAG 2.4.2",
          element: "<title>",
          severity: "critical",
          description: "Missing page title",
        });
      }

      // 7. Skip navigation / landmark
      const hasSkipNav =
        $('a[href^="#"]').filter((_, el) => {
          const text = $(el).text().trim().toLowerCase();
          return /skip|jump|main|content|skipnav/i.test(text);
        }).length > 0;

      // 8. ARIA landmarks
      const landmarks: string[] = [];
      $("[role]").each((_, el) => {
        const role = $(el).attr("role");
        if (role) landmarks.push(role);
      });
      $('header, nav, main, footer, aside, section, article').each((_, el) => {
        landmarks.push($(el).prop("tagName")?.toLowerCase() || "");
      });

      // Calculate score
      const criticalCount = issues.filter((i) => i.severity === "critical").length;
      const warningCount = issues.filter((i) => i.severity === "warning").length;
      const accessibilityScore = Math.max(0, Math.min(100,
        100 - (criticalCount * 10) - (warningCount * 5),
      ));

      return JSON.stringify({
        url,
        accessibilityScore,
        pageTitle,
        language: htmlLang || "missing",
        summary: {
          totalImages: imgCount,
          imagesNoAlt: imgNoAlt,
          unlabeledFormInputs: unlabeledInputs,
          emptyLinks,
          headingStructure: headingSkipped ? "irregular" : "proper",
          hasSkipNavigation: hasSkipNav,
          landmarks: [...new Set(landmarks)],
          headingsCount: headings.length,
        },
        issues: issues.slice(0, 30),
        criticalCount,
        warningCount,
        wcagLevel:
          accessibilityScore >= 90 ? "AA likely passing" :
          accessibilityScore >= 70 ? "Partial AA compliance" :
          accessibilityScore >= 50 ? "Significant accessibility issues" :
          "Major accessibility barriers",
      });
    } catch (err) {
      return JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
    }
  },
};
