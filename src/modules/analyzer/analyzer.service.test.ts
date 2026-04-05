import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock external dependencies
vi.mock('../../lib/db/client.js', () => ({
  prisma: {
    lead: {
      update: vi.fn(),
    },
    analysis: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('./audits/lighthouse.js', () => ({
  runLighthouseAudit: vi.fn(),
}));

vi.mock('./audits/tech-detect.js', () => ({
  detectTechnologies: vi.fn(),
}));

vi.mock('./audits/scoring.js', () => ({
  calculateOverallScore: vi.fn(),
  scoreLabel: vi.fn(),
}));

vi.mock('./automation.js', () => ({
  detectOpportunities: vi.fn(),
}));

vi.mock('./report.js', () => ({
  generatePdfReport: vi.fn(),
}));

import { prisma } from '../../lib/db/client.js';
import { runLighthouseAudit } from './audits/lighthouse.js';
import { detectTechnologies } from './audits/tech-detect.js';
import { calculateOverallScore } from './audits/scoring.js';
import { detectOpportunities } from './automation.js';
import { generatePdfReport } from './report.js';
import {
  analyzeWebsite,
  getLeadAnalyses,
  getAnalysis,
  generateReportForAnalysis,
} from './analyzer.service.js';
import type { AnalyzerInput } from './types.js';

describe('analyzer.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2023-01-01T00:00:00Z'));
  });

  describe('analyzeWebsite', () => {
    const input: AnalyzerInput = {
      leadId: 'lead-123',
      url: 'example.com',
    };

    const mockLighthouseResult = {
      categories: { performance: { score: 0.9 } },
      findings: [{ id: 'f1', severity: 'warning', description: 'Slow server' }],
    };

    const mockTechResult = {
      technologies: [{ name: 'React', category: 'framework' }],
      finalUrl: 'https://example.com',
      responseHeaders: { 'content-type': 'text/html' },
    };

    const mockScoreResult = {
      overall: 85,
      categories: [{ name: 'performance', score: 90, label: 'Good' }],
    };

    const mockOpportunities = [
      { title: 'Automate SEO fixes', impact: 'high', description: 'Fix meta tags automatically' },
    ];

    const defaultSetup = () => {
      vi.mocked(runLighthouseAudit).mockResolvedValue(mockLighthouseResult as any);
      vi.mocked(detectTechnologies).mockResolvedValue(mockTechResult as any);
      vi.mocked(calculateOverallScore).mockReturnValue(mockScoreResult as any);
      vi.mocked(detectOpportunities).mockResolvedValue(mockOpportunities as any);
      vi.mocked(prisma.analysis.create).mockResolvedValue({ id: 'analysis-123' } as any);
      vi.mocked(prisma.lead.update).mockResolvedValue({ id: 'lead-123' } as any);
    };

    it('should run the full happy path analysis and persist results', async () => {
      defaultSetup();

      const result = await analyzeWebsite(input);

      // Normalize URL (adds https://)
      expect(runLighthouseAudit).toHaveBeenCalledWith('https://example.com');
      expect(detectTechnologies).toHaveBeenCalledWith('https://example.com');

      // Step 3: Calculate score
      expect(calculateOverallScore).toHaveBeenCalledWith(mockLighthouseResult.categories);
      
      // Step 4: Opportunities
      expect(detectOpportunities).toHaveBeenCalledWith(
        mockLighthouseResult.findings,
        mockTechResult.technologies,
        'https://example.com',
      );

      // Step 5: DB interactions
      expect(prisma.lead.update).toHaveBeenCalledWith({
        where: { id: 'lead-123' },
        data: { status: 'analyzing' },
      });
      expect(prisma.analysis.create).toHaveBeenCalledWith({
        data: {
          leadId: 'lead-123',
          type: 'website',
          score: 85,
          findings: {
            categories: mockScoreResult.categories,
            findings: mockLighthouseResult.findings,
            technologies: mockTechResult.technologies,
            finalUrl: mockTechResult.finalUrl,
            responseHeaders: mockTechResult.responseHeaders,
          },
          opportunities: mockOpportunities,
        },
      });
      expect(prisma.lead.update).toHaveBeenCalledWith({
        where: { id: 'lead-123' },
        data: { status: 'analyzed' },
      });

      // Result structure
      expect(result).toMatchObject({
        id: 'analysis-123',
        url: 'https://example.com',
        overallScore: 85,
        categories: mockScoreResult.categories,
        technologies: mockTechResult.technologies,
        opportunities: mockOpportunities,
        findings: mockLighthouseResult.findings,
        analyzedAt: new Date().toISOString(),
      });
    });

    it('should normalize URLs missing https://', async () => {
      defaultSetup();
      await analyzeWebsite({ leadId: '1', url: 'http://test.com' });
      expect(runLighthouseAudit).toHaveBeenCalledWith('http://test.com');
    });

    it('should strip whitespace from URL and add protocol', async () => {
      defaultSetup();
      await analyzeWebsite({ leadId: '1', url: '  test.com  ' });
      expect(runLighthouseAudit).toHaveBeenCalledWith('https://test.com');
    });

    it('should generate a PDF report if includePdf option is true', async () => {
      defaultSetup();
      const fakePdfBuffer = Buffer.from('fake-pdf-bytes');
      vi.mocked(generatePdfReport).mockResolvedValue(fakePdfBuffer);

      const result = await analyzeWebsite(input, {
        includePdf: true,
        businessName: 'Test Business',
      });

      expect(generatePdfReport).toHaveBeenCalledWith(
        expect.objectContaining({ url: 'https://example.com' }),
        'Test Business',
      );

      expect((result as any).pdfBase64).toBe(fakePdfBuffer.toString('base64'));
    });

    it('should not generate a PDF report if includePdf is false or omitted', async () => {
      defaultSetup();
      await analyzeWebsite(input);
      expect(generatePdfReport).not.toHaveBeenCalled();
    });

    it('should revert lead status to "discovered" if an error occurs during the pipeline', async () => {
      const pipelineError = new Error('Lighthouse timeout');
      vi.mocked(runLighthouseAudit).mockRejectedValue(pipelineError);
      vi.mocked(prisma.lead.update).mockResolvedValue({ id: 'lead-123' } as any);

      await expect(analyzeWebsite(input)).rejects.toThrow('Lighthouse timeout');

      // First call is 'analyzing', second call is revert to 'discovered'
      expect(prisma.lead.update).toHaveBeenCalledTimes(2);
      expect(prisma.lead.update).toHaveBeenLastCalledWith({
        where: { id: 'lead-123' },
        data: { status: 'discovered' },
      });

      // Should not create an analysis record
      expect(prisma.analysis.create).not.toHaveBeenCalled();
    });

    it('should handle and throw when db prisma.lead.update fails', async () => {
      const dbError = new Error('DB Connection Lost');
      vi.mocked(runLighthouseAudit).mockResolvedValue(mockLighthouseResult as any);
      vi.mocked(detectTechnologies).mockResolvedValue(mockTechResult as any);
      vi.mocked(calculateOverallScore).mockReturnValue(mockScoreResult as any);
      vi.mocked(detectOpportunities).mockResolvedValue(mockOpportunities as any);
      
      vi.mocked(prisma.analysis.create).mockRejectedValue(dbError);
      vi.mocked(prisma.lead.update).mockResolvedValue({ id: 'lead-123' } as any);

      await expect(analyzeWebsite(input)).rejects.toThrow('DB Connection Lost');

      expect(prisma.lead.update).toHaveBeenCalledTimes(2);
      expect(prisma.lead.update).toHaveBeenLastCalledWith({
        where: { id: 'lead-123' },
        data: { status: 'discovered' },
      });
    });
  });

  describe('getLeadAnalyses', () => {
    it('should fetch analyses ordered by analyzedAt descending', async () => {
      const mockAnalyses = [{ id: '1' }, { id: '2' }];
      vi.mocked(prisma.analysis.findMany).mockResolvedValue(mockAnalyses as any);

      const result = await getLeadAnalyses('lead-123');

      expect(result).toEqual(mockAnalyses);
      expect(prisma.analysis.findMany).toHaveBeenCalledWith({
        where: { leadId: 'lead-123' },
        orderBy: { analyzedAt: 'desc' },
      });
    });

    it('should return an empty array if no analyses exist for the lead', async () => {
      vi.mocked(prisma.analysis.findMany).mockResolvedValue([]);

      const result = await getLeadAnalyses('lead-nonexistent');

      expect(result).toEqual([]);
    });
  });

  describe('getAnalysis', () => {
    it('should fetch a single analysis by ID and include the associated lead', async () => {
      const mockAnalysis = { id: 'analysis-123', lead: { id: 'lead-123' } };
      vi.mocked(prisma.analysis.findUnique).mockResolvedValue(mockAnalysis as any);

      const result = await getAnalysis('analysis-123');

      expect(result).toEqual(mockAnalysis);
      expect(prisma.analysis.findUnique).toHaveBeenCalledWith({
        where: { id: 'analysis-123' },
        include: { lead: true },
      });
    });

    it('should return null if the analysis does not exist', async () => {
      vi.mocked(prisma.analysis.findUnique).mockResolvedValue(null);

      const result = await getAnalysis('non-existent-id');

      expect(result).toBeNull();
    });
  });

  describe('generateReportForAnalysis', () => {
    const mockAnalysisRecord = {
      id: 'analysis-123',
      score: 75,
      analyzedAt: new Date('2023-01-01T12:00:00Z'),
      findings: {
        categories: [{ name: 'seo', score: 70, label: 'Average' }],
        findings: [{ id: 'f2', severity: 'error', description: 'Missing H1' }],
        technologies: [{ name: 'Next.js', category: 'framework' }],
      },
      opportunities: [
        { title: 'Add meta tags', impact: 'medium', description: 'Improve SEO' },
      ],
      lead: {
        website: 'https://example.com',
        businessName: 'Example Corp',
      },
    };

    it('should fetch the analysis, map it properly, and generate a PDF report', async () => {
      vi.mocked(prisma.analysis.findUnique).mockResolvedValue(mockAnalysisRecord as any);
      const fakeBuffer = Buffer.from('pdf-data');
      vi.mocked(generatePdfReport).mockResolvedValue(fakeBuffer);

      const result = await generateReportForAnalysis('analysis-123');

      // Verify DB fetch
      expect(prisma.analysis.findUnique).toHaveBeenCalledWith({
        where: { id: 'analysis-123' },
        include: { lead: true },
      });

      // Verify mapping to AnalysisResult
      const expectedAnalysisResult = {
        url: 'https://example.com',
        overallScore: 75,
        categories: [{ name: 'seo', score: 70, label: 'Average' }],
        technologies: [{ name: 'Next.js', category: 'framework' }],
        opportunities: [
          { title: 'Add meta tags', impact: 'medium', description: 'Improve SEO' },
        ],
        findings: [{ id: 'f2', severity: 'error', description: 'Missing H1' }],
        analyzedAt: '2023-01-01T12:00:00.000Z',
      };

      expect(generatePdfReport).toHaveBeenCalledWith(expectedAnalysisResult, 'Example Corp');
      expect(result).toEqual(fakeBuffer);
    });

    it('should handle missing optional fields with safe fallbacks', async () => {
      const minimalRecord = {
        id: 'analysis-min',
        score: null, // explicitly null
        analyzedAt: new Date('2023-01-01T12:00:00Z'),
        findings: {}, // empty object
        opportunities: null, // explicitly null
        lead: {
          website: null, // null website
          businessName: 'Unknown Biz',
        },
      };

      vi.mocked(prisma.analysis.findUnique).mockResolvedValue(minimalRecord as any);
      vi.mocked(generatePdfReport).mockResolvedValue(Buffer.from(''));

      await generateReportForAnalysis('analysis-min');

      expect(generatePdfReport).toHaveBeenCalledWith(
        {
          url: '',
          overallScore: 0,
          categories: [],
          technologies: [],
          opportunities: [],
          findings: [],
          analyzedAt: '2023-01-01T12:00:00.000Z',
        },
        'Unknown Biz',
      );
    });

    it('should throw an error if the analysis is not found in the database', async () => {
      vi.mocked(prisma.analysis.findUnique).mockResolvedValue(null);

      await expect(generateReportForAnalysis('non-existent-id')).rejects.toThrow(
        'Analysis not found',
      );

      expect(generatePdfReport).not.toHaveBeenCalled();
    });
  });
});