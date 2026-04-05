import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startAgentWorker } from './agent-worker.js';
import { QUEUE_NAMES } from './queues.js';
import { createWorker } from '../lib/queue/index.js';
import { AgentOrchestrator } from '../agents/orchestrator/orchestrator.js';

// Mock dependencies
vi.mock('../lib/queue/index.js', () => ({
  createQueue: vi.fn(),
  createWorker: vi.fn(),
}));

vi.mock('../agents/orchestrator/orchestrator.js', () => {
  const mockRunPipeline = vi.fn();
  return {
    AgentOrchestrator: vi.fn(() => ({
      runPipeline: mockRunPipeline,
    })),
  };
});

const mockCreateWorker = vi.mocked(createWorker);
const mockRunPipeline = vi.fn();

// Extract the worker process callback to test it directly
let workerProcessor: (job: any) => Promise<any>;

// Spy on console to assert logs without polluting test output
let consoleLogSpy: ReturnType<typeof vi.spyOn>;
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

describe('startAgentWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Capture the processor passed to createWorker
    mockCreateWorker.mockImplementation((_queueName, processor) => {
      workerProcessor = processor;
      return {
        on: vi.fn().mockReturnThis(),
      } as any;
    });

    // Wire the mock orchestrator's prototype method to our mockRunPipeline
    vi.mocked(AgentOrchestrator).mockImplementation(() => ({
      runPipeline: mockRunPipeline,
    }) as any);

    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('should create a worker using the correct queue name', () => {
    startAgentWorker();
    expect(mockCreateWorker).toHaveBeenCalledTimes(1);
    expect(mockCreateWorker).toHaveBeenCalledWith(
      QUEUE_NAMES.AGENT_PIPELINE,
      expect.any(Function)
    );
  });

  it('should register "completed" and "failed" event handlers on the worker', () => {
    startAgentWorker();
    const mockWorker = mockCreateWorker.mock.results[0].value;
    
    expect(mockWorker.on).toHaveBeenCalledTimes(2);
    expect(mockWorker.on).toHaveBeenCalledWith('completed', expect.any(Function));
    expect(mockWorker.on).toHaveBeenCalledWith('failed', expect.any(Function));
  });

  it('should return the created worker instance', () => {
    const worker = startAgentWorker();
    expect(worker).toBe(mockCreateWorker.mock.results[0].value);
  });

  describe('Worker Processor Function', () => {
    it('should instantiate AgentOrchestrator and call runPipeline with job data', async () => {
      const mockJobData = {
        query: 'Find AI startups in Europe',
        pipelineRunId: 'run-123',
        maxResults: 50,
      };
      const mockJob = { data: mockJobData, id: 'job-001' };
      mockRunPipeline.mockResolvedValueOnce({ success: true });

      startAgentWorker();
      const result = await workerProcessor(mockJob);

      expect(AgentOrchestrator).toHaveBeenCalledTimes(1);
      expect(mockRunPipeline).toHaveBeenCalledTimes(1);
      expect(mockRunPipeline).toHaveBeenCalledWith({
        query: mockJobData.query,
        pipelineRunId: mockJobData.pipelineRunId,
        maxResults: mockJobData.maxResults,
      });
      expect(result).toEqual({ success: true });
    });

    it('should pass undefined maxResults if not provided', async () => {
      const mockJobData = {
        query: 'Find AI startups in Europe',
        pipelineRunId: 'run-124',
      };
      const mockJob = { data: mockJobData, id: 'job-002' };
      mockRunPipeline.mockResolvedValueOnce({ success: true });

      startAgentWorker();
      await workerProcessor(mockJob);

      expect(mockRunPipeline).toHaveBeenCalledWith({
        query: mockJobData.query,
        pipelineRunId: mockJobData.pipelineRunId,
        maxResults: undefined,
      });
    });

    it('should pass 0 as maxResults if explicitly provided (boundary value)', async () => {
      const mockJobData = {
        query: 'Find AI startups',
        pipelineRunId: 'run-125',
        maxResults: 0,
      };
      const mockJob = { data: mockJobData, id: 'job-003' };
      mockRunPipeline.mockResolvedValueOnce({ success: true });

      startAgentWorker();
      await workerProcessor(mockJob);

      expect(mockRunPipeline).toHaveBeenCalledWith({
        query: mockJobData.query,
        pipelineRunId: mockJobData.pipelineRunId,
        maxResults: 0,
      });
    });

    it('should propagate errors if runPipeline rejects', async () => {
      const mockJobData = {
        query: 'Query causing an error',
        pipelineRunId: 'run-126',
      };
      const mockJob = { data: mockJobData, id: 'job-004' };
      const pipelineError = new Error('AI Model Timeout');
      mockRunPipeline.mockRejectedValueOnce(pipelineError);

      startAgentWorker();
      await expect(workerProcessor(mockJob)).rejects.toThrow('AI Model Timeout');
    });
  });

  describe('Worker "completed" Event Handler', () => {
    it('should log job.id on completed', () => {
      startAgentWorker();
      
      const mockWorker = mockCreateWorker.mock.results[0].value;
      const completedHandler = mockWorker.on.mock.calls.find(
        (call: any[]) => call[0] === 'completed'
      )![1];
      
      completedHandler({ id: 'job-999' });
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[AgentWorker] Pipeline completed: job-999'
      );
    });
  });

  describe('Worker "failed" Event Handler', () => {
    it('should log job.id and error message on failed', () => {
      startAgentWorker();

      const mockWorker = mockCreateWorker.mock.results[0].value;
      const failedHandler = mockWorker.on.mock.calls.find(
        (call: any[]) => call[0] === 'failed'
      )![1];

      const error = new Error('Redis connection lost');
      failedHandler({ id: 'job-888' }, error);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[AgentWorker] Pipeline failed: job-888',
        'Redis connection lost'
      );
    });

    it('should handle undefined job in failed event handler gracefully', () => {
      startAgentWorker();

      const mockWorker = mockCreateWorker.mock.results[0].value;
      const failedHandler = mockWorker.on.mock.calls.find(
        (call: any[]) => call[0] === 'failed'
      )![1];

      const error = new Error('Something went terribly wrong');
      failedHandler(undefined, error);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[AgentWorker] Pipeline failed: undefined',
        'Something went terribly wrong'
      );
    });
  });
});