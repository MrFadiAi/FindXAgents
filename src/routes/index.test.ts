import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerRoutes } from './index.js';

// --- Mocks ---

const {
  mockPrisma,
  mockQueueAdd,
  mockDiscover,
  mockBulkAnalyze,
  mockBulkOutreach,
  mockBulkUpdateStatus,
  mockImportCsv,
  mockLeadsToCsv,
  mockOutreachesToCsv,
  mockGetAllToolDefinitions,
} = vi.hoisted(() => {
  const mockPrisma = {
    lead: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
    },
    analysis: {
      deleteMany: vi.fn(),
    },
    outreach: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    agentLog: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
    },
    agentPipelineRun: {
      findUnique: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    pipelineStage: {
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
    agent: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      upsert: vi.fn(),
    },
    agentSkill: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      upsert: vi.fn(),
    },
  };
  const mockQueueAdd = vi.fn().mockResolvedValue({ id: 'job-123' });
  const mockDiscover = vi.fn();
  const mockBulkAnalyze = vi.fn();
  const mockBulkOutreach = vi.fn();
  const mockBulkUpdateStatus = vi.fn();
  const mockImportCsv = vi.fn();
  const mockLeadsToCsv = vi.fn();
  const mockOutreachesToCsv = vi.fn();
  const mockGetAllToolDefinitions = vi.fn();
  return {
    mockPrisma,
    mockQueueAdd,
    mockDiscover,
    mockBulkAnalyze,
    mockBulkOutreach,
    mockBulkUpdateStatus,
    mockImportCsv,
    mockLeadsToCsv,
    mockOutreachesToCsv,
    mockGetAllToolDefinitions,
  };
});

vi.mock('../lib/db/client.js', () => ({
  prisma: mockPrisma,
}));

vi.mock('../workers/queues.js', () => ({
  analysisQueue: { add: mockQueueAdd },
  discoveryKvkQueue: { add: mockQueueAdd },
  discoveryGoogleQueue: { add: mockQueueAdd },
  outreachGenerateQueue: { add: mockQueueAdd },
  outreachSendQueue: { add: mockQueueAdd },
  outreachTrackQueue: { add: mockQueueAdd },
}));

vi.mock('../modules/discovery/discovery.service.js', () => ({
  DiscoveryService: vi.fn(() => ({ discover: mockDiscover })),
}));

vi.mock('../modules/analyzer/analyzer.service.js', () => ({
  analyzeWebsite: vi.fn(),
  getLeadAnalyses: vi.fn(),
  getAnalysis: vi.fn(),
  generateReportForAnalysis: vi.fn(),
}));

vi.mock('../modules/outreach/outreach.service.js', () => ({
  generateOutreachEmail: vi.fn(),
  approveOutreach: vi.fn(),
  sendOutreach: vi.fn(),
  trackOutreachEvent: vi.fn(),
  getLeadOutreachHistory: vi.fn(),
  getOutreach: vi.fn(),
  listOutreaches: vi.fn(),
  updateOutreachDraft: vi.fn(),
  checkRateLimit: vi.fn(),
}));

vi.mock('../agents/orchestrator/service.js', () => ({
  triggerAgentPipeline: vi.fn(),
  getAgentRuns: vi.fn(),
  getAgentRun: vi.fn(),
  getAgentRunEmails: vi.fn(),
}));

vi.mock('../lib/email/gmail-oauth.js', () => ({
  getAuthorizationUrl: vi.fn(),
  exchangeCodeForTokens: vi.fn(),
  getStoredTokens: vi.fn(),
  saveTokens: vi.fn(),
  deleteTokens: vi.fn(),
  getAuthenticatedClient: vi.fn(),
  getGmailProfile: vi.fn(),
}));

vi.mock('../lib/email/client.js', () => ({
  resetProviderCache: vi.fn(),
}));

vi.mock('../modules/leads/bulk-actions.js', () => ({
  bulkAnalyze: (...args: unknown[]) => mockBulkAnalyze(...args),
  bulkOutreach: (...args: unknown[]) => mockBulkOutreach(...args),
  bulkUpdateStatus: (...args: unknown[]) => mockBulkUpdateStatus(...args),
}));

vi.mock('../modules/import-export/csv-parser.js', () => ({
  importCsv: (...args: unknown[]) => mockImportCsv(...args),
  leadsToCsv: (...args: unknown[]) => mockLeadsToCsv(...args),
  outreachesToCsv: (...args: unknown[]) => mockOutreachesToCsv(...args),
}));

