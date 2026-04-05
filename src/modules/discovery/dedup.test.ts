import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deduplicateBatch } from './dedup.js';
import type { DiscoveredLead } from './discovery.service.js';

// Mock the Prisma client
vi.mock('../../lib/db/client.js', () => ({
  prisma: {
    lead: {
      findMany: vi.fn(),
    },
  },
}));

// Import the mocked prisma to set behavior in tests
import { prisma } from '../../lib/db/client.js';

const createLead = (overrides: Partial<DiscoveredLead> = {}): DiscoveredLead => ({
  businessName: 'Test Company',
  city: 'Amsterdam',
  kvkNumber: '12345678',
  street: 'Teststraat 1',
  postcode: '1011AA',
  ...overrides,
});

describe('deduplicateBatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock to return empty arrays
    vi.mocked(prisma.lead.findMany).mockResolvedValue([]);
  });

  describe('Happy Path', () => {
    it('should mark all leads as new when there are no duplicates in batch or DB', async () => {
      const leads = [
        createLead({ businessName: 'Company A', kvkNumber: '11111111' }),
        createLead({ businessName: 'Company B', kvkNumber: '22222222' }),
      ];

      const result = await deduplicateBatch(leads);

      expect(result.newLeads).toHaveLength(2);
      expect(result.duplicates).toHaveLength(0);
      expect(result.existingMatches).toHaveLength(0);
    });

    it('should return existingMatches for leads that exist in the DB by KVK number', async () => {
      const lead = createLead({ kvkNumber: '11111111' });
      
      vi.mocked(prisma.lead.findMany).mockResolvedValue([
        { id: 'db-id-1', kvkNumber: '11111111' },
      ] as any);

      const result = await deduplicateBatch([lead]);

      expect(result.newLeads).toHaveLength(0);
      expect(result.existingMatches).toHaveLength(1);
      expect(result.existingMatches[0]).toEqual({
        lead,
        existingId: 'db-id-1',
      });
    });

    it('should return existingMatches for leads that exist in the DB by name and city', async () => {
      const lead = createLead({ businessName: 'Company A', city: 'Amsterdam', kvkNumber: undefined });
      
      vi.mocked(prisma.lead.findMany).mockResolvedValue([
        { id: 'db-id-2', businessName: 'Company A', city: 'Amsterdam' },
      ] as any);

      const result = await deduplicateBatch([lead]);

      expect(result.newLeads).toHaveLength(0);
      expect(result.existingMatches).toHaveLength(1);
      expect(result.existingMatches[0]).toEqual({
        lead,
        existingId: 'db-id-2',
      });
    });
  });

  describe('In-Batch Deduplication', () => {
    it('should deduplicate leads with the exact same KVK number', async () => {
      const leads = [
        createLead({ businessName: 'Company A', kvkNumber: '11111111' }),
        createLead({ businessName: 'Company A Clone', kvkNumber: '11111111' }),
        createLead({ businessName: 'Company B', kvkNumber: '22222222' }),
      ];

      const result = await deduplicateBatch(leads);

      expect(result.duplicates).toHaveLength(1);
      expect(result.duplicates[0].matchReason).toContain('KVK number 11111111');
      expect(result.duplicates[0].lead.businessName).toBe('Company A Clone');
      
      // Expect the first to be kept, second dup removed, third kept
      expect(result.newLeads).toHaveLength(2);
      expect(result.newLeads[0].businessName).toBe('Company A');
      expect(result.newLeads[1].businessName).toBe('Company B');
    });

    it('should deduplicate leads with the same normalized business name and city', async () => {
      const leads = [
        createLead({ businessName: 'My Company', city: 'Utrecht', kvkNumber: '11111111' }),
        createLead({ businessName: 'My   Company', city: ' utrecht ', kvkNumber: undefined }), // Duplicate by name+city
        createLead({ businessName: 'My Company', city: 'Rotterdam', kvkNumber: undefined }), // Different city
      ];

      const result = await deduplicateBatch(leads);

      expect(result.duplicates).toHaveLength(1);
      expect(result.duplicates[0].matchReason).toContain('Name+city: My   Company in  utrecht ');
      
      // 1 kept from initial KVK, 1 kept from different city
      expect(result.newLeads).toHaveLength(2);
    });

    it('should prefer KVK deduplication over name/city if somehow both apply in batch', async () => {
      const leads = [
        createLead({ businessName: 'Name', city: 'City', kvkNumber: '11111111' }),
        createLead({ businessName: 'Name', city: 'City', kvkNumber: '11111111' }),
      ];

      const result = await deduplicateBatch(leads);

      expect(result.duplicates).toHaveLength(1);
      expect(result.duplicates[0].matchReason).toBe('KVK number 11111111');
    });
  });

  describe('Cross-Batch Deduplication (Prisma Database)', () => {
    it('should query the database with an array of KVK numbers', async () => {
      const leads = [
        createLead({ businessName: 'Company A', kvkNumber: '11111111' }),
        createLead({ businessName: 'Company B', kvkNumber: '22222222' }),
      ];

      await deduplicateBatch(leads);

      expect(prisma.lead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            kvkNumber: { in: ['11111111', '22222222'] },
          },
        })
      );
    });

    it('should query the database by city and business name for leads without a KVK number', async () => {
      const leads = [
        createLead({ businessName: 'Alpha', city: 'Berlin', kvkNumber: undefined }),
        createLead({ businessName: 'Beta', city: 'berlin', kvkNumber: undefined }),
      ];

      await deduplicateBatch(leads);

      // Should be called once for the grouped city 'berlin'
      expect(prisma.lead.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.lead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            city: { equals: 'berlin', mode: 'insensitive' },
            businessName: { in: ['Alpha', 'Beta'], mode: 'insensitive' },
          }),
        })
      );
    });

    it('should not query the database by KVK if no leads have KVK numbers', async () => {
      const leads = [
        createLead({ businessName: 'Alpha', city: 'Berlin', kvkNumber: undefined }),
      ];

      await deduplicateBatch(leads);

      // Only called once for name+city, not for KVK
      expect(prisma.lead.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.lead.findMany).not.toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ kvkNumber: expect.anything() }),
        })
      );
    });
  });

  describe('Normalization and Edge Cases', () => {
    it('should normalize strings correctly for name+city comparisons', async () => {
      const leads = [
        createLead({ businessName: 'BV Test-Company', city: 'Amsterdam.', kvkNumber: undefined }),
        createLead({ businessName: 'bv test company', city: 'amsterdam', kvkNumber: undefined }),
      ];

      const result = await deduplicateBatch(leads);

      expect(result.duplicates).toHaveLength(1);
      expect(result.duplicates[0].matchReason).toBe('Name+city: bv test company in amsterdam');
    });

    it('should handle empty leads array', async () => {
      const result = await deduplicateBatch([]);

      expect(result.newLeads).toHaveLength(0);
      expect(result.duplicates).toHaveLength(0);
      expect(result.existingMatches).toHaveLength(0);
      expect(prisma.lead.findMany).not.toHaveBeenCalled();
    });

    it('should handle leads with undefined/null names, cities, or kvk numbers', async () => {
      const leads = [
        createLead({ businessName: null as any, city: null as any, kvkNumber: null as any }),
      ];

      const result = await deduplicateBatch(leads);

      // Since no KVK, and name+city keys will be `name: :`, we expect it to be processed
      expect(result.newLeads).toHaveLength(1);
      expect(prisma.lead.findMany).toHaveBeenCalledTimes(1); // Queries for name/city empty string
    });

    it('should classify leads as new if they are not duplicates and not in the DB', async () => {
      const lead = createLead({ kvkNumber: '99999999' });
      
      // DB returns empty (default mock)
      const result = await deduplicateBatch([lead]);

      expect(result.newLeads).toHaveLength(1);
      expect(result.newLeads[0].kvkNumber).toBe('99999999');
    });
  });
});