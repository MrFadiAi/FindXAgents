// Cookie consent and GDPR compliance auditor
import * as cheerio from "cheerio";
import type { Tool } from "../core/types.js";

interface CookieFinding {
  category: string;
  found: boolean;
  details: string;
  severity: "critical" | "warning" | "info";
}

export const checkCookiesGdprTool: Tool = {
  name: "check_cookies_gdpr",
  description:
    "Audit a website for GDPR/cookie compliance: cookie consent banner, privacy policy, data collection disclosures, tracking scripts, and third-party cookies. Returns compliance score and specific findings.",
  input_schema: {
    type: "object",
    properties: {
      url: { type: "string", description: "The webpage URL to audit for GDPR/cookie compliance" },
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

      const findings: CookieFinding[] = [];

      // 1. Cookie consent banner detection
      const cookieBannerPatterns = [
        /cookie-consent|cookieconsent|cookie-banner|cookiebanner|cookie-notice|cookienotice|cc-banner|cc-window/i,
        /gdpr-banner|gdpr-notice|consent-banner|consent-notice|privacy-banner/i,
        /id="cookie"|class="cookie"|id="consent"|class="consent"|id="gdpr"|class="gdpr/i,
        /accept-cookies|accept-cookies|cookie-accept|cookieaccept|allow-cookies/i,
      ];
      const hasCookieBanner = cookieBannerPatterns.some((pattern) => pattern.test(html));
      findings.push({
        category: "Cookie Consent Banner",
        found: hasCookieBanner,
        details: hasCookieBanner ? "Cookie consent banner detected" : "No cookie consent banner found",
        severity: !hasCookieBanner ? "critical" : "info",
      });

      // 2. Privacy policy link
      const privacyLinkPatterns = /privacy|privacybeleid|privacyverklaring|gegevensbescherming|privacypolicy/i;
      const hasPrivacyLink =
        $('a[href*="privacy"], a[href*="privacybeleid"]').length > 0 ||
        $("a").filter((_, el) => privacyLinkPatterns.test($(el).text())).length > 0 ||
        $('footer a[href*="privacy"]').length > 0;
      findings.push({
        category: "Privacy Policy",
        found: !!hasPrivacyLink,
        details: hasPrivacyLink ? "Privacy policy link found" : "No privacy policy link detected",
        severity: !hasPrivacyLink ? "critical" : "info",
      });

      // 3. Third-party tracking scripts
      const trackers: string[] = [];
      const trackerPatterns: Array<{ name: string; pattern: RegExp }> = [
        { name: "Google Analytics", pattern: /google-analytics\.com|gtag|googletagmanager\.com/i },
        { name: "Google Tag Manager", pattern: /googletagmanager\.com\/gtm/i },
        { name: "Facebook Pixel", pattern: /connect\.facebook\.net\/.*\/fbevents/i },
        { name: "Hotjar", pattern: /static\.hotjar\.com/i },
        { name: "Clarity", pattern: /clarity\.ms/i },
        { name: "HubSpot", pattern: /js\.hs-analytics\.net|js\.hs-scripts\.com/i },
        { name: "LinkedIn Insight", pattern: /snap\.licdn\.com|partner\.linkedin\.com/i },
        { name: "TikTok Pixel", pattern: /analytics\.tiktok\.com/i },
        { name: "Matomo", pattern: /matomo\.php|piwik\.js|matomo\.js/i },
      ];
      for (const tracker of trackerPatterns) {
        if (tracker.pattern.test(html)) trackers.push(tracker.name);
      }
      findings.push({
        category: "Third-party Trackers",
        found: trackers.length > 0,
        details: trackers.length > 0 ? `Found ${trackers.length} trackers: ${trackers.join(", ")}` : "No third-party trackers detected",
        severity: trackers.length > 3 ? "warning" : trackers.length > 0 ? "info" : "info",
      });

      // 4. Data collection forms
      const formsWithData = $("form").filter((_, el) => {
        const formHtml = $(el).html() || "";
        return /email|name|phone|telefoon|naam|address|adres/i.test(formHtml);
      });
      findings.push({
        category: "Data Collection Forms",
        found: formsWithData.length > 0,
        details: formsWithData.length > 0 ? `${formsWithData.length} form(s) collecting personal data` : "No data collection forms found",
        severity: "info",
      });

      // 5. Cookie-related JavaScript
      const hasCookieJs = /document\.cookie|setCookie|getCookie|cookie\s*=|js-cookie/i.test(html);
      findings.push({
        category: "Cookie JavaScript",
        found: hasCookieJs,
        details: hasCookieJs ? "Cookie-manipulating JavaScript detected" : "No cookie JS detected",
        severity: "info",
      });

      // 6. Imprint / Colofon (Dutch requirement)
      const hasImprint =
        $('a[href*="impressum"], a[href*="colofon"], a[href*="disclaimer"]').length > 0 ||
        $("a").filter((_, el) => /impressum|colofon|disclaimer/i.test($(el).text())).length > 0;
      findings.push({
        category: "Legal Imprint/Colofon",
        found: !!hasImprint,
        details: hasImprint ? "Legal imprint/colofon link found" : "No imprint/colofon detected",
        severity: !hasImprint ? "warning" : "info",
      });

      const complianceScore = Math.round(
        (hasCookieBanner ? 25 : 0) +
        (hasPrivacyLink ? 25 : 0) +
        (trackers.length <= 2 ? 25 : trackers.length <= 4 ? 15 : 5) +
        (hasImprint ? 25 : 15),
      );

      return JSON.stringify({
        url,
        complianceScore,
        gdprCompliant: hasCookieBanner && hasPrivacyLink,
        findings,
        trackers,
        criticalIssues: findings.filter((f) => f.severity === "critical").length,
        warnings: findings.filter((f) => f.severity === "warning").length,
        recommendation:
          !hasCookieBanner
            ? "CRITICAL: Add a cookie consent banner to comply with GDPR"
            : !hasPrivacyLink
              ? "CRITICAL: Add a privacy policy page"
              : trackers.length > 3
                ? "WARNING: Many third-party trackers — ensure proper consent before loading"
                : "GDPR compliance looks adequate",
      });
    } catch (err) {
      return JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
    }
  },
};
