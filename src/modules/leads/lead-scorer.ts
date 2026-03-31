// Lead scoring algorithm — pure math, no AI, no external calls.
// Score = Data Completeness (0-30) + Website Quality (0-40) + Contactability (0-30)

interface ScoringInput {
  hasBusinessName: boolean;
  hasCity: boolean;
  hasIndustry: boolean;
  hasAddress: boolean;
  hasKvkNumber: boolean;
  hasWebsite: boolean;
  hasEmail: boolean;
  hasPhone: boolean;
  hasValidMx: boolean;
  hasSocialProfiles: boolean;
  websiteScore: number | null; // 0-100 from Lighthouse analysis
}

export function calculateLeadScore(input: ScoringInput): number {
  let score = 0;

  // ── Data Completeness (max 30 points) ──
  if (input.hasBusinessName) score += 5;
  if (input.hasCity) score += 5;
  if (input.hasIndustry) score += 5;
  if (input.hasAddress) score += 3;
  if (input.hasKvkNumber) score += 5;
  if (input.hasWebsite) score += 7;

  // ── Website Quality (max 40 points) ──
  if (input.websiteScore != null) {
    score += Math.round(input.websiteScore * 0.4);
  }

  // ── Contactability (max 30 points) ──
  if (input.hasEmail) score += 10;
  if (input.hasValidMx) score += 8;
  if (input.hasPhone) score += 7;
  if (input.hasSocialProfiles) score += 5;

  return Math.min(100, Math.max(0, score));
}

export function scoreToLabel(score: number): "hot" | "warm" | "cold" {
  if (score >= 70) return "hot";
  if (score >= 40) return "warm";
  return "cold";
}

export function scoreToColor(score: number): string {
  if (score >= 70) return "bg-emerald-500";
  if (score >= 40) return "bg-amber-500";
  return "bg-red-500";
}