vi.mock('../agents/core/tool-registry.js', () => ({
  getAllToolDefinitions: (...args: unknown[]) => mockGetAllToolDefinitions(...args),
}));

// Import mocked modules for easy access in tests
import { analyzeWebsite, getLeadAnalyses, getAnalysis, generateReportForAnalysis } from '../modules/analyzer/analyzer.service.js';
import { generateOutreachEmail, approveOutreach, sendOutreach, trackOutreachEvent, getLeadOutreachHistory, getOutreach, listOutreaches, updateOutreachDraft, checkRateLimit } from '../modules/outreach/outreach.service.js';
import { triggerAgentPipeline, getAgentRuns, getAgentRun, getAgentRunEmails } from '../agents/orchestrator/service.js';
import { getAuthorizationUrl, exchangeCodeForTokens, getStoredTokens, saveTokens, deleteTokens, getAuthenticatedClient, getGmailProfile } from '../lib/email/gmail-oauth.js';
import { resetProviderCache } from '../lib/email/client.js';

let app: FastifyInstance;

beforeEach(async () => {
  vi.clearAllMocks();
  app = Fastify();
  registerRoutes(app);
  await app.ready();
}, 30_000);

afterEach(async () => {
  await app.close();
}, 30_000);

// ===================================================================
// HEALTH CHECK
// ===================================================================
describe('GET /api/health', () => {
  it('returns status ok with timestamp', { timeout: 30_000 }, async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeDefined();
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
  });
});

// ===================================================================
// DISCOVERY
// ===================================================================
describe('POST /api/leads/discover', () => {
  it('returns 202 on empty body (all fields optional)', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/leads/discover', payload: {} });
    // All discover fields are optional; empty body queues background jobs
    expect(res.statusCode).toBe(202);
    expect(res.json().message).toBe('Discovery jobs queued');
  });

  it('returns 400 when limit exceeds max', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/leads/discover', payload: { limit: 1001 } });
    expect(res.statusCode).toBe(400);
  });

  it('runs sync discovery and returns 200', async () => {
    mockDiscover.mockResolvedValue({ discovered: 5 });
    const res = await app.inject({
      method: 'POST', url: '/api/leads/discover',
      payload: { sync: true, city: 'Amsterdam' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().discovered).toBe(5);
    expect(mockDiscover).toHaveBeenCalledWith({ sync: true, city: 'Amsterdam', limit: 500 });
  });

  it('queues background jobs for kvk and google by default', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/leads/discover',
      payload: { city: 'Utrecht' },
    });
    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body.message).toBe('Discovery jobs queued');
    expect(body.jobs).toHaveLength(2);
    expect(mockQueueAdd).toHaveBeenCalledTimes(2);
  });

  it('queues only specified sources', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/leads/discover',
      payload: { sources: ['kvk'] },
    });
    expect(res.statusCode).toBe(202);
    expect(res.json().jobs).toHaveLength(1);
    expect(mockQueueAdd).toHaveBeenCalledTimes(1);
  });
});

// ===================================================================
// LEADS CRUD
// ===================================================================
describe('POST /api/leads', () => {
  it('returns 400 on missing required fields', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/leads', payload: {} });
    expect(res.statusCode).toBe(400);
  });

  it('creates a lead and returns 201', async () => {
    const fakeLead = { id: 'l1', businessName: 'Test', city: 'Amsterdam' };
    mockPrisma.lead.create.mockResolvedValue(fakeLead);
    const res = await app.inject({
      method: 'POST', url: '/api/leads',
      payload: { businessName: 'Test', city: 'Amsterdam' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().lead).toEqual(fakeLead);
  });

  it('sets hasWebsite to false when website is empty string', async () => {
    const fakeLead = { id: 'l1', businessName: 'Test', city: 'A', hasWebsite: false };
    mockPrisma.lead.create.mockResolvedValue(fakeLead);
    await app.inject({
      method: 'POST', url: '/api/leads',
      payload: { businessName: 'Test', city: 'A', website: '' },
    });
    expect(mockPrisma.lead.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ hasWebsite: false, website: undefined }) }),
    );
  });

  it('sets hasWebsite to true when valid URL provided', async () => {
    const fakeLead = { id: 'l1', businessName: 'Test', city: 'A', hasWebsite: true };
    mockPrisma.lead.create.mockResolvedValue(fakeLead);
    await app.inject({
      method: 'POST', url: '/api/leads',
      payload: { businessName: 'Test', city: 'A', website: 'https://example.com' },
    });
    expect(mockPrisma.lead.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ hasWebsite: true }) }),
    );
  });

  it('rejects invalid website URL', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/leads',
      payload: { businessName: 'Test', city: 'A', website: 'not-a-url' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('defaults source to "manual"', async () => {
    const fakeLead = { id: 'l1' };
    mockPrisma.lead.create.mockResolvedValue(fakeLead);
    await app.inject({
      method: 'POST', url: '/api/leads',
      payload: { businessName: 'Test', city: 'A' },
    });
    expect(mockPrisma.lead.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ source: 'manual' }) }),
    );
  });
});

