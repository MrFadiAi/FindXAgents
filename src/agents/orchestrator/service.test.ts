import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mocks Setup ---

vi.mock('../../lib/db/client.js', () => ({
  prisma: {
    agentPipelineRun: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    lead: {
      findMany: vi.fn(),
    },
    outreach: {
      findMany: vi.fn(),
    },
  },
}));

const mockAddQueue = vi.fn();
vi.mock('../../workers/queues.js', () => ({
  agentPipelineQueue: {
    add: mockAddQueue,
  },
}));

const mockRunPipeline = vi.fn();
vi.mock('./orchestrator.js', () => ({
  AgentOrchestrator: vi.fn().mockImplementation(() => ({
    runPipeline: mockRunPipeline,
  })),
  // Mock PipelineResult type instantiation avoidance
}));

// --- Imports ---
import { prisma } from '../../lib/db/client.js';
import {
  triggerAgentPipeline,
  getAgentRuns,
  getAgentRun,
  getAgentRunEmails,
} from './service.js';

beforeEach(() => {
  vi.clearAllMocks();
});

// --- Tests ---

describe('triggerAgentPipeline', () => {
  const mockQuery = 'Best coffee shops';
  const mockRunRecord = { id: 'run_123', query: mockQuery, status: 'running' };

  beforeEach(() => {
    vi.mocked(prisma.agentPipelineRun.create).mockResolvedValue(mockRunRecord as any);
  });

  it('should create a pipeline run record with status "running"', async () => {
    await triggerAgentPipeline(mockQuery);
    expect(prisma.agentPipelineRun.create).toHaveBeenCalledWith({
      data: { query: mockQuery, status: 'running' },
    });
  });

  it('should run synchronously and return PipelineResult if sync is true', async () => {
    const mockResult = { success: true, leads: [] };
    mockRunPipeline.mockResolvedValue(mockResult);

    const result = await triggerAgentPipeline(mockQuery, true, 10, 'nl');

    expect(result).toEqual(mockResult);
    expect(mockRunPipeline).toHaveBeenCalledWith({
      query: mockQuery,
      pipelineRunId: 'run_123',
      maxResults: 10,
      language: 'nl',
    });
    // Queue should not be called
    expect(mockAddQueue).not.toHaveBeenCalled();
  });

  it('should run synchronously with defaults if only sync is true', async () => {
    const mockResult = { success: true, leads: [] };
    mockRunPipeline.mockResolvedValue(mockResult);

    await triggerAgentPipeline(mockQuery, true);

    expect(mockRunPipeline).toHaveBeenCalledWith({
      query: mockQuery,
      pipelineRunId: 'run_123',
      maxResults: undefined,
      language: 'en', // default
    });
  });

  it('should queue a background job and return runId and status if sync is false', async () => {
    const result = await triggerAgentPipeline(mockQuery, false, 15, 'ar');

    expect(mockAddQueue).toHaveBeenCalledWith(
      'agent-pipeline',
      { query: mockQuery, pipelineRunId: 'run_123', maxResults: 15, language: 'ar' },
      { attempts: 1 },
    );
    expect(result).toEqual({ runId: 'run_123', status: 'queued' });
  });

  it('should queue a background job with default values', async () => {
    // defaults: sync = false, maxResults = undefined, language = 'en'
    const result = await triggerAgentPipeline(mockQuery);

    expect(mockAddQueue).toHaveBeenCalledWith(
      'agent-pipeline',
      { query: mockQuery, pipelineRunId: 'run_123', maxResults: undefined, language: 'en' },
      { attempts: 1 },
    );
    expect(result).toEqual({ runId: 'run_123', status: 'queued' });
  });

  it('should propagate errors if database creation fails', async () => {
    const dbError = new Error('DB connection error');
    vi.mocked(prisma.agentPipelineRun.create).mockRejectedValue(dbError);

    await expect(triggerAgentPipeline(mockQuery)).rejects.toThrow('DB connection error');
  });

  it('should propagate errors if synchronous pipeline fails', async () => {
    const pipelineError = new Error('Agent processing failed');
    mockRunPipeline.mockRejectedValue(pipelineError);

    await expect(triggerAgentPipeline(mockQuery, true)).rejects.toThrow('Agent processing failed');
  });

  it('should propagate errors if queuing fails', async () => {
    mockAddQueue.mockRejectedValue(new Error('Queue service unavailable'));
    
    // For this test, we force the import to execute
    const result = triggerAgentPipeline(mockQuery, false);
    await expect(result).rejects.toThrow('Queue service unavailable');
  });
});

