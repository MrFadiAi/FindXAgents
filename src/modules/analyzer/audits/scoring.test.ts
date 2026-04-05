import { describe, it, expect } from 'vitest';
import { calculateOverallScore, scoreLabel } from './scoring.js';
import type { CategoryScore } from '../types.js';

describe('calculateOverallScore', () => {
  it('should calculate the correct weighted overall score for standard categories', () => {
    const categories: CategoryScore[] = [
      { name: 'performance', score: 100 },       // 100 * 0.3 = 30
      { name: 'accessibility', score: 100 },      // 100 * 0.2 = 20
      { name: 'seo', score: 100 },                // 100 * 0.3 = 30
      { name: 'bestPractices', score: 100 },      // 100 * 0.2 = 20
    ];
    const result = calculateOverallScore(categories);
    expect(result.overall).toBe(100);
  });

  it('should calculate the correct score for mixed category scores', () => {
    const categories: CategoryScore[] = [
      { name: 'performance', score: 50 },         // 50 * 0.3 = 15
      { name: 'accessibility', score: 80 },       // 80 * 0.2 = 16
      { name: 'seo', score: 40 },                 // 40 * 0.3 = 12
      { name: 'bestPractices', score: 70 },       // 70 * 0.2 = 14
    ];
    // Total weight = 1.0
    // Weighted sum = 15 + 16 + 12 + 14 = 57
    const result = calculateOverallScore(categories);
    expect(result.overall).toBe(57);
  });

  it('should apply the default weight of 0.25 for unknown categories', () => {
    const categories: CategoryScore[] = [
      { name: 'customCategory', score: 100 },     // 100 * 0.25 = 25
      { name: 'anotherCategory', score: 0 },      // 0 * 0.25 = 0
    ];
    // Total weight = 0.5
    // Weighted sum = 25
    // Overall = 25 / 0.5 = 50
    const result = calculateOverallScore(categories);
    expect(result.overall).toBe(50);
  });

  it('should calculate the correct score for a mix of standard and unknown categories', () => {
    const categories: CategoryScore[] = [
      { name: 'performance', score: 100 },        // 100 * 0.3 = 30
      { name: 'customCategory', score: 100 },     // 100 * 0.25 = 25
    ];
    // Total weight = 0.55
    // Weighted sum = 55
    // Overall = Math.round(55 / 0.55) = 100
    const result = calculateOverallScore(categories);
    expect(result.overall).toBe(100);
  });

  it('should return an overall score of 0 for an empty array of categories', () => {
    const result = calculateOverallScore([]);
    expect(result.overall).toBe(0);
  });

  it('should include the categories array in the returned breakdown', () => {
    const categories: CategoryScore[] = [
      { name: 'performance', score: 50 },
    ];
    const result = calculateOverallScore(categories);
    expect(result.categories).toEqual(categories);
    expect(result.categories).toBe(categories); // verifies exact reference return
  });

  it('should correctly round the overall score to the nearest integer', () => {
    // 99 * 0.3 = 29.7
    // 98 * 0.2 = 19.6
    // Total weight = 0.5
    // Weighted sum = 49.3
    // Overall = Math.round(49.3 / 0.5) = Math.round(98.6) = 99
    const categories: CategoryScore[] = [
      { name: 'performance', score: 99 },
      { name: 'accessibility', score: 98 },
    ];
    const result = calculateOverallScore(categories);
    expect(result.overall).toBe(99);
  });
});

describe('scoreLabel', () => {
  it('should return "Excellent" for a score of 90', () => {
    expect(scoreLabel(90)).toBe('Excellent');
  });

  it('should return "Excellent" for a score of 100', () => {
    expect(scoreLabel(100)).toBe('Excellent');
  });

  it('should return "Good" for a score of 89', () => {
    expect(scoreLabel(89)).toBe('Good');
  });

  it('should return "Good" for a score of 70', () => {
    expect(scoreLabel(70)).toBe('Good');
  });

  it('should return "Needs work" for a score of 69', () => {
    expect(scoreLabel(69)).toBe('Needs work');
  });

  it('should return "Needs work" for a score of 50', () => {
    expect(scoreLabel(50)).toBe('Needs work');
  });

  it('should return "Poor" for a score of 49', () => {
    expect(scoreLabel(49)).toBe('Poor');
  });

  it('should return "Poor" for a score of 30', () => {
    expect(scoreLabel(30)).toBe('Poor');
  });

  it('should return "Critical" for a score of 29', () => {
    expect(scoreLabel(29)).toBe('Critical');
  });

  it('should return "Critical" for a score of 0', () => {
    expect(scoreLabel(0)).toBe('Critical');
  });

  it('should handle negative scores as "Critical"', () => {
    expect(scoreLabel(-10)).toBe('Critical');
  });

  it('should handle scores greater than 100 as "Excellent"', () => {
    expect(scoreLabel(105)).toBe('Excellent');
  });
});