describe('GET /api/leads', () => {
  it('returns leads with pagination', async () => {
    mockPrisma.lead.findMany.mockResolvedValue([{ id: 'l1' }]);
    mockPrisma.lead.count.mockResolvedValue(1);
    const res = await app.inject({ method: 'GET', url: '/api/leads' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.leads).toHaveLength(1);
    expect(body.total).toBe(1);
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(25);
  });

  it('applies filters for city, industry, status, source, hasWebsite, search', async () => {
    mockPrisma.lead.findMany.mockResolvedValue([]);
    mockPrisma.lead.count.mockResolvedValue(0);
    const res = await app.inject({
      method: 'GET',
      url: '/api/leads?city=Amsterdam&industry=tech&status=discovered&source=kvk&hasWebsite=true&search=test',
    });
    expect(res.statusCode).toBe(200);
    const call = mockPrisma.lead.findMany.mock.calls[0][0];
    expect(call.where.city).toBeDefined();
    expect(call.where.industry).toBeDefined();
    expect(call.where.status).toBe('discovered');
    expect(call.where.source).toBeDefined();
    expect(call.where.hasWebsite).toBe(true);
    expect(call.where.OR).toBeDefined();
  });

  it('returns 400 on invalid pageSize', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/leads?pageSize=0' });
    expect(res.statusCode).toBe(400);
  });

  it('respects custom page and pageSize', async () => {
    mockPrisma.lead.findMany.mockResolvedValue([]);
    mockPrisma.lead.count.mockResolvedValue(50);
    await app.inject({ method: 'GET', url: '/api/leads?page=2&pageSize=10' });
    const call = mockPrisma.lead.findMany.mock.calls[0][0];
    expect(call.skip).toBe(10);
    expect(call.take).toBe(10);
  });
});

describe('GET /api/leads/:id', () => {
  it('returns lead when found', async () => {
    mockPrisma.lead.findUnique.mockResolvedValue({ id: 'l1', businessName: 'Test' });
    const res = await app.inject({ method: 'GET', url: '/api/leads/l1' });
    expect(res.statusCode).toBe(200);
    expect(res.json().lead.id).toBe('l1');
  });

  it('returns lead: null when not found', async () => {
    mockPrisma.lead.findUnique.mockResolvedValue(null);
    const res = await app.inject({ method: 'GET', url: '/api/leads/nonexistent' });
    expect(res.statusCode).toBe(200);
    expect(res.json().lead).toBeNull();
  });
});

