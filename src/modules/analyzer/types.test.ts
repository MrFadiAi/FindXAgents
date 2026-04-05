import { describe, it, expect } from 'vitest';
import type {
  Severity,
  Finding,
  CategoryScore,
  DetectedTechnology,
  AutomationOpportunity,
  AnalysisResult,
  AnalyzerInput,
} from './types';

describe('Severity', () => {
  it('should accept "critical" as a valid Severity', () => {
    const severity: Severity = 'critical';
    expect(severity).toBe('critical');
  });

  it('should accept "warning" as a valid Severity', () => {
    const severity: Severity = 'warning';
    expect(severity).toBe('warning');
  });

  it('should accept "info" as a valid Severity', () => {
    const severity: Severity = 'info';
    expect(severity).toBe('info');
  });
});

describe('Finding', () => {
  it('should create a valid Finding with all optional fields', () => {
    const finding: Finding = {
      category: 'performance',
      title: 'Slow server response time (TTFB)',
      severity: 'critical',
      auditId: 'server-response-time',
      description: 'Server responded slowly.',
      value: '8.2 s',
    };

    expect(finding.category).toBe('performance');
    expect(finding.title).toBe('Slow server response time (TTFB)');
    expect(finding.severity).toBe('critical');
    expect(finding.auditId).toBe('server-response-time');
    expect(finding.description).toBe('Server responded slowly.');
    expect(finding.value).toBe('8.2 s');
  });

  it('should create a valid Finding without optional fields', () => {
    const finding: Finding = {
      category: 'seo',
      title: 'Missing meta description',
      severity: 'warning',
    };

    expect(finding.category).toBe('seo');
    expect(finding.title).toBe('Missing meta description');
    expect(finding.severity).toBe('warning');
    expect(finding.auditId).toBeUndefined();
    expect(finding.description).toBeUndefined();
    expect(finding.value).toBeUndefined();
  });

  it('should support various category strings', () => {
    const categories = [
      'performance',
      'accessibility',
      'seo',
      'bestPractices',
      'technology',
      'custom-category',
    ];

    categories.forEach((category) => {
      const finding: Finding = {
        category,
        title: 'Test finding',
        severity: 'info',
      };
      expect(finding.category).toBe(category);
    });
  });
});

describe('CategoryScore', () => {
  it('should create a CategoryScore with max boundary value', () => {
    const score: CategoryScore = {
      name: 'performance',
      score: 100,
    };

    expect(score.name).toBe('performance');
    expect(score.score).toBe(100);
  });

  it('should create a CategoryScore with min boundary value', () => {
    const score: CategoryScore = {
      name: 'accessibility',
      score: 0,
    };

    expect(score.name).toBe('accessibility');
    expect(score.score).toBe(0);
  });

  it('should create a CategoryScore with mid value', () => {
    const score: CategoryScore = {
      name: 'seo',
      score: 50,
    };

    expect(score.score).toBe(50);
  });

  it('should handle decimal scores', () => {
    const score: CategoryScore = {
      name: 'bestPractices',
      score: 97.5,
    };

    expect(score.score).toBe(97.5);
  });
});

describe('DetectedTechnology', () => {
  it('should create a valid DetectedTechnology with version', () => {
    const tech: DetectedTechnology = {
      name: 'React',
      category: 'framework',
      confidence: 0.99,
      version: '18.2.0',
    };

    expect(tech.name).toBe('React');
    expect(tech.category).toBe('framework');
    expect(tech.confidence).toBe(0.99);
    expect(tech.version).toBe('18.2.0');
  });

  it('should create a valid DetectedTechnology without version', () => {
    const tech: DetectedTechnology = {
      name: 'WordPress',
      category: 'cms',
      confidence: 0.85,
    };

    expect(tech.name).toBe('WordPress');
    expect(tech.category).toBe('cms');
    expect(tech.confidence).toBe(0.85);
    expect(tech.version).toBeUndefined();
  });

  it('should accept all valid categories', () => {
    const categories = ['cms', 'hosting', 'analytics', 'framework'] as const;

    categories.forEach((category) => {
      const tech: DetectedTechnology = {
        name: 'Test',
        category,
        confidence: 0.5,
      };
      expect(tech.category).toBe(category);
    });
  });

  it('should handle confidence boundary values', () => {
    const minConfidence: DetectedTechnology = {
      name: 'Unknown',
      category: 'analytics',
      confidence: 0,
    };
    expect(minConfidence.confidence).toBe(0);

    const maxConfidence: DetectedTechnology = {
      name: 'Certain',
      category: 'hosting',
      confidence: 1,
    };
    expect(maxConfidence.confidence).toBe(1);
  });
});

