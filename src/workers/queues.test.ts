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
  emailSchedulerQueue,
  emailFollowUpQueue,
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
      expect(QUEUE_NAMES.EMAIL_SCHEDULER).toBe('email-scheduler');
      expect(QUEUE_NAMES.EMAIL_FOLLOWUP).toBe('email-followup');
    });

    it('should contain exactly 9 queue definitions', () => {
      expect(Object.keys(QUEUE_NAMES).length).toBe(9);
    });

    it('should have keys matching their values in a consistent format', () => {
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
        'email-scheduler',
        'email-followup',
      ];

      validNames.forEach((name) => {
        const assignment: QueueName = name;
        expect(assignment).toBeDefined();
      });
    });
  });

  describe('Queue Initialization', () => {
    it('should call createQueue exactly 9 times', () => {
      expect(createQueue).toHaveBeenCalledTimes(9);
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

    it('should initialize the emailSchedulerQueue with correct name', () => {
      expect(createQueue).toHaveBeenCalledWith('email-scheduler');
      expect(emailSchedulerQueue.name).toBe('email-scheduler');
    });

    it('should initialize the emailFollowUpQueue with correct name', () => {
      expect(createQueue).toHaveBeenCalledWith('email-followup');
      expect(emailFollowUpQueue.name).toBe('email-followup');
    });
  });
});