describe('PATCH /api/leads/:id', () => {
  it('updates allowed fields and returns lead', async () => {
    const updated = { id: 'l1', businessName: 'Updated' };
    mockPrisma.lead.update.mockResolvedValue(updated);
    const res = await app.inject({
      method: 'PATCH', url: '/api/leads/l1',
      payload: { businessName: 'Updated', status: 'analyzing' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().lead.businessName).toBe('Updated');
  });

  it('ignores disallowed fields', async () => {
    mockPrisma.lead.update.mockResolvedValue({ id: 'l1' });
    await app.inject({
      method: 'PATCH', url: '/api/leads/l1',
      payload: { businessName: 'Test', forbiddenField: 'ignored' },
    });
    const data = mockPrisma.lead.update.mock.calls[0][0].data;
    expect(data.forbiddenField).toBeUndefined();
    expect(data.businessName).toBe('Test');
  });

  it('returns 404 when lead not found', async () => {
    const err = new Error('Record not found');
    mockPrisma.lead.update.mockRejectedValue(err);
    const res = await app.inject({
      method: 'PATCH', url: '/api/leads/nonexistent',
      payload: { businessName: 'X' },
    });
    expect(res.statusCode).toBe(404);
  });
});

// ===================================================================
// BULK ACTIONS
// ===================================================================
describe('POST /api/leads/bulk/analyze', () => {
  it('returns 400 when leadIds missing', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/leads/bulk/analyze', payload: {} });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when leadIds exceeds 100', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/leads/bulk/analyze',
      payload: { leadIds: Array(101).fill('id') },
    });
    expect(res.statusCode).toBe(400);
  });

  it('calls bulkAnalyze and returns result', async () => {
    mockBulkAnalyze.mockResolvedValue({ analyzed: 5 });
    const res = await app.inject({
      method: 'POST', url: '/api/leads/bulk/analyze',
      payload: { leadIds: ['a', 'b'] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().analyzed).toBe(5);
  });
});

describe('POST /api/leads/bulk/outreach', () => {
  it('returns 400 when leadIds missing', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/leads/bulk/outreach', payload: {} });
    expect(res.statusCode).toBe(400);
  });

  it('calls bulkOutreach with tone and language options', async () => {
    mockBulkOutreach.mockResolvedValue({ generated: 2 });
    const res = await app.inject({
      method: 'POST', url: '/api/leads/bulk/outreach',
      payload: { leadIds: ['a'], tone: 'friendly', language: 'nl' },
    });
    expect(res.statusCode).toBe(200);
    expect(mockBulkOutreach).toHaveBeenCalledWith(['a'], { tone: 'friendly', language: 'nl' });
  });
});

