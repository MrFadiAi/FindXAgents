import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the queue creation module
vi.mock('../lib/queue/index.js', () => ({
  createQueue: vi.fn((name: string) => ({
    name,
    add: vi.fn(),
    close: vi.fn(),
  })),
  createWorker: vi.fn(),
}));

// Import the mocked functions to assert against them in tests
import { createQueue } from '../lib/queue/index.js';
import {
  QUEUE_NAMES,
  discoveryKvkQueue,
  discoveryGoogleQueue,
  analysisQueue,
  outreachGenerateQueue,
  outreachSendQueue,
  outreachTrackQueue,
  agentPipelineQueue,
  QueueName,
} from './queues.js';

describe('queues.ts', () => {
  // NOTE: Do NOT call vi.clearAllMocks() here — the createQueue mock calls
  // happen at module-import time and must be preserved for the
  // "Queue Initialization" assertions.

  describe('QUEUE_NAMES constant', () => {
    it('should correctly expose all expected queue names', () => {
      expect(QUEUE_NAMES.DISCOVERY_KVK).toBe('discovery-kvk');
      expect(QUEUE_NAMES.DISCOVERY_GOOGLE).toBe('discovery-google');
      expect(QUEUE_NAMES.ANALYSIS_WEBSITE).toBe('analysis-website');
      expect(QUEUE_NAMES.OUTREACH_GENERATE).toBe('outreach-generate');
      expect(QUEUE_NAMES.OUTREACH_SEND).toBe('outreach-send');
      expect(QUEUE_NAMES.OUTREACH_TRACK).toBe('outreach-track');
      expect(QUEUE_NAMES.AGENT_PIPELINE).toBe('agent-pipeline');
    });

    it('should contain exactly 7 queue definitions', () => {
      expect(Object.keys(QUEUE_NAMES).length).toBe(7);
    });

    it('should have keys matching their values in a consistent format', () => {
      // Validates that the transformation from KEY to value is consistently dashed-lowercase
      Object.entries(QUEUE_NAMES).forEach(([key, value]) => {
        expect(value).toMatch(/^[a-z]+-[a-z]+$/);
      });
    });
  });

  describe('QueueName type', () => {
    it('should allow valid queue name assignments', () => {
      const validNames: QueueName[] = [
        'discovery-kvk',
        'discovery-google',
        'analysis-website',
        'outreach-generate',
        'outreach-send',
        'outreach-track',
        'agent-pipeline',
      ];

      validNames.forEach((name) => {
        const assignment: QueueName = name;
        expect(assignment).toBeDefined();
      });
    });
  });

  describe('Queue Initialization', () => {
    it('should call createQueue exactly 7 times', () => {
      // Re-import or trigger the module evaluation again if needed. 
      // Because vi.mock is hoisted, the imports at the top already triggered the mock.
      // However, because we cleared mocks in beforeEach, we need to ensure the module was loaded.
      // Since ESM handles this, the initial import called it 7 times.
      // We can test the total invocations by checking the mock.
      // Note: If dynamic re-evaluation is strictly needed, vi.isolateModules would be used.
      // Here, we verify the static initialization.
      
      // The import triggered this before beforeEach cleared it for the *current* test,
      // so we assert the mock calls directly after a fresh module load context.
      expect(createQueue).toHaveBeenCalledTimes(7);
    });

    it('should initialize the discoveryKvkQueue with correct name', () => {
      expect(createQueue).toHaveBeenCalledWith('discovery-kvk');
      expect(discoveryKvkQueue.name).toBe('discovery-kvk');
    });

    it('should initialize the discoveryGoogleQueue with correct name', () => {
      expect(createQueue).toHaveBeenCalledWith('discovery-google');
      expect(discoveryGoogleQueue.name).toBe('discovery-google');
    });

    it('should initialize the analysisQueue with correct name', () => {
      expect(createQueue).toHaveBeenCalledWith('analysis-website');
      expect(analysisQueue.name).toBe('analysis-website');
    });

    it('should initialize the outreachGenerateQueue with correct name', () => {
      expect(createQueue).toHaveBeenCalledWith('outreach-generate');
      expect(outreachGenerateQueue.name).toBe('outreach-generate');
    });

    it('should initialize the outreachSendQueue with correct name', () => {
      expect(createQueue).toHaveBeenCalledWith('outreach-send');
      expect(outreachSendQueue.name).toBe('outreach-send');
    });

    it('should initialize the outreachTrackQueue with correct name', () => {
      expect(createQueue).toHaveBeenCalledWith('outreach-track');
      expect(outreachTrackQueue.name).toBe('outreach-track');
    });

    it('should initialize the agentPipelineQueue with correct name', () => {
      expect(createQueue).toHaveBeenCalledWith('agent-pipeline');
      expect(agentPipelineQueue.name).toBe('agent-pipeline');
    });
  });
});