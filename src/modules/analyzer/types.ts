/**
 * Shared types for the Website Analyzer module.
 */

export type Severity = "critical" | "warning" | "info";

export interface Finding {
  /** Category: performance, accessibility, seo, bestPractices, technology */
  category: string;
  /** Short human-readable title of the issue */
  title: string;
  /** Critical / warning / info */
  severity: Severity;
  /** Unique Lighthouse audit ID */
  auditId?: string;
  /** Short description of the issue */
  description?: string;
  /** Numeric or string value (e.g. "8.2 s") */
  value?: string;
}

export interface CategoryScore {
  /** Category name (performance, accessibility, seo, bestPractices) */
  name: string;
  /** Score 0-100 */
  score: number;
}

export interface DetectedTechnology {
  name: string;
  category: "cms" | "hosting" | "analytics" | "framework";
  confidence: number;
  version?: string;
}

export interface AutomationOpportunity {
  title: string;
  description: string;
  impact: "high" | "medium" | "low";
  effort: "low" | "medium" | "high";
  category: string;
}

export interface AnalysisResult {
  id?: string;
  url: string;
  overallScore: number;
  categories: CategoryScore[];
  technologies: DetectedTechnology[];
  findings: Finding[];
  opportunities: AutomationOpportunity[];
  analyzedAt: string;
  pdfBase64?: string;
}

/** Input to the analyzer pipeline. */
export interface AnalyzerInput {
  leadId: string;
  url: string;
}
