import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '../../lib/db/client.js';
import { analysisQueue, outreachGenerateQueue } from '../../workers/queues.js';
import { bulkAnalyze, bulkOutreach, bulkUpdateStatus } from './bulk-actions.js';

vi.mock('../../lib/db/client.js', () => ({
  prisma: {
    lead: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock('../../workers/queues.js', () => ({
  analysisQueue: {
    add: vi.fn(),
  },
  outreachGenerateQueue: {
    add: vi.fn(),
  },
}));

describe('bulkAnalyze', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should queue analysis for all leads with a website', async () => {
    const mockLeads = [
      { id: '1', website: 'https://example.com' },
      { id: '2', website: 'https://test.com' },
    ];
    vi.mocked(prisma.lead.findMany).mockResolvedValue(mockLeads);
    vi.mocked(analysisQueue.add).mockResolvedValue({} as any);

    const result = await bulkAnalyze(['1', '2']);

    expect(result).toEqual({
      queued: 2,
      skipped: 0,
      reason: '',
    });
    expect(analysisQueue.add).toHaveBeenCalledTimes(2);
    expect(analysisQueue.add).toHaveBeenCalledWith(
      'analysis:1',
      { leadId: '1', website: 'https://example.com' },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );
    expect(analysisQueue.add).toHaveBeenCalledWith(
      'analysis:2',
      { leadId: '2', website: 'https://test.com' },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );
  });

  it('should skip leads that have no website', async () => {
    const mockLeads = [
      { id: '1', website: 'https://example.com' },
      { id: '2', website: null },
      { id: '3', website: null },
    ];
    vi.mocked(prisma.lead.findMany).mockResolvedValue(mockLeads);

    const result = await bulkAnalyze(['1', '2', '3']);

    expect(result).toEqual({
      queued: 1,
      skipped: 2,
      reason: '2 leads have no website',
    });
    expect(analysisQueue.add).toHaveBeenCalledTimes(1);
  });

  it('should skip all leads if none have websites', async () => {
    const mockLeads = [
      { id: '1', website: null },
      { id: '2', website: null },
    ];
    vi.mocked(prisma.lead.findMany).mockResolvedValue(mockLeads);

    const result = await bulkAnalyze(['1', '2']);

    expect(result).toEqual({
      queued: 0,
      skipped: 2,
      reason: '2 leads have no website',
    });
    expect(analysisQueue.add).not.toHaveBeenCalled();
  });

  it('should handle an empty array of lead IDs', async () => {
    vi.mocked(prisma.lead.findMany).mockResolvedValue([]);

    const result = await bulkAnalyze([]);

    expect(result).toEqual({
      queued: 0,
      skipped: 0,
      reason: '',
    });
    expect(analysisQueue.add).not.toHaveBeenCalled();
  });

  it('should throw an error if the database query fails', async () => {
    vi.mocked(prisma.lead.findMany).mockRejectedValue(new Error('DB Error'));

    await expect(bulkAnalyze(['1'])).rejects.toThrow('DB Error');
  });

  it('should throw an error if adding to the queue fails', async () => {
    const mockLeads = [{ id: '1', website: 'https://example.com' }];
    vi.mocked(prisma.lead.findMany).mockResolvedValue(mockLeads);
    vi.mocked(analysisQueue.add).mockRejectedValue(new Error('Queue Error'));

    await expect(bulkAnalyze(['1'])).rejects.toThrow('Queue Error');
  });
});

describe('bulkOutreach', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should queue outreach generation for eligible leads', async () => {
    const mockLeads = [{ id: '1' }, { id: '2' }];
    vi.mocked(prisma.lead.findMany).mockResolvedValue(mockLeads);
    vi.mocked(outreachGenerateQueue.add).mockResolvedValue({} as any);

    const result = await bulkOutreach(['1', '2']);

    expect(result).toEqual({
      queued: 2,
      skipped: 0,
      reason: '',
    });
    expect(outreachGenerateQueue.add).toHaveBeenCalledTimes(2);
    expect(outreachGenerateQueue.add).toHaveBeenCalledWith(
      'outreach:generate:1',
      { leadId: '1', tone: undefined, language: undefined },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );
  });

  it('should pass provided options (tone and language) to the queue', async () => {
    const mockLeads = [{ id: '1' }];
    vi.mocked(prisma.lead.findMany).mockResolvedValue(mockLeads);
    vi.mocked(outreachGenerateQueue.add).mockResolvedValue({} as any);

    const opts = { tone: 'formal', language: 'en' };
    await bulkOutreach(['1'], opts);

    expect(outreachGenerateQueue.add).toHaveBeenCalledWith(
      'outreach:generate:1',
      { leadId: '1', tone: 'formal', language: 'en' },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );
  });

  it('should skip leads that do not have analyses', async () => {
    // DB returns only 1 out of 3 requested IDs because others lack analyses
    const mockLeads = [{ id: '1' }];
    vi.mocked(prisma.lead.findMany).mockResolvedValue(mockLeads);

    const result = await bulkOutreach(['1', '2', '3']);

    expect(result).toEqual({
      queued: 1,
      skipped: 2,
      reason: '2 leads were not analyzed yet',
    });
    expect(outreachGenerateQueue.add).toHaveBeenCalledTimes(1);
  });

  it('should skip all leads if none have analyses', async () => {
    vi.mocked(prisma.lead.findMany).mockResolvedValue([]);

    const result = await bulkOutreach(['1', '2']);

    expect(result).toEqual({
      queued: 0,
      skipped: 2,
      reason: '2 leads were not analyzed yet',
    });
    expect(outreachGenerateQueue.add).not.toHaveBeenCalled();
  });

  it('should handle an empty array of lead IDs', async () => {
    vi.mocked(prisma.lead.findMany).mockResolvedValue([]);

    const result = await bulkOutreach([]);

    expect(result).toEqual({
      queued: 0,
      skipped: 0,
      reason: '',
    });
    expect(outreachGenerateQueue.add).not.toHaveBeenCalled();
  });

  it('should throw an error if the database query fails', async () => {
    vi.mocked(prisma.lead.findMany).mockRejectedValue(new Error('DB Error'));

    await expect(bulkOutreach(['1'])).rejects.toThrow('DB Error');
  });

  it('should throw an error if adding to the queue fails', async () => {
    const mockLeads = [{ id: '1' }];
    vi.mocked(prisma.lead.findMany).mockResolvedValue(mockLeads);
    vi.mocked(outreachGenerateQueue.add).mockRejectedValue(new Error('Queue Error'));

    await expect(bulkOutreach(['1'])).rejects.toThrow('Queue Error');
  });
});

