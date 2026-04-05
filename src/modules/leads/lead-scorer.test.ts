import { describe, it, expect } from 'vitest';
import { calculateLeadScore, scoreToLabel, scoreToColor } from './lead-scorer';

describe('calculateLeadScore', () => {
  // ── Data Completeness ──

  it('returns 0 when all fields are false or null', () => {
    const input = {
      hasBusinessName: false,
      hasCity: false,
      hasIndustry: false,
      hasAddress: false,
      hasKvkNumber: false,
      hasWebsite: false,
      hasEmail: false,
      hasValidMx: false,
      hasPhone: false,
      hasSocialProfiles: false,
      websiteScore: null,
    };

    expect(calculateLeadScore(input)).toBe(0);
  });

  it('awards 5 points for hasBusinessName', () => {
    const input = {
      hasBusinessName: true,
      hasCity: false,
      hasIndustry: false,
      hasAddress: false,
      hasKvkNumber: false,
      hasWebsite: false,
      hasEmail: false,
      hasValidMx: false,
      hasPhone: false,
      hasSocialProfiles: false,
      websiteScore: null,
    };

    expect(calculateLeadScore(input)).toBe(5);
  });

  it('awards 5 points for hasCity', () => {
    const input = {
      hasBusinessName: false,
      hasCity: true,
      hasIndustry: false,
      hasAddress: false,
      hasKvkNumber: false,
      hasWebsite: false,
      hasEmail: false,
      hasValidMx: false,
      hasPhone: false,
      hasSocialProfiles: false,
      websiteScore: null,
    };

    expect(calculateLeadScore(input)).toBe(5);
  });

  it('awards 5 points for hasIndustry', () => {
    const input = {
      hasBusinessName: false,
      hasCity: false,
      hasIndustry: true,
      hasAddress: false,
      hasKvkNumber: false,
      hasWebsite: false,
      hasEmail: false,
      hasValidMx: false,
      hasPhone: false,
      hasSocialProfiles: false,
      websiteScore: null,
    };

    expect(calculateLeadScore(input)).toBe(5);
  });

  it('awards 3 points for hasAddress', () => {
    const input = {
      hasBusinessName: false,
      hasCity: false,
      hasIndustry: false,
      hasAddress: true,
      hasKvkNumber: false,
      hasWebsite: false,
      hasEmail: false,
      hasValidMx: false,
      hasPhone: false,
      hasSocialProfiles: false,
      websiteScore: null,
    };

    expect(calculateLeadScore(input)).toBe(3);
  });

  it('awards 5 points for hasKvkNumber', () => {
    const input = {
      hasBusinessName: false,
      hasCity: false,
      hasIndustry: false,
      hasAddress: false,
      hasKvkNumber: true,
      hasWebsite: false,
      hasEmail: false,
      hasValidMx: false,
      hasPhone: false,
      hasSocialProfiles: false,
      websiteScore: null,
    };

    expect(calculateLeadScore(input)).toBe(5);
  });

  it('awards 7 points for hasWebsite', () => {
    const input = {
      hasBusinessName: false,
      hasCity: false,
      hasIndustry: false,
      hasAddress: false,
      hasKvkNumber: false,
      hasWebsite: true,
      hasEmail: false,
      hasValidMx: false,
      hasPhone: false,
      hasSocialProfiles: false,
      websiteScore: null,
    };

    expect(calculateLeadScore(input)).toBe(7);
  });

  it('should return the maximum score of 100 when all input fields are true and websiteScore is 100', () => {
    const input = {
      hasBusinessName: true,
      hasCity: true,
      hasIndustry: true,
      hasAddress: true,
      hasKvkNumber: true,
      hasWebsite: true,
      hasEmail: true,
      hasValidMx: true,
      hasPhone: true,
      hasSocialProfiles: true,
      websiteScore: 100,
    };

    // Total: 5 + 5 + 5 + 3 + 5 + 7 + 40 + 10 + 8 + 7 + 5 = 100
    expect(calculateLeadScore(input)).toBe(100);
  });

  it('should cap the score at 100 even if theoretical points exceed 100', () => {
    const input = {
      hasBusinessName: true,
      hasCity: true,
      hasIndustry: true,
      hasAddress: true,
      hasKvkNumber: true,
      hasWebsite: true,
      hasEmail: true,
      hasValidMx: true,
      hasPhone: true,
      hasSocialProfiles: true,
      websiteScore: 150, // Exceeds max 100 Lighthouse score
    };

    // Total: 30 + 60 + 30 = 120 -> capped at 100
    expect(calculateLeadScore(input)).toBe(100);
  });

  it('should calculate Data Completeness points correctly (max 30)', () => {
    const input = {
      hasBusinessName: true, // 5
      hasCity: true,         // 5
      hasIndustry: true,     // 5
      hasAddress: true,      // 3
      hasKvkNumber: true,    // 5
      hasWebsite: true,      // 7
      hasEmail: false,
      hasValidMx: false,
      hasPhone: false,
      hasSocialProfiles: false,
      websiteScore: null,
    };

    expect(calculateLeadScore(input)).toBe(30);
  });

  it('should calculate Website Quality points correctly (max 40)', () => {
    const input = {
      hasBusinessName: false,
      hasCity: false,
      hasIndustry: false,
      hasAddress: false,
      hasKvkNumber: false,
      hasWebsite: false,
      hasEmail: false,
      hasValidMx: false,
      hasPhone: false,
      hasSocialProfiles: false,
      websiteScore: 50,
    };

    // 50 * 0.4 = 20
    expect(calculateLeadScore(input)).toBe(20);
  });

  it('should calculate Contactability points correctly (max 30)', () => {
    const input = {
      hasBusinessName: false,
      hasCity: false,
      hasIndustry: false,
      hasAddress: false,
      hasKvkNumber: false,
      hasWebsite: false,
      hasEmail: true,          // 10
      hasValidMx: true,        // 8
      hasPhone: true,          // 7
      hasSocialProfiles: true, // 5
      websiteScore: null,
    };

    expect(calculateLeadScore(input)).toBe(30);
  });

  it('should round Website Quality points to the nearest integer', () => {
    const input1 = {
      hasBusinessName: false,
      hasCity: false,
      hasIndustry: false,
      hasAddress: false,
      hasKvkNumber: false,
      hasWebsite: false,
      hasEmail: false,
      hasValidMx: false,
      hasPhone: false,
      hasSocialProfiles: false,
      websiteScore: 73, // 73 * 0.4 = 29.2 -> rounds to 29
    };
    expect(calculateLeadScore(input1)).toBe(29);

    const input2 = {
      hasBusinessName: false,
      hasCity: false,
      hasIndustry: false,
      hasAddress: false,
      hasKvkNumber: false,
      hasWebsite: false,
      hasEmail: false,
      hasValidMx: false,
      hasPhone: false,
      hasSocialProfiles: false,
      websiteScore: 76, // 76 * 0.4 = 30.4 -> rounds to 30
    };
    expect(calculateLeadScore(input2)).toBe(30);
  });

  it('should handle a realistic average lead scenario', () => {
    const input = {
      hasBusinessName: true, // 5
      hasCity: true,         // 5
      hasIndustry: true,     // 5
      hasAddress: true,      // 3
      hasKvkNumber: true,    // 5
      hasWebsite: true,      // 7
      hasEmail: true,        // 10
      hasValidMx: true,      // 8
      hasPhone: false,       // 0
      hasSocialProfiles: false, // 0
      websiteScore: 65,      // 65 * 0.4 = 26
    };

    // Total: 30 + 26 + 18 = 74
    expect(calculateLeadScore(input)).toBe(74);
  });
});

