import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startAnalysisWorker } from './analysis';
import { createWorker } from '../lib/queue/index.js';
import { analyzeWebsite } from '../modules/analyzer/analyzer.service.js';
import { QUEUE_NAMES } from './queues.js';

vi.mock('../lib/queue/index.js', () => ({
  createWorker: vi.fn(),
}));

vi.mock('../modules/analyzer/analyzer.service.js', () => ({
  analyzeWebsite: vi.fn(),
}));

vi.mock('./queues.js', () => ({
  QUEUE_NAMES: {
    ANALYSIS_WEBSITE: 'ANALYSIS_WEBSITE',
  },
}));

describe('startAnalysisWorker', () => {
  let mockJob: any;
  let mockWorker: any;
  let mockWorkerOn: ReturnType<typeof vi.fn>;
  let capturedProcessor: Function;
  let capturedCompletedHandler: Function;
  let capturedFailedHandler: Function;
  let consoleLogSpy: any;
  let consoleErrorSpy: any;

  beforeEach(() => {
    vi.restoreAllMocks();

    mockJob = {
      id: 'job-123',
      data: {
        leadId: 'lead-456',
        website: 'https://example.com',
      },
    };

    capturedCompletedHandler = vi.fn();
    capturedFailedHandler = vi.fn();

    mockWorkerOn = vi.fn((event: string, handler: Function) => {
      if (event === 'completed') {
        capturedCompletedHandler = handler;
      }
      if (event === 'failed') {
        capturedFailedHandler = handler;
      }
    });

    mockWorker = {
      on: mockWorkerOn,
    };

    (createWorker as any).mockImplementation(
      (queueName: string, processor: Function) => {
        capturedProcessor = processor;
        return mockWorker;
      },
    );

    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('should create a worker with the ANALYSIS_WEBSITE queue name', () => {
    startAnalysisWorker();

    expect(createWorker).toHaveBeenCalledExactlyOnceWith(
      QUEUE_NAMES.ANALYSIS_WEBSITE,
      expect.any(Function),
    );
  });

  it('should return the created worker instance', () => {
    const worker = startAnalysisWorker();

    expect(worker).toBe(mockWorker);
  });

  it('should register "completed" and "failed" event handlers on the worker', () => {
    startAnalysisWorker();

    expect(mockWorkerOn).toHaveBeenCalledWith('completed', expect.any(Function));
    expect(mockWorkerOn).toHaveBeenCalledWith('failed', expect.any(Function));
    expect(mockWorkerOn).toHaveBeenCalledTimes(2);
  });

  describe('Worker Processor', () => {
    it('should call analyzeWebsite with the correct arguments including includePdf: true', async () => {
      const mockResult = {
        overallScore: 85,
        findings: [{ id: 1 }, { id: 2 }],
        opportunities: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      };
      (analyzeWebsite as any).mockResolvedValue(mockResult);

      await capturedProcessor(mockJob);

      expect(analyzeWebsite).toHaveBeenCalledExactlyOnceWith(
        { leadId: 'lead-456', url: 'https://example.com' },
        { includePdf: true },
      );
    });

    it('should return the correctly mapped result on the happy path', async () => {
      const mockResult = {
        overallScore: 92,
        findings: [{ id: 1 }, { id: 2 }, { id: 3 }],
        opportunities: [{ id: 'a' }],
      };
      (analyzeWebsite as any).mockResolvedValue(mockResult);

      const result = await capturedProcessor(mockJob);

      expect(result).toEqual({
        leadId: 'lead-456',
        overallScore: 92,
        findingsCount: 3,
        opportunitiesCount: 1,
      });
    });

    it('should log processing and completion messages on the happy path', async () => {
      const mockResult = {
        overallScore: 50,
        findings: [],
        opportunities: [],
      };
      (analyzeWebsite as any).mockResolvedValue(mockResult);

      await capturedProcessor(mockJob);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[Analysis] Processing job job-123 for https://example.com',
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[Analysis] Completed for https://example.com — Score: 50/100, Findings: 0, Opportunities: 0',
      );
    });

    it('should propagate errors if analyzeWebsite throws', async () => {
      const analysisError = new Error('AI Service Unavailable');
      (analyzeWebsite as any).mockRejectedValue(analysisError);

      await expect(capturedProcessor(mockJob)).rejects.toThrow('AI Service Unavailable');
    });

    it('should handle boundary values: score of 0 and empty arrays', async () => {
      const mockResult = {
        overallScore: 0,
        findings: [],
        opportunities: [],
      };
      (analyzeWebsite as any).mockResolvedValue(mockResult);

      const result = await capturedProcessor(mockJob);

      expect(result).toEqual({
        leadId: 'lead-456',
        overallScore: 0,
        findingsCount: 0,
        opportunitiesCount: 0,
      });
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Score: 0/100, Findings: 0, Opportunities: 0'),
      );
    });

    it('should handle boundary values: score of 100 and populated arrays', async () => {
      const findings = Array.from({ length: 10 }, (_, i) => ({ id: i }));
      const opportunities = Array.from({ length: 5 }, (_, i) => ({ id: i }));

      const mockResult = {
        overallScore: 100,
        findings,
        opportunities,
      };
      (analyzeWebsite as any).mockResolvedValue(mockResult);

      const result = await capturedProcessor(mockJob);

      expect(result).toEqual({
        leadId: 'lead-456',
        overallScore: 100,
        findingsCount: 10,
        opportunitiesCount: 5,
      });
    });
  });

  describe('Worker Event Handlers', () => {
    beforeEach(() => {
      startAnalysisWorker();
    });

    it('should log success message when "completed" event is triggered', () => {
      const completedJob = { id: 'job-completed-999' };

      capturedCompletedHandler(completedJob);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[Analysis] Job job-completed-999 completed successfully',
      );
    });

    it('should log error message when "failed" event is triggered with a job', () => {
      const failedJob = { id: 'job-failed-001' };
      const error = new Error('Timeout exceeded');

      capturedFailedHandler(failedJob, error);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[Analysis] Job job-failed-001 failed:',
        'Timeout exceeded',
      );
    });

    it('should handle "failed" event gracefully if job is null/undefined', () => {
      const error = new Error('Queue internal error');

      capturedFailedHandler(null, error);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[Analysis] Job undefined failed:',
        'Queue internal error',
      );
    });
  });
});