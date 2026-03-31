/**
 * Website Analyzer Service.
 *
 * Orchestrates the full analysis pipeline:
 * 1. Run Lighthouse audits (performance, accessibility, SEO, best practices)
 * 2. Detect technologies (CMS, hosting, analytics, frameworks)
 * 3. Calculate overall website score with category breakdowns
 * 4. Parse findings into structured severity-ranked list
 * 5. Use Claude to detect automation opportunities
 * 6. Persist results to the database
 * 7. Optionally generate PDF report
 */

import { prisma } from "../../lib/db/client.js";
import { runLighthouseAudit } from "./audits/lighthouse.js";
import { detectTechnologies } from "./audits/tech-detect.js";
import { calculateOverallScore, scoreLabel } from "./audits/scoring.js";
import { detectOpportunities } from "./automation.js";
import { generatePdfReport } from "./report.js";
import type {
  AnalyzerInput,
  AnalysisResult,
  Finding,
  DetectedTechnology,
  AutomationOpportunity,
  CategoryScore,
} from "./types.js";

// Re-export the result type for consumers
export type { AnalysisResult };

export interface AnalyzeOptions {
  /** Whether to include PDF report bytes in the result. */
  includePdf?: boolean;
  /** Business name for report branding. */
  businessName?: string;
}

/**
 * Run a complete website analysis and persist results.
 */
export async function analyzeWebsite(
  input: AnalyzerInput,
  options: AnalyzeOptions = {},
): Promise<AnalysisResult> {
  const { leadId, url } = input;
  const normalizedUrl = normalizeUrl(url);

  // Update lead status to analyzing
  await prisma.lead.update({
    where: { id: leadId },
    data: { status: "analyzing" },
  });

  try {
    // Step 1: Run Lighthouse audits
    const lighthouseResult = await runLighthouseAudit(normalizedUrl);

    // Step 2: Detect technologies
    const techResult = await detectTechnologies(normalizedUrl);

    // Step 3: Calculate overall score
    const { overall, categories } = calculateOverallScore(
      lighthouseResult.categories,
    );

    // Step 4: Detect automation opportunities via Claude
    const opportunities = await detectOpportunities(
      lighthouseResult.findings,
      techResult.technologies,
      normalizedUrl,
    );

    // Build the full result
    const result: AnalysisResult = {
      url: normalizedUrl,
      overallScore: overall,
      categories,
      technologies: techResult.technologies,
      opportunities,
      findings: lighthouseResult.findings,
      analyzedAt: new Date().toISOString(),
    };

    // Step 5: Persist to database
    const analysis = await prisma.analysis.create({
      data: {
        leadId,
        type: "website",
        score: overall,
        findings: JSON.parse(
          JSON.stringify({
            categories,
            findings: lighthouseResult.findings,
            technologies: techResult.technologies,
            finalUrl: techResult.finalUrl,
            responseHeaders: techResult.responseHeaders,
          }),
        ),
        opportunities: JSON.parse(JSON.stringify(opportunities)),
      },
    });

    // Update lead status to analyzed
    await prisma.lead.update({
      where: { id: leadId },
      data: { status: "analyzed" },
    });

    // Step 6: Generate PDF if requested
    if (options.includePdf) {
      const pdfBuffer = await generatePdfReport(
        result,
        options.businessName,
      );
      // Attach PDF as a document on the analysis (stored in findings for now)
      // In production, this would go to object storage
      (result as AnalysisResult & { pdfBase64?: string }).pdfBase64 =
        pdfBuffer.toString("base64");
    }

    return { ...result, id: analysis.id } as AnalysisResult & { id: string };
  } catch (error) {
    // Revert lead status on failure
    await prisma.lead.update({
      where: { id: leadId },
      data: { status: "discovered" },
    });

    throw error;
  }
}

/**
 * Get all analyses for a lead.
 */
export async function getLeadAnalyses(leadId: string) {
  return prisma.analysis.findMany({
    where: { leadId },
    orderBy: { analyzedAt: "desc" },
  });
}

/**
 * Get a single analysis with its lead.
 */
export async function getAnalysis(analysisId: string) {
  return prisma.analysis.findUnique({
    where: { id: analysisId },
    include: { lead: true },
  });
}

/**
 * Generate a PDF report for an existing analysis.
 */
export async function generateReportForAnalysis(analysisId: string) {
  const analysis = await prisma.analysis.findUnique({
    where: { id: analysisId },
    include: { lead: true },
  });

  if (!analysis) {
    throw new Error("Analysis not found");
  }

  const findings = analysis.findings as {
    categories?: CategoryScore[];
    findings?: Finding[];
    technologies?: DetectedTechnology[];
  };

  const result: AnalysisResult = {
    url: analysis.lead.website ?? "",
    overallScore: analysis.score ?? 0,
    categories: findings.categories ?? [],
    technologies: findings.technologies ?? [],
    opportunities:
      (analysis.opportunities as unknown as AutomationOpportunity[]) ?? [],
    findings: findings.findings ?? [],
    analyzedAt: analysis.analyzedAt.toISOString(),
  };

  return generatePdfReport(result, analysis.lead.businessName);
}

function normalizeUrl(url: string): string {
  let normalized = url.trim();
  if (!normalized.startsWith("http://") && !normalized.startsWith("https://")) {
    normalized = `https://${normalized}`;
  }
  return normalized;
}
