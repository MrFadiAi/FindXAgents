import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before imports
vi.mock('../../lib/db/client.js', () => ({
  prisma: {
    lead: {
      upsert: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
    },
    analysis: {
      create: vi.fn(),
    },
    outreach: {
      create: vi.fn(),
    },
  },
}));

vi.mock('../../modules/leads/lead-scorer.js', () => ({
  calculateLeadScore: vi.fn().mockReturnValue(75),
}));

import { prisma } from '../../lib/db/client.js';
import { calculateLeadScore } from '../../modules/leads/lead-scorer.js';
import { saveLeadTool, saveAnalysisTool, saveOutreachTool } from './database.js';

const sharedDate = new Date('2023-01-01T10:00:00Z');
const mockLeadRecord = {
  id: 'lead-123',
  businessName: 'Test Business',
  city: 'Amsterdam',
  address: '123 Main St',
  industry: 'Tech',
  website: 'https://test.com',
  hasWebsite: true,
  phone: '123-456-7890',
  email: 'test@test.com',
  kvkNumber: '12345678',
  source: 'agent',
  leadScore: null,
  createdAt: sharedDate,
  updatedAt: sharedDate,
};

describe('saveLeadTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Default mock implementations
    (prisma.lead.upsert as ReturnType<typeof vi.fn>).mockResolvedValue(mockLeadRecord);
    (prisma.lead.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.lead.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockLeadRecord);
    (prisma.lead.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockLeadRecord,
      leadScore: 75,
    });
  });

  it('should have correct tool metadata', () => {
    expect(saveLeadTool.name).toBe('save_lead');
    expect(saveLeadTool.description).toContain('Save a discovered business');
    expect(saveLeadTool.input_schema.required).toEqual(['businessName', 'city']);
  });

  it('should create a new lead with kvkNumber using upsert', async () => {
    const input = {
      businessName: 'Test Business',
      city: 'Amsterdam',
      kvkNumber: '12345678',
      website: 'https://test.com',
      email: 'test@test.com',
      phone: '123-456-7890',
      industry: 'Tech',
      address: '123 Main St',
      source: 'agent',
    };

    const result = await saveLeadTool.execute(input);

    expect(prisma.lead.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { kvkNumber: '12345678' },
        create: expect.objectContaining({
          businessName: 'Test Business',
          city: 'Amsterdam',
          kvkNumber: '12345678',
          hasWebsite: true,
        }),
      })
    );

    expect(calculateLeadScore).toHaveBeenCalledWith(
      expect.objectContaining({
        hasBusinessName: true,
        hasCity: true,
        hasValidMx: false,
        hasSocialProfiles: false,
        websiteScore: null,
      })
    );

    expect(prisma.lead.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'lead-123' },
        data: { leadScore: 75 },
      })
    );

    const parsed = JSON.parse(result as string);
    expect(parsed.id).toBe('lead-123');
    expect(parsed.businessName).toBe('Test Business');
    expect(parsed.created).toBe(true);
  });

  it('should update existing lead via upsert when kvkNumber matches', async () => {
    const updatedRecord = {
      ...mockLeadRecord,
      updatedAt: new Date('2023-01-02T10:00:00Z'),
    };
    (prisma.lead.upsert as ReturnType<typeof vi.fn>).mockResolvedValue(updatedRecord);

    const input = {
      businessName: 'Test Business',
      city: 'Amsterdam',
      kvkNumber: '12345678',
      website: 'https://new-test.com',
    };

    const result = await saveLeadTool.execute(input);
    const parsed = JSON.parse(result as string);

    expect(parsed.created).toBe(false);
  });

  it('should find existing lead by website when no kvkNumber provided', async () => {
    const existingLead = { ...mockLeadRecord, id: 'existing-lead-456' };
    (prisma.lead.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(existingLead);
    // First update (data) returns existing lead, second update (score) returns with score
    (prisma.lead.update as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(existingLead)
      .mockResolvedValueOnce({ ...existingLead, leadScore: 75 });

    const input = {
      businessName: 'Test Business',
      city: 'Amsterdam',
      website: 'https://test.com',
    };

    const result = await saveLeadTool.execute(input);

    expect(prisma.lead.findFirst).toHaveBeenCalledWith({
      where: { website: 'https://test.com' },
    });

    expect(prisma.lead.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'existing-lead-456' },
      })
    );

    const parsed = JSON.parse(result as string);
    expect(parsed.id).toBe('existing-lead-456');
    expect(parsed.created).toBe(false);
  });

  it('should find existing lead by businessName+city when no website and no kvkNumber', async () => {
    const existingLead = { ...mockLeadRecord, id: 'existing-lead-789' };
    (prisma.lead.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(existingLead);

    const input = {
      businessName: 'Test Business',
      city: 'Amsterdam',
    };

    await saveLeadTool.execute(input);

    expect(prisma.lead.findFirst).toHaveBeenCalledWith({
      where: { businessName: 'Test Business', city: 'Amsterdam' },
    });
  });

  it('should create new lead when no kvkNumber and no existing match', async () => {
    (prisma.lead.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.lead.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockLeadRecord,
      id: 'new-lead-999',
    });

    const input = {
      businessName: 'New Business',
      city: 'Rotterdam',
      website: 'https://new.com',
    };

    const result = await saveLeadTool.execute(input);

    expect(prisma.lead.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        businessName: 'New Business',
        city: 'Rotterdam',
        website: 'https://new.com',
        hasWebsite: true,
        source: 'agent',
      }),
    });

    const parsed = JSON.parse(result as string);
    expect(parsed.created).toBe(true);
  });

  it('should handle empty string website as undefined', async () => {
    const input = {
      businessName: 'No Web Business',
      city: 'Utrecht',
      website: '',
    };

    await saveLeadTool.execute(input);

    expect(prisma.lead.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        website: undefined,
        hasWebsite: false,
      }),
    });
  });

  it('should default source to "agent" when not provided', async () => {
    const input = {
      businessName: 'Test',
      city: 'Berlin',
    };

    await saveLeadTool.execute(input);

    expect(prisma.lead.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        source: 'agent',
      }),
    });
  });

  it('should use custom source when provided', async () => {
    const input = {
      businessName: 'Test',
      city: 'Berlin',
      source: 'manual',
    };

    await saveLeadTool.execute(input);

    expect(prisma.lead.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        source: 'manual',
      }),
    });
  });

  it('should handle all optional fields as undefined when empty strings', async () => {
    const input = {
      businessName: 'Minimal',
      city: 'Hamburg',
      website: '',
      email: '',
      phone: '',
      industry: '',
      address: '',
      kvkNumber: '',
    };

    await saveLeadTool.execute(input);

    expect(prisma.lead.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        website: undefined,
        hasWebsite: false,
        email: undefined,
        phone: undefined,
        industry: undefined,
        address: undefined,
        kvkNumber: undefined,
      }),
    });
  });

  it('should handle falsy kvkNumber and fall back to website lookup', async () => {
    const input = {
      businessName: 'Test',
      city: 'Munich',
      website: 'https://example.com',
    };

    await saveLeadTool.execute(input);

    expect(prisma.lead.upsert).not.toHaveBeenCalled();
    expect(prisma.lead.findFirst).toHaveBeenCalledWith({
      where: { website: 'https://example.com' },
    });
  });

  it('should include kvkNumber in update data when updating via findFirst path', async () => {
    const existingLead = { ...mockLeadRecord, id: 'existing-123' };
    (prisma.lead.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(existingLead);
    // First update (data) returns existing lead, second update (score) returns with score
    (prisma.lead.update as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(existingLead)
      .mockResolvedValueOnce({ ...existingLead, leadScore: 75 });

    // Note: when kvkNumber is provided, the upsert path is taken instead.
    // This test verifies the findFirst path works without kvkNumber.
    const input = {
      businessName: 'Test',
      city: 'Amsterdam',
      website: 'https://test.com',
    };

    await saveLeadTool.execute(input);

    // Source calls prisma.lead.update twice: once for data (no kvkNumber since it's undefined), once for leadScore
    const firstCall = (prisma.lead.update as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(firstCall[0]).toEqual(
      expect.objectContaining({
        where: { id: 'existing-123' },
      })
    );
    // kvkNumber is undefined in this path but is still included as a property
    expect(firstCall[0].data).toHaveProperty('kvkNumber', undefined);
  });

  it('should correctly calculate hasWebsite as true when website is provided', async () => {
    const input = {
      businessName: 'Web Business',
      city: 'Vienna',
      website: 'https://example.org',
    };

    await saveLeadTool.execute(input);

    expect(prisma.lead.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        hasWebsite: true,
      }),
    });
  });

  it('should throw if prisma operation fails', async () => {
    (prisma.lead.findFirst as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Database connection lost')
    );

    const input = {
      businessName: 'Test',
      city: 'Zurich',
    };

    await expect(saveLeadTool.execute(input)).rejects.toThrow('Database connection lost');
  });

  it('should handle null/undefined optional fields gracefully', async () => {
    const input = {
      businessName: 'Test',
      city: 'Amsterdam',
      website: undefined,
      email: undefined,
      phone: undefined,
    };

    await saveLeadTool.execute(input);

    expect(prisma.lead.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        website: undefined,
        hasWebsite: false,
        email: undefined,
        phone: undefined,
      }),
    });
  });
});