describe('bulkUpdateStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should update the status of multiple leads', async () => {
    vi.mocked(prisma.lead.updateMany).mockResolvedValue({ count: 3 });

    const result = await bulkUpdateStatus(['1', '2', '3'], 'QUALIFIED');

    expect(result).toEqual({ updated: 3 });
    expect(prisma.lead.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['1', '2', '3'] } },
      data: { status: 'QUALIFIED' },
    });
  });

  it('should return updated: 0 if no leads matched the IDs', async () => {
    vi.mocked(prisma.lead.updateMany).mockResolvedValue({ count: 0 });

    const result = await bulkUpdateStatus(['non-existent-id'], 'QUALIFIED');

    expect(result).toEqual({ updated: 0 });
  });

  it('should handle an empty array of lead IDs', async () => {
    vi.mocked(prisma.lead.updateMany).mockResolvedValue({ count: 0 });

    const result = await bulkUpdateStatus([], 'QUALIFIED');

    expect(result).toEqual({ updated: 0 });
    expect(prisma.lead.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [] } },
      data: { status: 'QUALIFIED' },
    });
  });

  it('should correctly handle different valid statuses', async () => {
    vi.mocked(prisma.lead.updateMany).mockResolvedValue({ count: 1 });

    await bulkUpdateStatus(['1'], 'REJECTED');
    expect(prisma.lead.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['1'] } },
      data: { status: 'REJECTED' },
    });

    await bulkUpdateStatus(['2'], 'CONTACTED');
    expect(prisma.lead.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['2'] } },
      data: { status: 'CONTACTED' },
    });
  });

  it('should throw an error if the database update fails', async () => {
    vi.mocked(prisma.lead.updateMany).mockRejectedValue(new Error('DB Error'));

    await expect(bulkUpdateStatus(['1'], 'QUALIFIED')).rejects.toThrow('DB Error');
  });
});