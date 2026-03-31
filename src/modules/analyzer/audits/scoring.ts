/**
 * Scoring system for website analysis.
 *
 * Calculates an overall Website Score (0-100) from category scores,
 * weighted by business impact for prospecting use cases.
 */

import type { CategoryScore } from "../types.js";

/**
 * Weights for each category in the overall score.
 * Performance and SEO matter most for the "needs a new website" pitch.
 */
const CATEGORY_WEIGHTS: Record<string, number> = {
  performance: 0.3,
  accessibility: 0.2,
  seo: 0.3,
  bestPractices: 0.2,
};

export interface ScoreBreakdown {
  overall: number;
  categories: CategoryScore[];
}

/**
 * Calculate weighted overall score from category scores.
 */
export function calculateOverallScore(
  categories: CategoryScore[],
): ScoreBreakdown {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const cat of categories) {
    const weight = CATEGORY_WEIGHTS[cat.name] ?? 0.25;
    weightedSum += cat.score * weight;
    totalWeight += weight;
  }

  const overall =
    totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;

  return { overall, categories };
}

/**
 * Map overall score to a human-readable label.
 */
export function scoreLabel(score: number): string {
  if (score >= 90) return "Excellent";
  if (score >= 70) return "Good";
  if (score >= 50) return "Needs work";
  if (score >= 30) return "Poor";
  return "Critical";
}