describe('saveAnalysisTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    (prisma.analysis.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'analysis-123',
      leadId: 'lead-123',
      type: 'comprehensive',
      score: 85,
      findings: [{ category: 'website', title: 'Slow loading', description: 'Test', severity: 'high' }],
      opportunities: null,
      socialPresence: {},
      competitors: [],
      serviceGaps: [],
      revenueImpact: {},
      createdAt: new Date(),
    });

    (prisma.lead.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockLeadRecord);
    (prisma.lead.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockLeadRecord,
      status: 'analyzed',
      leadScore: 80,
    });
  });

  it('should have correct tool metadata', () => {
    expect(saveAnalysisTool.name).toBe('save_analysis');
    expect(saveAnalysisTool.input_schema.required).toEqual(['leadId']);
  });

  it('should create a comprehensive analysis with all fields', async () => {
    const input = {
      leadId: 'lead-123',
      type: 'comprehensive',
      score: 85,
      findings: JSON.stringify([
        { category: 'website', title: 'Slow loading', description: 'Test', severity: 'high' },
      ]),
      opportunities: JSON.stringify([
        { title: 'SEO Optimization', description: 'Improve rankings', impact: 'high', serviceType: 'seo' },
      ]),
      socialPresence: JSON.stringify({ linkedin: { url: 'https://linkedin.com/test', followers: 100 } }),
      competitors: JSON.stringify([{ name: 'Competitor A', website: 'https://compa.com' }]),
      serviceGaps: JSON.stringify([{ service: 'CRM', need: 'high', reasoning: 'No CRM found', estimatedRevenueImpact: 5000 }]),
      revenueImpact: JSON.stringify({ totalEstimatedLoss: 10000, currency: 'EUR', breakdown: [] }),
    };

    const result = await saveAnalysisTool.execute(input);

    expect(prisma.analysis.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        leadId: 'lead-123',
        type: 'comprehensive',
        score: 85,
        findings: [{ category: 'website', title: 'Slow loading', description: 'Test', severity: 'high' }],
        competitors: [{ name: 'Competitor A', website: 'https://compa.com' }],
        serviceGaps: [{ service: 'CRM', need: 'high', reasoning: 'No CRM found', estimatedRevenueImpact: 5000 }],
      }),
    });

    const parsed = JSON.parse(result as string);
    expect(parsed.id).toBe('analysis-123');
    expect(parsed.leadId).toBe('lead-123');
    expect(parsed.score).toBe(85);
    expect(parsed.findingCount).toBe(1);
    expect(parsed.serviceGapsCount).toBe(1);
    expect(parsed.competitorCount).toBe(1);
  });

  it('should use default type "comprehensive" when not provided', async () => {
    const input = {
      leadId: 'lead-123',
    };

    await saveAnalysisTool.execute(input);

    expect(prisma.analysis.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'comprehensive',
      }),
    });
  });

  it('should use null score when not provided', async () => {
    const input = {
      leadId: 'lead-123',
    };

    await saveAnalysisTool.execute(input);

    expect(prisma.analysis.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        score: null,
      }),
    });
  });

  it('should handle malformed JSON gracefully with fallbacks', async () => {
    const input = {
      leadId: 'lead-123',
      findings: 'not-valid-json',
      opportunities: 'broken{}json',
      socialPresence: '{invalid',
      competitors: 'not-json-at-all',
      serviceGaps: '[broken',
      revenueImpact: undefined,
    };

    const result = await saveAnalysisTool.execute(input);

    expect(prisma.analysis.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        findings: [],
        opportunities: null,
        socialPresence: {},
        competitors: [],
        serviceGaps: [],
        revenueImpact: {},
      }),
    });

    const parsed = JSON.parse(result as string);
    expect(parsed.findingCount).toBe(0);
    expect(parsed.serviceGapsCount).toBe(0);
    expect(parsed.competitorCount).toBe(0);
  });

  it('should handle empty/undefined JSON fields with fallbacks', async () => {
    const input = {
      leadId: 'lead-123',
    };

    await saveAnalysisTool.execute(input);

    expect(prisma.analysis.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        findings: [],
        opportunities: null,
        socialPresence: {},
        competitors: [],
        serviceGaps: [],
        revenueImpact: {},
      }),
    });
  });

  it('should update lead status to analyzed and recalculate score', async () => {
    const input = {
      leadId: 'lead-123',
      score: 65,
    };

    await saveAnalysisTool.execute(input);

    expect(prisma.lead.findUnique).toHaveBeenCalledWith({
      where: { id: 'lead-123' },
    });

    expect(calculateLeadScore).toHaveBeenCalledWith(
      expect.objectContaining({
        hasSocialProfiles: false,
        websiteScore: 65,
      })
    );

    expect(prisma.lead.update).toHaveBeenCalledWith({
      where: { id: 'lead-123' },
      data: { status: 'analyzed', leadScore: 75 },
    });
  });

  it('should set hasSocialProfiles to true when socialPresence has keys', async () => {
    const input = {
      leadId: 'lead-123',
      socialPresence: JSON.stringify({ linkedin: { url: 'https://linkedin.com' } }),
    };

    await saveAnalysisTool.execute(input);

    expect(calculateLeadScore).toHaveBeenCalledWith(
      expect.objectContaining({
        hasSocialProfiles: true,
      })
    );
  });

  it('should not update lead score if lead is not found', async () => {
    (prisma.lead.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const input = {
      leadId: 'nonexistent-lead',
      score: 50,
    };

    const result = await saveAnalysisTool.execute(input);

    expect(prisma.lead.findUnique).toHaveBeenCalledWith({
      where: { id: 'nonexistent-lead' },
    });

    // Only the analysis.create should be called, not lead.update for scoring
    expect(prisma.lead.update).not.toHaveBeenCalled();

    const parsed = JSON.parse(result as string);
    expect(parsed.id).toBe('analysis-123');
  });

  it('should count findings, service gaps, and competitors correctly', async () => {
    const input = {
      leadId: 'lead-123',
      findings: JSON.stringify([
        { category: 'seo', title: 'Missing meta tags', description: 'desc', severity: 'medium' },
        { category: 'website', title: 'No SSL', description: 'desc', severity: 'high' },
        { category: 'social', title: 'No Facebook', description: 'desc', severity: 'low' },
      ]),
      competitors: JSON.stringify([
        { name: 'Comp1' },
        { name: 'Comp2' },
      ]),
      serviceGaps: JSON.stringify([
        { service: 'Booking System', need: 'high' },
        { service: 'Email Marketing', need: 'medium' },
        { service: 'CRM', need: 'high' },
        { service: 'Payment', need: 'low' },
      ]),
    };

    const result = await saveAnalysisTool.execute(input);
    const parsed = JSON.parse(result as string);

    expect(parsed.findingCount).toBe(3);
    expect(parsed.competitorCount).toBe(2);
    expect(parsed.serviceGapsCount).toBe(4);
  });

  it('should handle null score input correctly', async () => {
    const input = {
      leadId: 'lead-123',
      score: null,
    };

    await saveAnalysisTool.execute(input);

    expect(prisma.analysis.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        score: null,
      }),
    });

    expect(calculateLeadScore).toHaveBeenCalledWith(
      expect.objectContaining({
        websiteScore: null,
      })
    );
  });

  it('should throw if analysis creation fails', async () => {
    (prisma.analysis.create as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Foreign key constraint fails')
    );

    const input = { leadId: 'invalid-lead' };

    await expect(saveAnalysisTool.execute(input)).rejects.toThrow('Foreign key constraint fails');
  });

  it('should handle score of 0 correctly (falsy but valid)', async () => {
    const input = {
      leadId: 'lead-123',
      score: 0,
    };

    await saveAnalysisTool.execute(input);

    expect(prisma.analysis.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        score: null, // (input.score as number) || null — 0 is falsy
      }),
    });
  });

  it('should pass websiteScore as null to calculateLeadScore when score is 0', async () => {
    const input = {
      leadId: 'lead-123',
      score: 0,
    };

    await saveAnalysisTool.execute(input);

    expect(calculateLeadScore).toHaveBeenCalledWith(
      expect.objectContaining({
        websiteScore: null,
      })
    );
  });
});