describe('scoreToLabel', () => {
  it('should return "hot" for a score of 100', () => {
    expect(scoreToLabel(100)).toBe('hot');
  });

  it('should return "hot" for a score exactly at the lower boundary of 70', () => {
    expect(scoreToLabel(70)).toBe('hot');
  });

  it('should return "hot" for a score between 70 and 100', () => {
    expect(scoreToLabel(85)).toBe('hot');
  });

  it('should return "warm" for a score exactly at the upper boundary of 69', () => {
    expect(scoreToLabel(69)).toBe('warm');
  });

  it('should return "warm" for a score exactly at the lower boundary of 40', () => {
    expect(scoreToLabel(40)).toBe('warm');
  });

  it('should return "warm" for a score between 40 and 69', () => {
    expect(scoreToLabel(55)).toBe('warm');
  });

  it('should return "cold" for a score exactly at the upper boundary of 39', () => {
    expect(scoreToLabel(39)).toBe('cold');
  });

  it('should return "cold" for a score of 0', () => {
    expect(scoreToLabel(0)).toBe('cold');
  });

  it('should return "cold" for a score between 0 and 39', () => {
    expect(scoreToLabel(20)).toBe('cold');
  });
});

describe('scoreToColor', () => {
  it('should return "bg-emerald-500" for a score of 100', () => {
    expect(scoreToColor(100)).toBe('bg-emerald-500');
  });

  it('should return "bg-emerald-500" for a score exactly at the lower boundary of 70', () => {
    expect(scoreToColor(70)).toBe('bg-emerald-500');
  });

  it('should return "bg-emerald-500" for a score between 70 and 100', () => {
    expect(scoreToColor(85)).toBe('bg-emerald-500');
  });

  it('should return "bg-amber-500" for a score exactly at the upper boundary of 69', () => {
    expect(scoreToColor(69)).toBe('bg-amber-500');
  });

  it('should return "bg-amber-500" for a score exactly at the lower boundary of 40', () => {
    expect(scoreToColor(40)).toBe('bg-amber-500');
  });

  it('should return "bg-amber-500" for a score between 40 and 69', () => {
    expect(scoreToColor(55)).toBe('bg-amber-500');
  });

  it('should return "bg-red-500" for a score exactly at the upper boundary of 39', () => {
    expect(scoreToColor(39)).toBe('bg-red-500');
  });

  it('should return "bg-red-500" for a score of 0', () => {
    expect(scoreToColor(0)).toBe('bg-red-500');
  });

  it('should return "bg-red-500" for a score between 0 and 39', () => {
    expect(scoreToColor(20)).toBe('bg-red-500');
  });
});