describe('AutomationOpportunity', () => {
  it('should create a valid AutomationOpportunity', () => {
    const opportunity: AutomationOpportunity = {
      title: 'Automate image optimization',
      description: 'Use WebP format for all images to reduce page load time.',
      impact: 'high',
      effort: 'low',
      category: 'performance',
    };

    expect(opportunity.title).toBe('Automate image optimization');
    expect(opportunity.description).toBe('Use WebP format for all images to reduce page load time.');
    expect(opportunity.impact).toBe('high');
    expect(opportunity.effort).toBe('low');
    expect(opportunity.category).toBe('performance');
  });

  it('should accept all valid impact values', () => {
    const impacts = ['high', 'medium', 'low'] as const;

    impacts.forEach((impact) => {
      const opportunity: AutomationOpportunity = {
        title: 'Test',
        description: 'Test',
        impact,
        effort: 'medium',
        category: 'test',
      };
      expect(opportunity.impact).toBe(impact);
    });
  });

  it('should accept all valid effort values', () => {
    const efforts = ['low', 'medium', 'high'] as const;

    efforts.forEach((effort) => {
      const opportunity: AutomationOpportunity = {
        title: 'Test',
        description: 'Test',
        impact: 'medium',
        effort,
        category: 'test',
      };
      expect(opportunity.effort).toBe(effort);
    });
  });
});

describe('AnalysisResult', () => {
  it('should create a full AnalysisResult with all optional fields', () => {
    const result: AnalysisResult = {
      id: 'analysis-123',
      url: 'https://example.com',
      overallScore: 72,
      categories: [
        { name: 'performance', score: 65 },
        { name: 'accessibility', score: 88 },
        { name: 'seo', score: 70 },
        { name: 'bestPractices', score: 60 },
      ],
      technologies: [
        { name: 'Next.js', category: 'framework', confidence: 0.95, version: '14.0.0' },
        { name: 'Vercel', category: 'hosting', confidence: 0.9 },
      ],
      findings: [
        {
          category: 'performance',
          title: 'Large image files detected',
          severity: 'warning',
          description: 'Images are not optimized.',
        },
        {
          category: 'seo',
          title: 'Missing canonical tag',
          severity: 'critical',
        },
      ],
      opportunities: [
        {
          title: 'Optimize images',
          description: 'Compress and convert images to WebP.',
          impact: 'high',
          effort: 'low',
          category: 'performance',
        },
      ],
      analyzedAt: '2025-01-15T10:30:00Z',
      pdfBase64: 'JVBERi0xLjQK...',
    };

    expect(result.id).toBe('analysis-123');
    expect(result.url).toBe('https://example.com');
    expect(result.overallScore).toBe(72);
    expect(result.categories).toHaveLength(4);
    expect(result.technologies).toHaveLength(2);
    expect(result.findings).toHaveLength(2);
    expect(result.opportunities).toHaveLength(1);
    expect(result.analyzedAt).toBe('2025-01-15T10:30:00Z');
    expect(result.pdfBase64).toBe('JVBERi0xLjQK...');
  });

  it('should create an AnalysisResult without optional fields', () => {
    const result: AnalysisResult = {
      url: 'https://example.com',
      overallScore: 50,
      categories: [],
      technologies: [],
      findings: [],
      opportunities: [],
      analyzedAt: '2025-01-15T10:30:00Z',
    };

    expect(result.id).toBeUndefined();
    expect(result.pdfBase64).toBeUndefined();
    expect(result.url).toBe('https://example.com');
    expect(result.overallScore).toBe(50);
    expect(result.categories).toEqual([]);
    expect(result.technologies).toEqual([]);
    expect(result.findings).toEqual([]);
    expect(result.opportunities).toEqual([]);
  });

  it('should handle overallScore boundary values', () => {
    const minResult: AnalysisResult = {
      url: 'https://example.com',
      overallScore: 0,
      categories: [],
      technologies: [],
      findings: [],
      opportunities: [],
      analyzedAt: '2025-01-15T10:30:00Z',
    };
    expect(minResult.overallScore).toBe(0);

    const maxResult: AnalysisResult = {
      url: 'https://example.com',
      overallScore: 100,
      categories: [],
      technologies: [],
      findings: [],
      opportunities: [],
      analyzedAt: '2025-01-15T10:30:00Z',
    };
    expect(maxResult.overallScore).toBe(100);
  });

  it('should handle an AnalysisResult with many findings across categories', () => {
    const findings: Finding[] = [
      { category: 'performance', title: 'F1', severity: 'critical' },
      { category: 'performance', title: 'F2', severity: 'warning' },
      { category: 'accessibility', title: 'F3', severity: 'info' },
      { category: 'seo', title: 'F4', severity: 'critical' },
      { category: 'bestPractices', title: 'F5', severity: 'warning' },
    ];

    const result: AnalysisResult = {
      url: 'https://example.com',
      overallScore: 30,
      categories: [
        { name: 'performance', score: 25 },
        { name: 'accessibility', score: 40 },
        { name: 'seo', score: 20 },
        { name: 'bestPractices', score: 35 },
      ],
      technologies: [],
      findings,
      opportunities: [],
      analyzedAt: '2025-01-15T10:30:00Z',
    };

    expect(result.findings).toHaveLength(5);
    const criticalFindings = result.findings.filter((f) => f.severity === 'critical');
    expect(criticalFindings).toHaveLength(2);
  });
});