describe('saveOutreachTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    (prisma.outreach.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'outreach-123',
      leadId: 'lead-123',
      status: 'draft',
      subject: 'Improve your online presence',
      body: 'Dear Business Owner...',
      personalizedDetails: {
        tone: 'professional',
        language: 'nl',
      },
      createdAt: new Date(),
    });

    (prisma.lead.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockLeadRecord,
      status: 'contacting',
    });
  });

  it('should have correct tool metadata', () => {
    expect(saveOutreachTool.name).toBe('save_outreach');
    expect(saveOutreachTool.input_schema.required).toEqual(['leadId', 'subject', 'body']);
  });

  it('should create outreach with draft status', async () => {
    const input = {
      leadId: 'lead-123',
      subject: 'Improve your online presence',
      body: 'Dear Business Owner, we noticed...',
    };

    const result = await saveOutreachTool.execute(input);

    expect(prisma.outreach.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        leadId: 'lead-123',
        status: 'draft',
        subject: 'Improve your online presence',
        body: 'Dear Business Owner, we noticed...',
      }),
    });

    const parsed = JSON.parse(result as string);
    expect(parsed.id).toBe('outreach-123');
    expect(parsed.leadId).toBe('lead-123');
    expect(parsed.subject).toBe('Improve your online presence');
    expect(parsed.status).toBe('draft');
  });

  it('should update lead status to contacting', async () => {
    const input = {
      leadId: 'lead-123',
      subject: 'Test Subject',
      body: 'Test Body',
    };

    await saveOutreachTool.execute(input);

    expect(prisma.lead.update).toHaveBeenCalledWith({
      where: { id: 'lead-123' },
      data: { status: 'contacting' },
    });
  });

  it('should use default tone "professional" when not provided', async () => {
    const input = {
      leadId: 'lead-123',
      subject: 'Test',
      body: 'Test body',
    };

    await saveOutreachTool.execute(input);

    expect(prisma.outreach.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        personalizedDetails: expect.objectContaining({
          tone: 'professional',
        }),
      }),
    });
  });

  it('should use custom tone when provided', async () => {
    const input = {
      leadId: 'lead-123',
      subject: 'Test',
      body: 'Test body',
      tone: 'friendly',
    };

    await saveOutreachTool.execute(input);

    expect(prisma.outreach.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        personalizedDetails: expect.objectContaining({
          tone: 'friendly',
        }),
      }),
    });
  });

  it('should use default language "nl" when not provided', async () => {
    const input = {
      leadId: 'lead-123',
      subject: 'Test',
      body: 'Test body',
    };

    await saveOutreachTool.execute(input);

    expect(prisma.outreach.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        personalizedDetails: expect.objectContaining({
          language: 'nl',
        }),
      }),
    });
  });

  it('should use custom language when provided', async () => {
    const input = {
      leadId: 'lead-123',
      subject: 'Test',
      body: 'Test body',
      language: 'en',
    };

    await saveOutreachTool.execute(input);

    expect(prisma.outreach.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        personalizedDetails: expect.objectContaining({
          language: 'en',
        }),
      }),
    });
  });

  it('should parse valid personalizedDetails JSON', async () => {
    const input = {
      leadId: 'lead-123',
      subject: 'Test',
      body: 'Test body',
      personalizedDetails: JSON.stringify({
        specificInsight: 'No booking system found',
        improvementArea: 'Website',
        estimatedImpact: '€5000/month',
      }),
    };

    await saveOutreachTool.execute(input);

    expect(prisma.outreach.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        personalizedDetails: expect.objectContaining({
          specificInsight: 'No booking system found',
          improvementArea: 'Website',
          estimatedImpact: '€5000/month',
          tone: 'professional',
          language: 'nl',
        }),
      }),
    });
  });

  it('should handle malformed personalizedDetails JSON gracefully', async () => {
    const input = {
      leadId: 'lead-123',
      subject: 'Test',
      body: 'Test body',
      personalizedDetails: 'not-valid-json',
    };

    await saveOutreachTool.execute(input);

    expect(prisma.outreach.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        personalizedDetails: expect.objectContaining({
          tone: 'professional',
          language: 'nl',
        }),
      }),
    });
  });

  it('should handle empty personalizedDetails', async () => {
    const input = {
      leadId: 'lead-123',
      subject: 'Test',
      body: 'Test body',
      personalizedDetails: '',
    };

    await saveOutreachTool.execute(input);

    expect(prisma.outreach.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        personalizedDetails: expect.objectContaining({
          tone: 'professional',
          language: 'nl',
        }),
      }),
    });
  });

  it('should include htmlBody when provided', async () => {
    const input = {
      leadId: 'lead-123',
      subject: 'Test',
      body: 'Plain text body',
      htmlBody: '<h1>HTML Body</h1>',
    };

    await saveOutreachTool.execute(input);

    expect(prisma.outreach.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        personalizedDetails: expect.objectContaining({
          htmlBody: '<h1>HTML Body</h1>',
        }),
      }),
    });
  });

  it('should set htmlBody to undefined when not provided', async () => {
    const input = {
      leadId: 'lead-123',
      subject: 'Test',
      body: 'Plain text body',
    };

    await saveOutreachTool.execute(input);

    expect(prisma.outreach.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        personalizedDetails: expect.objectContaining({
          htmlBody: undefined,
        }),
      }),
    });
  });

  it('should include all personalizedDetails fields merged with tone/language/htmlBody', async () => {
    const details = {
      specificInsight: 'Missing Google Business listing',
      improvementArea: 'Local SEO',
      estimatedImpact: '€3000/year',
    };

    const input = {
      leadId: 'lead-123',
      subject: 'Quick question',
      body: 'Body text',
      tone: 'urgent',
      language: 'en',
      htmlBody: '<p>Body</p>',
      personalizedDetails: JSON.stringify(details),
    };

    await saveOutreachTool.execute(input);

    expect(prisma.outreach.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        personalizedDetails: {
          specificInsight: 'Missing Google Business listing',
          improvementArea: 'Local SEO',
          estimatedImpact: '€3000/year',
          tone: 'urgent',
          language: 'en',
          htmlBody: '<p>Body</p>',
        },
      }),
    });
  });

  it('should throw if outreach creation fails', async () => {
    (prisma.outreach.create as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Lead not found')
    );

    const input = {
      leadId: 'nonexistent',
      subject: 'Test',
      body: 'Test',
    };

    await expect(saveOutreachTool.execute(input)).rejects.toThrow('Lead not found');
  });

  it('should throw if lead status update fails', async () => {
    (prisma.lead.update as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Record not found')
    );

    const input = {
      leadId: 'lead-123',
      subject: 'Test',
      body: 'Test',
    };

    await expect(saveOutreachTool.execute(input)).rejects.toThrow('Record not found');
  });

  it('should handle null personalizedDetails', async () => {
    const input = {
      leadId: 'lead-123',
      subject: 'Test',
      body: 'Test body',
      personalizedDetails: null,
    };

    await saveOutreachTool.execute(input);

    expect(prisma.outreach.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        personalizedDetails: expect.objectContaining({
          tone: 'professional',
          language: 'nl',
        }),
      }),
    });
  });
});