describe('getAgentRuns', () => {
  it('should return the last 50 runs ordered by creation date descending', async () => {
    const mockRuns = [
      { id: 'run_2', createdAt: new Date('2023-01-02') },
      { id: 'run_1', createdAt: new Date('2023-01-01') },
    ];
    vi.mocked(prisma.agentPipelineRun.findMany).mockResolvedValue(mockRuns as any);

    const result = await getAgentRuns();

    expect(result).toEqual(mockRuns);
    expect(prisma.agentPipelineRun.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  });

  it('should return an empty array if there are no runs', async () => {
    vi.mocked(prisma.agentPipelineRun.findMany).mockResolvedValue([]);

    const result = await getAgentRuns();

    expect(result).toEqual([]);
  });

  it('should propagate database errors', async () => {
    vi.mocked(prisma.agentPipelineRun.findMany).mockRejectedValue(new Error('Read error'));

    await expect(getAgentRuns()).rejects.toThrow('Read error');
  });
});

describe('getAgentRun', () => {
  const mockRun = {
    id: 'run_1',
    createdAt: new Date('2023-01-01T10:00:00Z'),
    completedAt: new Date('2023-01-01T10:05:00Z'),
  };

  it('should return null if the run does not exist', async () => {
    vi.mocked(prisma.agentPipelineRun.findUnique).mockResolvedValue(null);

    const result = await getAgentRun('nonexistent_id');

    expect(result).toBeNull();
    expect(prisma.lead.findMany).not.toHaveBeenCalled();
  });

  it('should fetch leads within the time window using completedAt', async () => {
    vi.mocked(prisma.agentPipelineRun.findUnique).mockResolvedValue(mockRun as any);
    
    const mockLeads = [{ id: 'lead_1', analyses: [], outreaches: [] }];
    vi.mocked(prisma.lead.findMany).mockResolvedValue(mockLeads as any);

    const result = await getAgentRun('run_1');

    // Validate time window bounds
    expect(prisma.lead.findMany).toHaveBeenCalledWith({
      where: {
        createdAt: {
          gte: mockRun.createdAt,
          lte: mockRun.completedAt,
        },
      },
      include: {
        analyses: { orderBy: { analyzedAt: 'desc' }, take: 1 },
        outreaches: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      take: 100,
    });

    expect(result).toEqual({ ...mockRun, leads: mockLeads });
  });

  it('should fetch leads using current time if completedAt is null', async () => {
    const mockRunNoEnd = {
      id: 'run_2',
      createdAt: new Date('2023-01-01T10:00:00Z'),
      completedAt: null,
    };
    vi.mocked(prisma.agentPipelineRun.findUnique).mockResolvedValue(mockRunNoEnd as any);
    vi.mocked(prisma.lead.findMany).mockResolvedValue([] as any);

    await getAgentRun('run_2');

    expect(prisma.lead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          createdAt: {
            gte: mockRunNoEnd.createdAt,
            lte: expect.any(Date),
          },
        },
      }),
    );

    // Verify the lte date is approximately now (completedAt is null, so it uses new Date())
    const callArgs = vi.mocked(prisma.lead.findMany).mock.calls[0][0] as any;
    const lteDate = callArgs.where.createdAt.lte as Date;
    expect(lteDate.getTime()).toBeGreaterThan(mockRunNoEnd.createdAt.getTime());
  });

  it('should limit leads fetched to 100', async () => {
    vi.mocked(prisma.agentPipelineRun.findUnique).mockResolvedValue(mockRun as any);
    vi.mocked(prisma.lead.findMany).mockResolvedValue([] as any);

    await getAgentRun('run_1');

    expect(prisma.lead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 }),
    );
  });
});

describe('getAgentRunEmails', () => {
  const mockRun = {
    id: 'run_1',
    createdAt: new Date('2023-01-01T10:00:00Z'),
    completedAt: new Date('2023-01-01T10:05:00Z'),
  };

  it('should return null if the run does not exist', async () => {
    vi.mocked(prisma.agentPipelineRun.findUnique).mockResolvedValue(null);

    const result = await getAgentRunEmails('nonexistent_id');

    expect(result).toBeNull();
    expect(prisma.outreach.findMany).not.toHaveBeenCalled();
  });

  it('should fetch outreaches within the time window using completedAt and map to leads', async () => {
    vi.mocked(prisma.agentPipelineRun.findUnique).mockResolvedValue(mockRun as any);

    const mockOutreaches = [
      {
        id: 'out_1',
        lead: { id: 'lead_1', businessName: 'Test', city: 'City', website: 'test.com', industry: 'Food' },
      },
    ];
    vi.mocked(prisma.outreach.findMany).mockResolvedValue(mockOutreaches as any);

    const result = await getAgentRunEmails('run_1');

    expect(prisma.outreach.findMany).toHaveBeenCalledWith({
      where: {
        createdAt: {
          gte: mockRun.createdAt,
          lte: mockRun.completedAt,
        },
      },
      include: {
        lead: {
          select: {
            id: true,
            businessName: true,
            city: true,
            website: true,
            industry: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    expect(result).toEqual(mockOutreaches);
  });

  it('should fetch outreaches using current time if completedAt is null', async () => {
    const mockRunNoEnd = {
      id: 'run_2',
      createdAt: new Date('2023-01-01T10:00:00Z'),
      completedAt: null,
    };
    vi.mocked(prisma.agentPipelineRun.findUnique).mockResolvedValue(mockRunNoEnd as any);
    vi.mocked(prisma.outreach.findMany).mockResolvedValue([] as any);

    const expectedDate = new Date('2023-01-01T12:00:00Z');
    vi.useFakeTimers();
    vi.setSystemTime(expectedDate);

    await getAgentRunEmails('run_2');

    expect(prisma.outreach.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          createdAt: {
            gte: mockRunNoEnd.createdAt,
            lte: expectedDate,
          },
        },
      }),
    );

    vi.useRealTimers();
  });

  it('should return an empty array if no outreaches exist for the run', async () => {
    vi.mocked(prisma.agentPipelineRun.findUnique).mockResolvedValue(mockRun as any);
    vi.mocked(prisma.outreach.findMany).mockResolvedValue([]);

    const result = await getAgentRunEmails('run_1');

    expect(result).toEqual([]);
  });
})