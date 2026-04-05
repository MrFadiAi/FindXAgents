import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('node:dns/promises', () => ({
  resolveMx: vi.fn(),
  resolve4: vi.fn(),
}));

import { resolveMx, resolve4 } from 'node:dns/promises';
import { checkMxTool } from './check-mx.js';

describe('checkMxTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('tool configuration', () => {
    it('should have correct name and description', () => {
      expect(checkMxTool.name).toBe('check_mx');
      expect(checkMxTool.description).toContain('MX');
      expect(checkMxTool.description).toContain('email');
    });

    it('should define input_schema with domain as required string', () => {
      expect(checkMxTool.input_schema).toEqual({
        type: 'object',
        properties: {
          domain: {
            type: 'string',
            description: expect.any(String),
          },
        },
        required: ['domain'],
      });
    });
  });

  describe('execute', () => {
    it('should return valid status with sorted MX records', async () => {
      vi.mocked(resolveMx).mockResolvedValue([
        { exchange: 'MAIL.Example.com', priority: 20 },
        { exchange: 'fallback.example.com', priority: 10 },
      ] as any);

      const result = await checkMxTool.execute({ domain: 'example.com' });
      const parsed = JSON.parse(result);

      expect(parsed).toEqual({
        domain: 'example.com',
        status: 'valid',
        canReceiveEmail: true,
        mxRecords: [
          { exchange: 'fallback.example.com', priority: 10 },
          { exchange: 'mail.example.com', priority: 20 },
        ],
        note: undefined,
      });

      expect(resolveMx).toHaveBeenCalledWith('example.com');
      expect(resolve4).not.toHaveBeenCalled();
    });

    it('should strip http:// and trailing slashes from domain', async () => {
      vi.mocked(resolveMx).mockResolvedValue([
        { exchange: 'mx.example.com', priority: 10 },
      ] as any);

      const result = await checkMxTool.execute({ domain: 'http://example.com/some/path' });
      const parsed = JSON.parse(result);

      expect(parsed.domain).toBe('example.com');
      expect(resolveMx).toHaveBeenCalledWith('example.com');
    });

    it('should strip https:// and trailing slashes from domain', async () => {
      vi.mocked(resolveMx).mockResolvedValue([
        { exchange: 'mx.example.com', priority: 10 },
      ] as any);

      const result = await checkMxTool.execute({ domain: 'https://example.com/' });
      const parsed = JSON.parse(result);

      expect(parsed.domain).toBe('example.com');
    });

    it('should convert domain to lowercase', async () => {
      vi.mocked(resolveMx).mockResolvedValue([
        { exchange: 'MX.EXAMPLE.COM', priority: 10 },
      ] as any);

      const result = await checkMxTool.execute({ domain: 'EXAMPLE.COM' });
      const parsed = JSON.parse(result);

      expect(parsed.domain).toBe('example.com');
      expect(parsed.mxRecords[0].exchange).toBe('mx.example.com');
    });

    it('should return fallback status when no MX records but A record exists', async () => {
      vi.mocked(resolveMx).mockRejectedValue(new Error('ENOTFOUND'));
      vi.mocked(resolve4).mockResolvedValue([{ address: '93.184.216.34', ttl: 300 } as any]);

      const result = await checkMxTool.execute({ domain: 'example.com' });
      const parsed = JSON.parse(result);

      expect(parsed).toEqual({
        domain: 'example.com',
        status: 'fallback',
        canReceiveEmail: true,
        mxRecords: [],
        note: 'No MX records found but domain has A record. Some mailers use A record as fallback.',
      });

      expect(resolve4).toHaveBeenCalledWith('example.com');
    });

    it('should return invalid status when neither MX nor A records exist', async () => {
      vi.mocked(resolveMx).mockRejectedValue(new Error('ENOTFOUND'));
      vi.mocked(resolve4).mockRejectedValue(new Error('ENOTFOUND'));

      const result = await checkMxTool.execute({ domain: 'nonexistent.example' });
      const parsed = JSON.parse(result);

      expect(parsed).toEqual({
        domain: 'nonexistent.example',
        status: 'invalid',
        canReceiveEmail: false,
        mxRecords: [],
        note: 'No MX or A records found. This domain cannot receive email.',
      });
    });

    it('should return invalid status when resolve4 returns empty array', async () => {
      vi.mocked(resolveMx).mockRejectedValue(new Error('ENOTFOUND'));
      vi.mocked(resolve4).mockResolvedValue([]);

      const result = await checkMxTool.execute({ domain: 'example.com' });
      const parsed = JSON.parse(result);

      expect(parsed).toEqual({
        domain: 'example.com',
        status: 'invalid',
        canReceiveEmail: false,
        mxRecords: [],
        note: 'No MX or A records found. This domain cannot receive email.',
      });
    });

    it('should handle MX records with same priority', async () => {
      vi.mocked(resolveMx).mockResolvedValue([
        { exchange: 'mx2.example.com', priority: 10 },
        { exchange: 'mx1.example.com', priority: 10 },
      ] as any);

      const result = await checkMxTool.execute({ domain: 'example.com' });
      const parsed = JSON.parse(result);

      expect(parsed.status).toBe('valid');
      expect(parsed.canReceiveEmail).toBe(true);
      expect(parsed.mxRecords).toHaveLength(2);
      expect(parsed.mxRecords.every((r: any) => r.priority === 10)).toBe(true);
    });

    it('should handle MX resolve error gracefully and check A record', async () => {
      vi.mocked(resolveMx).mockRejectedValue(new Error('queryMx ENOTFOUND'));
      vi.mocked(resolve4).mockResolvedValue([{ address: '10.0.0.1', ttl: 60 } as any]);

      const result = await checkMxTool.execute({ domain: 'fallback.com' });
      const parsed = JSON.parse(result);

      expect(parsed.status).toBe('fallback');
      expect(parsed.canReceiveEmail).toBe(true);
    });

    it('should handle A record resolve error gracefully', async () => {
      vi.mocked(resolveMx).mockRejectedValue(new Error('ENOTFOUND'));
      vi.mocked(resolve4).mockRejectedValue(new Error('queryArefused'));

      const result = await checkMxTool.execute({ domain: 'bad.example' });
      const parsed = JSON.parse(result);

      expect(parsed.status).toBe('invalid');
      expect(parsed.canReceiveEmail).toBe(false);
    });

    it('should handle unexpected error from resolveMx by returning error status', async () => {
      vi.mocked(resolveMx).mockRejectedValue(new Error('ESERVFAIL'));

      const result = await checkMxTool.execute({ domain: 'broken.example' });
      const parsed = JSON.parse(result);

      expect(parsed.status).toBe('invalid');
      expect(parsed.canReceiveEmail).toBe(false);
    });

    it('should sort MX records by priority ascending', async () => {
      vi.mocked(resolveMx).mockResolvedValue([
        { exchange: 'mx3.example.com', priority: 30 },
        { exchange: 'mx1.example.com', priority: 5 },
        { exchange: 'mx2.example.com', priority: 10 },
      ] as any);

      const result = await checkMxTool.execute({ domain: 'example.com' });
      const parsed = JSON.parse(result);

      expect(parsed.mxRecords.map((r: any) => r.priority)).toEqual([5, 10, 30]);
    });

    it('should lowercase exchange names in MX records', async () => {
      vi.mocked(resolveMx).mockResolvedValue([
        { exchange: 'MAIL.BigCorp.COM', priority: 1 },
      ] as any);

      const result = await checkMxTool.execute({ domain: 'bigcorp.com' });
      const parsed = JSON.parse(result);

      expect(parsed.mxRecords[0].exchange).toBe('mail.bigcorp.com');
    });

    it('should handle domain with complex path stripping', async () => {
      vi.mocked(resolveMx).mockResolvedValue([
        { exchange: 'mx.example.com', priority: 10 },
      ] as any);

      const result = await checkMxTool.execute({ domain: 'https://example.co.uk/about/contact?foo=bar' });
      const parsed = JSON.parse(result);

      expect(parsed.domain).toBe('example.co.uk');
      expect(resolveMx).toHaveBeenCalledWith('example.co.uk');
    });

    it('should handle non-Error thrown from resolveMx in fallback path', async () => {
      vi.mocked(resolveMx).mockRejectedValue('string error');
      vi.mocked(resolve4).mockRejectedValue(42);

      const result = await checkMxTool.execute({ domain: 'weird.example' });
      const parsed = JSON.parse(result);

      expect(parsed.status).toBe('invalid');
      expect(parsed.canReceiveEmail).toBe(false);
    });

    it('should not include note when MX records are found', async () => {
      vi.mocked(resolveMx).mockResolvedValue([
        { exchange: 'mx.example.com', priority: 10 },
      ] as any);

      const result = await checkMxTool.execute({ domain: 'example.com' });
      const parsed = JSON.parse(result);

      expect(parsed.note).toBeUndefined();
    });

    it('should not check A records when MX records exist', async () => {
      vi.mocked(resolveMx).mockResolvedValue([
        { exchange: 'mx.example.com', priority: 10 },
      ] as any);

      await checkMxTool.execute({ domain: 'example.com' });

      expect(resolve4).not.toHaveBeenCalled();
    });

    it('should handle single MX record', async () => {
      vi.mocked(resolveMx).mockResolvedValue([
        { exchange: 'mail.example.com', priority: 0 },
      ] as any);

      const result = await checkMxTool.execute({ domain: 'example.com' });
      const parsed = JSON.parse(result);

      expect(parsed.mxRecords).toHaveLength(1);
      expect(parsed.status).toBe('valid');
    });

    it('should handle domain with port number stripped', async () => {
      vi.mocked(resolveMx).mockResolvedValue([
        { exchange: 'mx.example.com', priority: 10 },
      ] as any);

      const result = await checkMxTool.execute({ domain: 'http://example.com:8080/path' });
      const parsed = JSON.parse(result);

      // Port number is stripped from domain
      expect(parsed.domain).toBe('example.com');
    });
  });
});