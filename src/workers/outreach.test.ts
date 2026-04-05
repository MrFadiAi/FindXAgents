import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { 
  startOutreachWorkers,
  OutreachGenerateJobData,
  OutreachSendJobData,
  OutreachTrackJobData,
} from '../../src/workers/outreach';
import { QUEUE_NAMES } from '../../src/workers/queues';
import {
  processGenerateJob,
  processSendJob,
  processTrackJob,
} from '../../src/modules/outreach/outreach.service';

vi.mock('../../src/lib/queue/index.js', () => ({
  createQueue: vi.fn(() => ({
    add: vi.fn(),
    close: vi.fn(),
  })),
  createWorker: vi.fn((queueName, processor) => {
    return {
      queueName,
      processor
    };
  }),
}));

vi.mock('../../src/modules/outreach/outreach.service.js', () => ({
  processGenerateJob: vi.fn(),
  processSendJob: vi.fn(),
  processTrackJob: vi.fn(),
}));

describe('startOutreachWorkers', () => {
  const originalLog = console.log;
  
  beforeEach(() => {
    vi.clearAllMocks();
    console.log = vi.fn();
  });

  afterEach(() => {
    console.log = originalLog;
  });

  it('should return an object containing generateWorker, sendWorker, and trackWorker', () => {
    const workers = startOutreachWorkers();
    expect(workers).toHaveProperty('generateWorker');
    expect(workers).toHaveProperty('sendWorker');
    expect(workers).toHaveProperty('trackWorker');
    expect(typeof workers.generateWorker).toBe('object');
    expect(typeof workers.sendWorker).toBe('object');
    expect(typeof workers.trackWorker).toBe('object');
  });

  it('should call createWorker exactly three times', async () => {
    startOutreachWorkers();
    const { createWorker } = await import('../../src/lib/queue/index.js');
    expect(createWorker).toHaveBeenCalledTimes(3);
  });

  describe('generateWorker', () => {
    it('should be created with the OUTREACH_GENERATE queue name', async () => {
      startOutreachWorkers();
      const { createWorker } = await import('../../src/lib/queue/index.js');
      expect(createWorker).toHaveBeenCalledWith(
        QUEUE_NAMES.OUTREACH_GENERATE,
        expect.any(Function)
      );
    });

    it('should process a generate job and return the outreach result', async () => {
      const mockJob = { 
        id: 'job-123', 
        data: { leadId: 'lead-999', tone: 'friendly' as const } 
      };
      const mockResult = { outreachId: 'outreach-456' };
      
      (processGenerateJob as vi.Mock).mockResolvedValue(mockResult);

      const { createWorker } = await import('../../src/lib/queue/index.js');
      startOutreachWorkers();
      
      const generateProcessor = (createWorker as vi.Mock).mock.calls[0][1];
      const result = await generateProcessor(mockJob);

      expect(processGenerateJob).toHaveBeenCalledWith(mockJob.data);
      expect(result).toEqual(mockResult);
    });

    it('should log the start and completion of the generate job', async () => {
      const mockJob = { 
        id: 'job-123', 
        data: { leadId: 'lead-999', analysisId: 'analysis-111' } 
      };
      const mockResult = { outreachId: 'outreach-456' };
      
      (processGenerateJob as vi.Mock).mockResolvedValue(mockResult);

      const { createWorker } = await import('../../src/lib/queue/index.js');
      startOutreachWorkers();
      
      const generateProcessor = (createWorker as vi.Mock).mock.calls[0][1];
      await generateProcessor(mockJob);

      expect(console.log).toHaveBeenCalledWith(
        `[Outreach Generate] Processing job ${mockJob.id} for lead ${mockJob.data.leadId}`
      );
      expect(console.log).toHaveBeenCalledWith(
        `[Outreach Generate] Job ${mockJob.id} complete — outreach ${mockResult.outreachId}`
      );
    });

    it('should propagate errors thrown by processGenerateJob', async () => {
      const mockJob = { id: 'job-err', data: { leadId: 'lead-err' } };
      const error = new Error('AI generation failed');
      
      (processGenerateJob as vi.Mock).mockRejectedValue(error);

      const { createWorker } = await import('../../src/lib/queue/index.js');
      startOutreachWorkers();
      
      const generateProcessor = (createWorker as vi.Mock).mock.calls[0][1];
      await expect(generateProcessor(mockJob)).rejects.toThrow('AI generation failed');
    });

    it('should handle edge case where analysisId and tone are omitted', async () => {
      const mockJob = { id: 'job-min', data: { leadId: 'lead-min' } };
      const mockResult = { outreachId: 'outreach-min' };
      
      (processGenerateJob as vi.Mock).mockResolvedValue(mockResult);

      const { createWorker } = await import('../../src/lib/queue/index.js');
      startOutreachWorkers();
      
      const generateProcessor = (createWorker as vi.Mock).mock.calls[0][1];
      const result = await generateProcessor(mockJob);

      expect(processGenerateJob).toHaveBeenCalledWith({ leadId: 'lead-min' });
      expect(result).toEqual(mockResult);
    });
  });

  describe('sendWorker', () => {
    it('should be created with the OUTREACH_SEND queue name', async () => {
      startOutreachWorkers();
      const { createWorker } = await import('../../src/lib/queue/index.js');
      expect(createWorker).toHaveBeenCalledWith(
        QUEUE_NAMES.OUTREACH_SEND,
        expect.any(Function)
      );
    });

    it('should process a send job and return the send result', async () => {
      const mockJob = { id: 'job-send-1', data: { outreachId: 'outreach-789' } };
      const mockResult = { sent: true };
      
      (processSendJob as vi.Mock).mockResolvedValue(mockResult);

      const { createWorker } = await import('../../src/lib/queue/index.js');
      startOutreachWorkers();
      
      const sendProcessor = (createWorker as vi.Mock).mock.calls[1][1];
      const result = await sendProcessor(mockJob);

      expect(processSendJob).toHaveBeenCalledWith(mockJob.data);
      expect(result).toEqual(mockResult);
    });

    it('should log the start and completion of the send job', async () => {
      const mockJob = { id: 'job-send-2', data: { outreachId: 'outreach-000' } };
      const mockResult = { sent: true };
      
      (processSendJob as vi.Mock).mockResolvedValue(mockResult);

      const { createWorker } = await import('../../src/lib/queue/index.js');
      startOutreachWorkers();
      
      const sendProcessor = (createWorker as vi.Mock).mock.calls[1][1];
      await sendProcessor(mockJob);

      expect(console.log).toHaveBeenCalledWith(
        `[Outreach Send] Processing job ${mockJob.id} for outreach ${mockJob.data.outreachId}`
      );
      expect(console.log).toHaveBeenCalledWith(
        `[Outreach Send] Job ${mockJob.id} complete — sent: ${mockResult.sent}`
      );
    });

    it('should propagate errors thrown by processSendJob', async () => {
      const mockJob = { id: 'job-send-err', data: { outreachId: 'outreach-err' } };
      const error = new Error('SMTP server timeout');
      
      (processSendJob as vi.Mock).mockRejectedValue(error);

      const { createWorker } = await import('../../src/lib/queue/index.js');
      startOutreachWorkers();
      
      const sendProcessor = (createWorker as vi.Mock).mock.calls[1][1];
      await expect(sendProcessor(mockJob)).rejects.toThrow('SMTP server timeout');
    });

    it('should successfully process a job that returns sent: false', async () => {
      const mockJob = { id: 'job-send-fail', data: { outreachId: 'outreach-fail' } };
      const mockResult = { sent: false };
      
      (processSendJob as vi.Mock).mockResolvedValue(mockResult);

      const { createWorker } = await import('../../src/lib/queue/index.js');
      startOutreachWorkers();
      
      const sendProcessor = (createWorker as vi.Mock).mock.calls[1][1];
      const result = await sendProcessor(mockJob);

      expect(result).toEqual({ sent: false });
      expect(console.log).toHaveBeenCalledWith(
        `[Outreach Send] Job ${mockJob.id} complete — sent: false`
      );
    });
  });

  describe('trackWorker', () => {
    it('should be created with the OUTREACH_TRACK queue name', async () => {
      startOutreachWorkers();
      const { createWorker } = await import('../../src/lib/queue/index.js');
      expect(createWorker).toHaveBeenCalledWith(
        QUEUE_NAMES.OUTREACH_TRACK,
        expect.any(Function)
      );
    });

    it('should process a track job and return undefined (void)', async () => {
      const mockJob: OutreachTrackJobData = { 
        id: 'job-track-1', 
        data: { 
          outreachId: 'outreach-111', 
          event: 'open', 
          timestamp: new Date().toISOString() 
        } 
      };
      
      (processTrackJob as vi.Mock).mockResolvedValue(undefined);

      const { createWorker } = await import('../../src/lib/queue/index.js');
      startOutreachWorkers();
      
      const trackProcessor = (createWorker as vi.Mock).mock.calls[2][1];
      const result = await trackProcessor(mockJob);

      expect(processTrackJob).toHaveBeenCalledWith(mockJob.data);
      expect(result).toBeUndefined();
    });

    it('should log the start and completion of the track job', async () => {
      const mockJob: OutreachTrackJobData = { 
        id: 'job-track-2', 
        data: { 
          outreachId: 'outreach-222', 
          event: 'reply', 
          timestamp: new Date().toISOString() 
        } 
      };
      
      (processTrackJob as vi.Mock).mockResolvedValue(undefined);

      const { createWorker } = await import('../../src/lib/queue/index.js');
      startOutreachWorkers();
      
      const trackProcessor = (createWorker as vi.Mock).mock.calls[2][1];
      await trackProcessor(mockJob);

      expect(console.log).toHaveBeenCalledWith(
        `[Outreach Track] Processing job ${mockJob.id} — ${mockJob.data.event} for outreach ${mockJob.data.outreachId}`
      );
      expect(console.log).toHaveBeenCalledWith(
        `[Outreach Track] Job ${mockJob.id} complete`
      );
    });

    it('should propagate errors thrown by processTrackJob', async () => {
      const mockJob: OutreachTrackJobData = { 
        id: 'job-track-err', 
        data: { 
          outreachId: 'outreach-err', 
          event: 'bounce', 
          timestamp: new Date().toISOString() 
        } 
      };
      const error = new Error('Webhook delivery failed');
      
      (processTrackJob as vi.Mock).mockRejectedValue(error);

      const { createWorker } = await import('../../src/lib/queue/index.js');
      startOutreachWorkers();
      
      const trackProcessor = (createWorker as vi.Mock).mock.calls[2][1];
      await expect(trackProcessor(mockJob)).rejects.toThrow('Webhook delivery failed');
    });

    it('should handle all valid event types: open, reply, bounce', async () => {
      const { createWorker } = await import('../../src/lib/queue/index.js');
      startOutreachWorkers();
      const trackProcessor = (createWorker as vi.Mock).mock.calls[2][1];

      const events: Array<'open' | 'reply' | 'bounce'> = ['open', 'reply', 'bounce'];
      
      for (const event of events) {
        const mockJob = { 
          id: `job-${event}`, 
          data: { 
            outreachId: `outreach-${event}`, 
            event, 
            timestamp: new Date().toISOString() 
          } 
        };
        
        (processTrackJob as vi.Mock).mockResolvedValue(undefined);
        await trackProcessor(mockJob);
        
        expect(processTrackJob).toHaveBeenCalledWith(mockJob.data);
      }
      
      expect(processTrackJob).toHaveBeenCalledTimes(3);
    });
  });
});