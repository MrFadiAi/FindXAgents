/**
 * Lighthouse audit runner.
 *
 * Uses Chrome's built-in Lighthouse via the Node API to audit
 * Performance, Accessibility, SEO, and Best Practices.
 * Falls back to HTTP-based scoring if Chrome/Lighthouse cannot launch.
 */

import type { CategoryScore, Finding, Severity } from "../types.js";

const LIGHTHOUSE_TIMEOUT_MS = 45_000;

interface LighthouseCategoryResult {
  score: number | null;
  auditRefs: Array<{
    id: string;
    weight: number;
    group?: string;
    result: {
      score: number | null;
      scoreDisplayMode: string;
      title: string;
      description?: string;
      numericValue?: number;
      displayValue?: string;
      details?: { items?: Array<Record<string, unknown>> };
    };
  }>;
}

interface LighthouseResult {
  categories: Record<string, LighthouseCategoryResult>;
  audits: Record<
    string,
    {
      score: number | null;
      scoreDisplayMode: string;
      title: string;
      description?: string;
      numericValue?: number;
      displayValue?: string;
      details?: { items?: Array<Record<string, unknown>> };
    }
  >;
}

function getSeverity(score: number | null): Severity {
  if (score === null) return "info";
  if (score < 0.5) return "critical";
  if (score < 0.9) return "warning";
  return "info";
}

function extractFindings(
  category: LighthouseCategoryResult,
): Finding[] {
  const findings: Finding[] = [];

  for (const ref of category.auditRefs) {
    const audit = ref.result;
    if (audit.score !== null && audit.score < 0.9) {
      findings.push({
        category: mapCategoryName(category as unknown as { id: string }),
        title: audit.title,
        severity: getSeverity(audit.score),
        auditId: ref.id,
        description: audit.description ?? "",
        value: audit.displayValue ?? undefined,
      });
    }
  }

  return findings;
}

function mapCategoryName(cat: { id?: string }): string {
  const map: Record<string, string> = {
    performance: "performance",
    accessibility: "accessibility",
    seo: "seo",
    "best-practices": "bestPractices",
  };
  return map[cat.id ?? ""] ?? cat.id ?? "unknown";
}

export interface LighthouseAuditResult {
  categories: CategoryScore[];
  findings: Finding[];
}

/**
 * HTTP-based fallback scoring when Lighthouse can't run.
 * Checks basic website health via fetch and derives approximate scores.
 */