describe('PATCH /api/leads/bulk/status', () => {
  it('returns 400 on invalid status', async () => {
    const res = await app.inject({
      method: 'PATCH', url: '/api/leads/bulk/status',
      payload: { leadIds: ['uuid-1'], status: 'invalid_status' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 on non-UUID leadIds', async () => {
    const res = await app.inject({
      method: 'PATCH', url: '/api/leads/bulk/status',
      payload: { leadIds: ['not-uuid'], status: 'discovered' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('calls bulkUpdateStatus', async () => {
    mockBulkUpdateStatus.mockResolvedValue({ updated: 2 });
    const res = await app.inject({
      method: 'PATCH', url: '/api/leads/bulk/status',
      payload: { leadIds: ['550e8400-e29b-41d4-a716-446655440000'], status: 'analyzing' },
    });
    expect(res.statusCode).toBe(200);
    expect(mockBulkUpdateStatus).toHaveBeenCalled();
  });
});

// ===================================================================
// CSV IMPORT / EXPORT
// ===================================================================
describe('POST /api/leads/import', () => {
  it('returns 400 when csv field is missing', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/leads/import', payload: {} });
    expect(res.statusCode).toBe(400);
  });

  it('imports CSV and returns result', async () => {
    mockImportCsv.mockResolvedValue({ imported: 10 });
    const res = await app.inject({
      method: 'POST', url: '/api/leads/import',
      payload: { csv: 'businessName,city\nTest,Amsterdam', skipDuplicates: false },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().imported).toBe(10);
  });
});

describe('GET /api/leads/export', () => {
  it('returns CSV with correct headers', async () => {
    mockPrisma.lead.findMany.mockResolvedValue([]);
    mockLeadsToCsv.mockReturnValue('businessName,city\n');
    const res = await app.inject({ method: 'GET', url: '/api/leads/export' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('findx-leads.csv');
  });

  it('passes filters to query', async () => {
    mockPrisma.lead.findMany.mockResolvedValue([]);
    mockLeadsToCsv.mockReturnValue('');
    await app.inject({ method: 'GET', url: '/api/leads/export?city=Amsterdam&status=discovered' });
    const call = mockPrisma.lead.findMany.mock.calls[0][0];
    expect(call.where.city).toBeDefined();
    expect(call.where.status).toBe('discovered');
  });
});

describe('GET /api/outreaches/export', () => {
  it('returns CSV for outreaches', async () => {
    mockPrisma.outreach.findMany.mockResolvedValue([]);
    mockOutreachesToCsv.mockReturnValue('subject,status\n');
    const res = await app.inject({ method: 'GET', url: '/api/outreaches/export' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
  });

  it('filters by status', async () => {
    mockPrisma.outreach.findMany.mockResolvedValue([]);
    mockOutreachesToCsv.mockReturnValue('');
    await app.inject({ method: 'GET', url: '/api/outreaches/export?status=sent' });
    const call = mockPrisma.outreach.findMany.mock.calls[0][0];
    expect(call.where.status).toBe('sent');
  });
});

// ===================================================================
// PIPELINE
// ===================================================================
describe('GET /api/pipeline', () => {
  it('returns stages and status counts', async () => {
    mockPrisma.pipelineStage.findMany.mockResolvedValue([{ name: 'discovered', order: 0 }]);
    mockPrisma.lead.groupBy.mockResolvedValue([{ status: 'discovered', _count: 5 }]);
    const res = await app.inject({ method: 'GET', url: '/api/pipeline' });
    expect(res.statusCode).toBe(200);
    expect(res.json().stages).toHaveLength(1);
    expect(res.json().statusCounts).toHaveLength(1);
  });
});

// ===================================================================
// ANALYSIS
// ===================================================================
describe('POST /api/leads/:id/analyze', () => {
  it('returns 404 when lead not found', async () => {
    mockPrisma.lead.findUnique.mockResolvedValue(null);
    const res = await app.inject({ method: 'POST', url: '/api/leads/l1/analyze', payload: {} });
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 when lead has no website', async () => {
    mockPrisma.lead.findUnique.mockResolvedValue({ id: 'l1', website: null });
    const res = await app.inject({ method: 'POST', url: '/api/leads/l1/analyze', payload: {} });
    expect(res.statusCode).toBe(400);
  });

  it('runs sync analysis', async () => {
    mockPrisma.lead.findUnique.mockResolvedValue({ id: 'l1', website: 'https://test.com', businessName: 'Test' });
    vi.mocked(analyzeWebsite).mockResolvedValue({ id: 'a1' });
    const res = await app.inject({
      method: 'POST', url: '/api/leads/l1/analyze',
      payload: { sync: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().analysis).toEqual({ id: 'a1' });
  });

  it('handles sync analysis failure', async () => {
    mockPrisma.lead.findUnique.mockResolvedValue({ id: 'l1', website: 'https://test.com', businessName: 'Test' });
    vi.mocked(analyzeWebsite).mockRejectedValue(new Error('Timeout'));
    const res = await app.inject({
      method: 'POST', url: '/api/leads/l1/analyze',
      payload: { sync: true },
    });
    expect(res.statusCode).toBe(500);
    expect(res.json().error).toBe('Analysis failed');
  });

  it('queues background analysis job', async () => {
    mockPrisma.lead.findUnique.mockResolvedValue({ id: 'l1', website: 'https://test.com', businessName: 'Test' });
    const res = await app.inject({
      method: 'POST', url: '/api/leads/l1/analyze',
      payload: { sync: false },
    });
    expect(res.statusCode).toBe(202);
    expect(res.json().jobId).toBe('job-123');
  });
});

describe('GET /api/leads/:id/analyses', () => {
  it('returns analyses for a lead', async () => {
    vi.mocked(getLeadAnalyses).mockResolvedValue([{ id: 'a1' }]);
    const res = await app.inject({ method: 'GET', url: '/api/leads/l1/analyses' });
    expect(res.statusCode).toBe(200);
    expect(res.json().analyses).toHaveLength(1);
  });
});

describe('GET /api/analyses/:id', () => {
  it('returns analysis when found', async () => {
    vi.mocked(getAnalysis).mockResolvedValue({ id: 'a1' });
    const res = await app.inject({ method: 'GET', url: '/api/analyses/a1' });
    expect(res.statusCode).toBe(200);
    expect(res.json().analysis.id).toBe('a1');
  });

  it('returns 404 when not found', async () => {
    vi.mocked(getAnalysis).mockResolvedValue(null);
    const res = await app.inject({ method: 'GET', url: '/api/analyses/nonexistent' });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /api/analyses/:id/report', () => {
  it('returns PDF with correct headers', async () => {
    const buf = Buffer.from('fake-pdf');
    vi.mocked(generateReportForAnalysis).mockResolvedValue(buf);
    const res = await app.inject({ method: 'GET', url: '/api/analyses/a1/report' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toContain('findx-analysis-a1.pdf');
  });

  it('returns 404 when report generation fails', async () => {
    vi.mocked(generateReportForAnalysis).mockRejectedValue(new Error('Not found'));
    const res = await app.inject({ method: 'GET', url: '/api/analyses/a1/report' });
    expect(res.statusCode).toBe(404);
  });
});

// ===================================================================
// OUTREACH
// ===================================================================
describe('POST /api/leads/:id/outreach/generate', () => {
  it('returns 404 when lead not found', async () => {
    mockPrisma.lead.findUnique.mockResolvedValue(null);
    const res = await app.inject({ method: 'POST', url: '/api/leads/l1/outreach/generate', payload: {} });
    expect(res.statusCode).toBe(404);
  });

  it('generates outreach synchronously', async () => {
    mockPrisma.lead.findUnique.mockResolvedValue({ id: 'l1' });
    vi.mocked(generateOutreachEmail).mockResolvedValue({ outreach: { id: 'o1' }, variants: [] });
    const res = await app.inject({
      method: 'POST', url: '/api/leads/l1/outreach/generate',
      payload: { sync: true, tone: 'friendly', language: 'nl' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().outreach.id).toBe('o1');
  });

  it('handles sync generation failure', async () => {
    mockPrisma.lead.findUnique.mockResolvedValue({ id: 'l1' });
    vi.mocked(generateOutreachEmail).mockRejectedValue(new Error('AI failed'));
    const res = await app.inject({
      method: 'POST', url: '/api/leads/l1/outreach/generate',
      payload: { sync: true },
    });
    expect(res.statusCode).toBe(500);
  });

  it('queues background generation job', async () => {
    mockPrisma.lead.findUnique.mockResolvedValue({ id: 'l1' });
    const res = await app.inject({
      method: 'POST', url: '/api/leads/l1/outreach/generate',
      payload: { sync: false },
    });
    expect(res.statusCode).toBe(202);
  });
});

describe('GET /api/leads/:id/outreaches', () => {
  it('returns outreach history', async () => {
    vi.mocked(getLeadOutreachHistory).mockResolvedValue([{ id: 'o1' }]);
    const res = await app.inject({ method: 'GET', url: '/api/leads/l1/outreaches' });
    expect(res.statusCode).toBe(200);
    expect(res.json().outreaches).toHaveLength(1);
  });
});

describe('POST /api/leads/:id/outreach/send', () => {
  it('returns 400 when outreachId missing', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/leads/l1/outreach/send', payload: {} });
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 when outreach not found or wrong lead', async () => {
    vi.mocked(getOutreach).mockResolvedValue({ id: 'o1', leadId: 'other-lead' });
    const res = await app.inject({
      method: 'POST', url: '/api/leads/l1/outreach/send',
      payload: { outreachId: 'o1' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('approves draft before sending', async () => {
    vi.mocked(getOutreach).mockResolvedValue({ id: 'o1', leadId: 'l1', status: 'draft' });
    vi.mocked(sendOutreach).mockResolvedValue({ sent: true });
    const res = await app.inject({
      method: 'POST', url: '/api/leads/l1/outreach/send',
      payload: { outreachId: 'o1', sync: true },
    });
    expect(res.statusCode).toBe(200);
    expect(vi.mocked(approveOutreach)).toHaveBeenCalledWith('o1');
  });

  it('queues background send job', async () => {
    vi.mocked(getOutreach).mockResolvedValue({ id: 'o1', leadId: 'l1', status: 'approved' });
    const res = await app.inject({
      method: 'POST', url: '/api/leads/l1/outreach/send',
      payload: { outreachId: 'o1', sync: false },
    });
    expect(res.statusCode).toBe(202);
  });
});

describe('GET /api/outreaches/:id', () => {
  it('returns outreach when found', async () => {
    vi.mocked(getOutreach).mockResolvedValue({ id: 'o1' });
    const res = await app.inject({ method: 'GET', url: '/api/outreaches/o1' });
    expect(res.statusCode).toBe(200);
  });

  it('returns 404 when not found', async () => {
    vi.mocked(getOutreach).mockResolvedValue(null);
    const res = await app.inject({ method: 'GET', url: '/api/outreaches/nonexistent' });
    expect(res.statusCode).toBe(404);
  });
});

describe('PATCH /api/outreaches/:id', () => {
  it('approves outreach', async () => {
    vi.mocked(approveOutreach).mockResolvedValue(undefined);
    vi.mocked(getOutreach).mockResolvedValue({ id: 'o1', status: 'approved' });
    const res = await app.inject({
      method: 'PATCH', url: '/api/outreaches/o1',
      payload: { status: 'approved' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().outreach.status).toBe('approved');
  });

  it('handles approval failure', async () => {
    vi.mocked(approveOutreach).mockRejectedValue(new Error('Cannot approve'));
    const res = await app.inject({
      method: 'PATCH', url: '/api/outreaches/o1',
      payload: { status: 'approved' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('updates draft subject/body', async () => {
    vi.mocked(updateOutreachDraft).mockResolvedValue({ id: 'o1', subject: 'New' });
    const res = await app.inject({
      method: 'PATCH', url: '/api/outreaches/o1',
      payload: { subject: 'New', body: 'Updated body' },
    });
    expect(res.statusCode).toBe(200);
  });

  it('handles draft update failure', async () => {
    vi.mocked(updateOutreachDraft).mockRejectedValue(new Error('Not a draft'));
    const res = await app.inject({
      method: 'PATCH', url: '/api/outreaches/o1',
      payload: { subject: 'New' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when no valid fields', async () => {
    const res = await app.inject({
      method: 'PATCH', url: '/api/outreaches/o1',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /api/outreaches', () => {
  it('returns list with filters', async () => {
    vi.mocked(listOutreaches).mockResolvedValue({ outreaches: [], total: 0, page: 1, pageSize: 25 });
    const res = await app.inject({ method: 'GET', url: '/api/outreaches?status=sent&page=2&pageSize=10' });
    expect(res.statusCode).toBe(200);
    expect(listOutreaches).toHaveBeenCalledWith({
      status: 'sent',
      leadId: undefined,
      page: 2,
      pageSize: 10,
    });
  });
});

describe('POST /api/webhooks/resend', () => {
  it('returns 400 on invalid payload', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/webhooks/resend', payload: {} });
    expect(res.statusCode).toBe(400);
  });

  it('acknowledges unhandled event types', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/webhooks/resend',
      payload: { type: 'email.sent', data: { outreach_id: 'o1' } },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().processed).toBe(false);
  });

  it('tracks open event', async () => {
    vi.mocked(trackOutreachEvent).mockResolvedValue(undefined);
    const res = await app.inject({
      method: 'POST', url: '/api/webhooks/resend',
      payload: { type: 'email.opened', data: { outreach_id: 'o1', timestamp: '2024-01-01T00:00:00Z' } },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().processed).toBe(true);
    expect(trackOutreachEvent).toHaveBeenCalledWith('o1', 'open', '2024-01-01T00:00:00Z');
  });

  it('tracks reply event', async () => {
    vi.mocked(trackOutreachEvent).mockResolvedValue(undefined);
    const res = await app.inject({
      method: 'POST', url: '/api/webhooks/resend',
      payload: { type: 'email.replied', data: { outreach_id: 'o1' } },
    });
    expect(res.json().processed).toBe(true);
    expect(trackOutreachEvent).toHaveBeenCalledWith('o1', 'reply', undefined);
  });

  it('tracks bounce event', async () => {
    vi.mocked(trackOutreachEvent).mockResolvedValue(undefined);
    const res = await app.inject({
      method: 'POST', url: '/api/webhooks/resend',
      payload: { type: 'email.bounced', data: { outreach_id: 'o1' } },
    });
    expect(res.json().processed).toBe(true);
  });

  it('tracks delivery_failed as bounce', async () => {
    vi.mocked(trackOutreachEvent).mockResolvedValue(undefined);
    const res = await app.inject({
      method: 'POST', url: '/api/webhooks/resend',
      payload: { type: 'email.delivery_failed', data: { outreach_id: 'o1' } },
    });
    expect(res.json().processed).toBe(true);
    expect(trackOutreachEvent).toHaveBeenCalledWith('o1', 'bounce', undefined);
  });

  it('returns 400 when outreach_id missing', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/webhooks/resend',
      payload: { type: 'email.opened', data: {} },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /api/outreach/rate-limit', () => {
  it('returns rate limit status', async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: 50, resetAt: '2024-01-01T00:00:00Z' });
    const res = await app.inject({
      method: 'GET', url: '/api/outreach/rate-limit',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ allowed: true, remaining: 50, resetAt: '2024-01-01T00:00:00Z' });
    expect(checkRateLimit).toHaveBeenCalledOnce();
  });
});
