import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --- Mocks must be defined before importing the modules that use them ---

vi.mock('../lib/queue/index.js', () => ({
  createWorker: vi.fn(),
}));

vi.mock('./queues.js', () => ({
  QUEUE_NAMES: {
    DISCOVERY_KVK: 'discovery:kvk',
    DISCOVERY_GOOGLE: 'discovery:google',
  },
}));

vi.mock('../modules/discovery/discovery.service.js', () => {
  return {
    DiscoveryService: vi.fn().mockImplementation(() => ({
      discover: vi.fn(),
    })),
  };
});

// Suppress console output during tests
vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'warn').mockImplementation(() => {});

// Import mocked modules after vi.mock setup
import { createWorker } from '../lib/queue/index.js';
import { QUEUE_NAMES } from './queues.js';
import { DiscoveryService } from '../modules/discovery/discovery.service.js';
import { startDiscoveryWorkers, DiscoveryJobData } from './discovery.js';

describe('startDiscoveryWorkers', () => {
  let mockDiscover: ReturnType<typeof vi.fn>;
  let kvkWorkerCallback: (job: any) => Promise<any>;
  let googleWorkerCallback: (job: any) => Promise<any>;

  const successfulResult = {
    newLeads: 5,
    duplicates: 2,
    existingEnriched: 1,
    errors: [],
  };

  const resultWithErrors = {
    newLeads: 0,
    duplicates: 0,
    existingEnriched: 0,
    errors: ['TimeoutError', 'RateLimitError'],
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Intercept the callback functions passed to createWorker for each queue
    createWorker.mockImplementation((queueName: string, callback: (job: any) => Promise<any>) => {
      if (queueName === QUEUE_NAMES.DISCOVERY_KVK) {
        kvkWorkerCallback = callback;
      } else if (queueName === QUEUE_NAMES.DISCOVERY_GOOGLE) {
        googleWorkerCallback = callback;
      }
      return { isRunning: true }; // Mock worker instance
    });

    // Instance method mock setup
    mockDiscover = vi.fn().mockResolvedValue(successfulResult);
    (DiscoveryService as any).mockImplementation(() => ({
      discover: mockDiscover,
    }));
  });

  it('should initialize and return a kvkWorker and a googleWorker', () => {
    const workers = startDiscoveryWorkers();

    expect(DiscoveryService).toHaveBeenCalledOnce();
    expect(createWorker).toHaveBeenCalledTimes(2);
    expect(workers.kvkWorker).toEqual({ isRunning: true });
    expect(workers.googleWorker).toEqual({ isRunning: true });

    expect(createWorker).toHaveBeenCalledWith(
      QUEUE_NAMES.DISCOVERY_KVK,
      expect.any(Function)
    );
    expect(createWorker).toHaveBeenCalledWith(
      QUEUE_NAMES.DISCOVERY_GOOGLE,
      expect.any(Function)
    );
  });

  describe('KVK Discovery Worker', () => {
    const mockJob: { id: string; data: DiscoveryJobData } = {
      id: 'kvk-job-123',
      data: {
        source: 'kvk',
        city: 'Amsterdam',
        industry: 'Tech',
        sbiCode: '6201',
        limit: 50,
      },
    };

    it('should call service.discover with the correct mapped KVK parameters', async () => {
      startDiscoveryWorkers();

      await kvkWorkerCallback(mockJob);

      expect(mockDiscover).toHaveBeenCalledOnce();
      expect(mockDiscover).toHaveBeenCalledWith({
        city: 'Amsterdam',
        industry: 'Tech',
        sbiCode: '6201',
        limit: 50,
        sources: ['kvk'],
      });
    });

    it('should handle missing optional fields gracefully', async () => {
      startDiscoveryWorkers();

      const minimalJob = {
        id: 'kvk-job-124',
        data: { source: 'kvk' as const },
      };

      await kvkWorkerCallback(minimalJob);

      expect(mockDiscover).toHaveBeenCalledWith({
        city: undefined,
        industry: undefined,
        sbiCode: undefined,
        limit: undefined,
        sources: ['kvk'],
      });
    });

    it('should return the result from the discovery service', async () => {
      startDiscoveryWorkers();

      const result = await kvkWorkerCallback(mockJob);

      expect(result).toEqual(successfulResult);
    });

    it('should log console warnings if result contains errors', async () => {
      mockDiscover.mockResolvedValue(resultWithErrors);
      startDiscoveryWorkers();

      await kvkWorkerCallback(mockJob);

      expect(console.warn).toHaveBeenCalledWith(
        `[KVK Discovery] Errors:`,
        resultWithErrors.errors
      );
    });

    it('should not log console warnings if result contains no errors', async () => {
      startDiscoveryWorkers();

      await kvkWorkerCallback(mockJob);

      expect(console.warn).not.toHaveBeenCalled();
    });

    it('should propagate errors if the discovery service throws', async () => {
      const error = new Error('API Down');
      mockDiscover.mockRejectedValue(error);
      startDiscoveryWorkers();

      await expect(kvkWorkerCallback(mockJob)).rejects.toThrow('API Down');
    });
  });

  describe('Google Discovery Worker', () => {
    const mockJob: { id: string; data: DiscoveryJobData } = {
      id: 'google-job-456',
      data: {
        source: 'google',
        city: 'Rotterdam',
        industry: 'Marketing',
        limit: 15,
      },
    };

    it('should call service.discover with the correct mapped Google parameters', async () => {
      startDiscoveryWorkers();

      await googleWorkerCallback(mockJob);

      expect(mockDiscover).toHaveBeenCalledOnce();
      expect(mockDiscover).toHaveBeenCalledWith({
        city: 'Rotterdam',
        industry: 'Marketing',
        limit: 15,
        sources: ['google'],
      });
    });

    it('should omit sbiCode when calling service.discover for Google', async () => {
      startDiscoveryWorkers();

      // Passing sbiCode in data, which shouldn't be utilized
      const jobWithSbi = {
        id: 'google-job-457',
        data: {
          source: 'google' as const,
          city: 'Utrecht',
          sbiCode: '9999',
        },
      };

      await googleWorkerCallback(jobWithSbi);

      expect(mockDiscover).toHaveBeenCalledWith(
        expect.objectContaining({
          sources: ['google'],
        })
      );

      // Ensure sbiCode is not part of the Google discover payload
      const calledArgs = mockDiscover.mock.calls[0][0];
      expect(calledArgs).not.toHaveProperty('sbiCode');
    });

    it('should return the result from the discovery service', async () => {
      startDiscoveryWorkers();

      const result = await googleWorkerCallback(mockJob);

      expect(result).toEqual(successfulResult);
    });

    it('should log console warnings if result contains errors', async () => {
      mockDiscover.mockResolvedValue(resultWithErrors);
      startDiscoveryWorkers();

      await googleWorkerCallback(mockJob);

      expect(console.warn).toHaveBeenCalledWith(
        `[Google Discovery] Errors:`,
        resultWithErrors.errors
      );
    });

    it('should not log console warnings if result contains no errors', async () => {
      startDiscoveryWorkers();

      await googleWorkerCallback(mockJob);

      expect(console.warn).not.toHaveBeenCalled();
    });

    it('should propagate errors if the discovery service throws', async () => {
      const error = new Error('Rate Limit Exceeded');
      mockDiscover.mockRejectedValue(error);
      startDiscoveryWorkers();

      await expect(googleWorkerCallback(mockJob)).rejects.toThrow('Rate Limit Exceeded');
    });
  });
});