async function httpFallbackAudit(
  url: string,
): Promise<LighthouseAuditResult> {
  const categories: CategoryScore[] = [];
  const findings: Finding[] = [];
  const startTime = Date.now();

  let statusCode = 0;
  let responseTime = 0;
  let hasSSL = false;
  let html = "";

  try {
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(15_000),
      redirect: "follow",
      headers: { "User-Agent": "FindX-Bot/1.0" },
    });
    statusCode = resp.status;
    responseTime = Date.now() - startTime;
    html = await resp.text();
  } catch {
    responseTime = Date.now() - startTime;
  }

  // SSL check
  try {
    const sslResp = await fetch(url.replace("http://", "https://"), {
      signal: AbortSignal.timeout(5_000),
      method: "HEAD",
      redirect: "manual",
    });
    hasSSL = sslResp.status < 400;
  } catch {
    hasSSL = false;
  }

  // --- Performance score ---
  let perfScore = 50;
  if (statusCode >= 200 && statusCode < 400) perfScore += 20;
  if (responseTime < 1000) perfScore += 20;
  else if (responseTime < 3000) perfScore += 10;
  perfScore = Math.min(100, perfScore);

  if (responseTime > 3000) {
    findings.push({
      category: "performance",
      title: "Slow server response",
      severity: "warning",
      auditId: "server-response-time",
      description: `Server responded in ${responseTime}ms`,
      value: `${responseTime}ms`,
    });
  }
  if (statusCode === 0) {
    findings.push({
      category: "performance",
      title: "Server unreachable",
      severity: "critical",
      auditId: "server-unreachable",
      description: "Could not connect to the server",
    });
    perfScore = 10;
  }

  categories.push({ name: "performance", score: perfScore });

  // --- Accessibility score ---
  const hasLang = /<html[^>]*\blang=/i.test(html);
  const hasTitle = /<title[^>]*>.*?<\/title>/i.test(html);
  const hasMetaViewport = /<meta[^>]*name=["']viewport["']/i.test(html);
  const imgsWithoutAlt = (html.match(/<img[^>]*(?!alt=)[^>]*>/gi) || []).length;

  let a11yScore = 60;
  if (hasLang) a11yScore += 10;
  else findings.push({ category: "accessibility", title: "Missing html lang attribute", severity: "warning", auditId: "html-lang" });
  if (hasTitle) a11yScore += 10;
  else findings.push({ category: "accessibility", title: "Missing page title", severity: "critical", auditId: "document-title" });
  if (hasMetaViewport) a11yScore += 10;
  else findings.push({ category: "accessibility", title: "Missing viewport meta tag", severity: "warning", auditId: "viewport" });
  if (imgsWithoutAlt > 5) {
    a11yScore -= 10;
    findings.push({ category: "accessibility", title: `${imgsWithoutAlt} images may lack alt text`, severity: "warning", auditId: "image-alt" });
  }
  categories.push({ name: "accessibility", score: Math.max(0, Math.min(100, a11yScore)) });

  // --- SEO score ---
  const hasMetaDesc = /<meta[^>]*name=["']description["']/i.test(html);
  const hasH1 = /<h1[^>]*>/i.test(html);
  const hasCanonical = /<link[^>]*rel=["']canonical["']/i.test(html);
  const hasOg = /<meta[^>]*property=["']og:/i.test(html);

  let seoScore = 50;
  if (hasMetaDesc) seoScore += 15;
  else findings.push({ category: "seo", title: "Missing meta description", severity: "warning", auditId: "meta-description" });
  if (hasH1) seoScore += 15;
  else findings.push({ category: "seo", title: "Missing H1 heading", severity: "warning", auditId: "h1" });
  if (hasCanonical) seoScore += 10;
  if (hasOg) seoScore += 10;
  if (hasSSL) seoScore += 5;
  else findings.push({ category: "seo", title: "No SSL certificate (HTTPS)", severity: "warning", auditId: "ssl" });
  categories.push({ name: "seo", score: Math.min(100, seoScore) });

  // --- Best Practices score ---
  let bpScore = 70;
  if (hasSSL) bpScore += 15;
  else bpScore -= 20;
  if (statusCode >= 200 && statusCode < 400) bpScore += 15;
  else bpScore -= 30;
  categories.push({ name: "bestPractices", score: Math.max(0, Math.min(100, bpScore)) });

  // Sort by severity
  const severityOrder: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };
  findings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return { categories, findings };
}

export async function runLighthouseAudit(
  url: string,
): Promise<LighthouseAuditResult> {
  const path = await import("node:path");
  const fs = await import("node:fs");

  // Use the temp dir set by setup-tmp.cjs (loaded via --require)
  const tmpDir = process.env.TMP || process.env.TEMP || path.resolve(process.cwd().substring(0, 2) + "/tmp/findx");
  await fs.promises.mkdir(tmpDir, { recursive: true });

  try {
    const chromeLauncher = await import("chrome-launcher");
    const lighthouse = (await import("lighthouse")).default;

    let chrome: { port: number; kill: () => Promise<void> | void } | undefined;

    try {
      chrome = await chromeLauncher.launch({
        chromeFlags: [
          "--headless",
          "--disable-gpu",
          "--no-sandbox",
          "--disable-dev-shm-usage",
          `--user-data-dir=${path.join(tmpDir, "chrome-profile")}`,
        ],
      });

      const options: Record<string, unknown> = {
        logLevel: "error",
        output: "json",
        onlyCategories: ["performance", "accessibility", "seo", "best-practices"],
        port: chrome!.port,
        timeout: LIGHTHOUSE_TIMEOUT_MS,
      };

      const runnerResult = await lighthouse(url, options);
      if (!runnerResult?.lhr) {
        throw new Error("Lighthouse returned no results");
      }

      const lhr = runnerResult.lhr as unknown as LighthouseResult;

      const categories: CategoryScore[] = [];
      const allFindings: Finding[] = [];

      for (const [key, cat] of Object.entries(lhr.categories)) {
        const catName = mapCategoryName({ id: key } as { id?: string });
        const score = cat.score !== null ? Math.round(cat.score * 100) : 0;

        categories.push({
          name: catName,
          score,
        });

        allFindings.push(...extractFindings(cat));
      }

      // Sort findings by severity (critical first)
      const severityOrder: Record<Severity, number> = {
        critical: 0,
        warning: 1,
        info: 2,
      };
      allFindings.sort(
        (a, b) => severityOrder[a.severity] - severityOrder[b.severity],
      );

      return { categories, findings: allFindings };
    } finally {
      if (chrome) {
        await chrome.kill();
      }
    }
  } catch (lighthouseError) {
    // Lighthouse failed — fall back to HTTP-based scoring
    console.warn(
      `[Lighthouse] Chrome/Lighthouse failed (${lighthouseError instanceof Error ? lighthouseError.message : String(lighthouseError)}), using HTTP fallback`,
    );
    return httpFallbackAudit(url);
  }
}