describe('AnalyzerInput', () => {
  it('should create a valid AnalyzerInput', () => {
    const input: AnalyzerInput = {
      leadId: 'lead-abc-123',
      url: 'https://example.com',
    };

    expect(input.leadId).toBe('lead-abc-123');
    expect(input.url).toBe('https://example.com');
  });

  it('should handle URLs with paths', () => {
    const input: AnalyzerInput = {
      leadId: 'lead-456',
      url: 'https://example.com/products/category/item',
    };

    expect(input.url).toBe('https://example.com/products/category/item');
  });

  it('should handle URLs with query parameters', () => {
    const input: AnalyzerInput = {
      leadId: 'lead-789',
      url: 'https://example.com/page?ref=analytics&lang=en',
    };

    expect(input.url).toContain('?ref=analytics&lang=en');
  });

  it('should handle http URLs', () => {
    const input: AnalyzerInput = {
      leadId: 'lead-000',
      url: 'http://insecure-site.com',
    };

    expect(input.url).toBe('http://insecure-site.com');
  });
});

describe('Type integration and structural validation', () => {
  it('should allow constructing a complete analysis pipeline input and output', () => {
    const input: AnalyzerInput = {
      leadId: 'lead-integration',
      url: 'https://test.com',
    };

    const finding: Finding = {
      category: 'performance',
      title: 'Render-blocking resources',
      severity: 'warning',
      auditId: 'render-blocking-resources',
      description: 'Resources are blocking first paint.',
      value: '3 resources',
    };

    const categoryScore: CategoryScore = {
      name: 'performance',
      score: 78,
    };

    const tech: DetectedTechnology = {
      name: 'Google Analytics',
      category: 'analytics',
      confidence: 0.92,
      version: '4',
    };

    const opportunity: AutomationOpportunity = {
      title: 'Defer non-critical JavaScript',
      description: 'Defer loading of analytics scripts.',
      impact: 'medium',
      effort: 'low',
      category: 'performance',
    };

    const result: AnalysisResult = {
      id: 'result-integration',
      url: input.url,
      overallScore: categoryScore.score,
      categories: [categoryScore],
      technologies: [tech],
      findings: [finding],
      opportunities: [opportunity],
      analyzedAt: new Date().toISOString(),
      pdfBase64: 'base64string',
    };

    expect(result.url).toBe(input.url);
    expect(result.leadId).toBeUndefined();
    expect(result.categories[0].score).toBe(78);
    expect(result.technologies[0].name).toBe('Google Analytics');
    expect(result.findings[0].severity).toBe('warning');
    expect(result.opportunities[0].impact).toBe('medium');
  });

  it('should support multiple findings with different severities', () => {
    const severities: Severity[] = ['critical', 'warning', 'info'];

    const findings: Finding[] = severities.map((severity, index) => ({
      category: 'test',
      title: `Finding ${index}`,
      severity,
    }));

    expect(findings).toHaveLength(3);
    expect(findings[0].severity).toBe('critical');
    expect(findings[1].severity).toBe('warning');
    expect(findings[2].severity).toBe('info');
  });

  it('should support an AnalysisResult with conflicting impact/effort combos', () => {
    const opportunities: AutomationOpportunity[] = [
      { title: 'Quick win', description: 'Low effort, high impact', impact: 'high', effort: 'low', category: 'perf' },
      { title: 'Major project', description: 'High effort, high impact', impact: 'high', effort: 'high', category: 'perf' },
      { title: 'Nice to have', description: 'Low effort, low impact', impact: 'low', effort: 'low', category: 'perf' },
      { title: 'Not worth it', description: 'High effort, low impact', impact: 'low', effort: 'high', category: 'perf' },
    ];

    const result: AnalysisResult = {
      url: 'https://example.com',
      overallScore: 50,
      categories: [],
      technologies: [],
      findings: [],
      opportunities,
      analyzedAt: '2025-01-15T10:30:00Z',
    };

    expect(result.opportunities).toHaveLength(4);
    expect(result.opportunities[0].impact).toBe('high');
    expect(result.opportunities[0].effort).toBe('low');
    expect(result.opportunities[3].impact).toBe('low');
    expect(result.opportunities[3].effort).toBe('high');
  });

  it('should handle technologies with various confidence levels', () => {
    const technologies: DetectedTechnology[] = [
      { name: 'Definite Tech', category: 'framework', confidence: 1.0, version: '1.0.0' },
      { name: 'Likely Tech', category: 'cms', confidence: 0.75 },
      { name: 'Uncertain Tech', category: 'analytics', confidence: 0.1 },
      { name: 'Zero Conf', category: 'hosting', confidence: 0 },
    ];

    expect(technologies[0].confidence).toBe(1.0);
    expect(technologies[2].confidence).toBe(0.1);
    expect(technologies[3].confidence).toBe(0);
  });

  it('should handle AnalysisResult with empty analyzedAt as empty string', () => {
    const result: AnalysisResult = {
      url: 'https://example.com',
      overallScore: 100,
      categories: [{ name: 'performance', score: 100 }],
      technologies: [],
      findings: [],
      opportunities: [],
      analyzedAt: '',
    };

    expect(result.analyzedAt).toBe('');
  });

  it('should handle findings with numeric-like value strings', () => {
    const finding: Finding = {
      category: 'performance',
      title: 'First Contentful Paint',
      severity: 'warning',
      value: '3.4 s',
    };

    expect(finding.value).toBe('3.4 s');
  });

  it('should handle a minimal AnalysisResult with only required fields', () => {
    const result: AnalysisResult = {
      url: 'https://example.com',
      overallScore: 0,
      categories: [],
      technologies: [],
      findings: [],
      opportunities: [],
      analyzedAt: new Date().toISOString(),
    };

    expect(Object.keys(result)).toContain('url');
    expect(Object.keys(result)).toContain('overallScore');
    expect(Object.keys(result)).toContain('categories');
    expect(Object.keys(result)).toContain('technologies');
    expect(Object.keys(result)).toContain('findings');
    expect(Object.keys(result)).toContain('opportunities');
    expect(Object.keys(result)).toContain('analyzedAt');
  });

  it('should ensure AnalyzerInput has exactly the required fields', () => {
    const input: AnalyzerInput = {
      leadId: 'test-lead',
      url: 'https://example.com',
    };

    expect(Object.keys(input)).toEqual(['leadId', 'url']);
  });
});