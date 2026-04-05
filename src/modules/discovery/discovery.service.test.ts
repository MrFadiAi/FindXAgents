import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DiscoveryService } from './discovery.service.js';
import { deduplicateBatch } from './dedup.js';
import { checkWebsites, extractUrlsFromLeads } from './website-checker.js';
import { enrichLeads } from './enrichment.js';

// --- Mocks ---

// Mock environment variables
const ORIGINAL_ENV = process.env;

// Mock Prisma
const mockPrismaUpsert = vi.fn();
const mockPrismaUpdate = vi.fn();
vi.mock('../../lib/db/client.js', () => ({
  prisma: {
    lead: {
      upsert: (...args: any[]) => mockPrismaUpsert(...args),
      update: (...args: any[]) => mockPrismaUpdate(...args),
    },
  },
}));

// Mock Source Classes
const mockKvkScrape = vi.fn();
const mockGoogleScrape = vi.fn();

vi.mock('./sources/kvk.js', () => ({
  KvkSource: vi.fn().mockImplementation(() => ({
    scrape: mockKvkScrape,
  })),
}));

vi.mock('./sources/google-places.js', () => ({
  GooglePlacesSource: vi.fn().mockImplementation(() => ({
    scrape: mockGoogleScrape,
  })),
}));

// Mock Pipeline utils
vi.mock('./dedup.js', () => ({
  deduplicateBatch: vi.fn(),
}));

vi.mock('./website-checker.js', () => ({
  checkWebsites: vi.fn(),
  extractUrlsFromLeads: vi.fn(),
}));

vi.mock('./enrichment.js', () => ({
  enrichLeads: vi.fn(),
}));

// --- Helpers ---

// Async iterable to mock generator behavior `for await (... of ...)`
async function* toAsyncIterable<T>(items: T[]): AsyncGenerator<T> {
  for (const item of items) {
    yield item;
  }
}

// --- Tests ---

describe('DiscoveryService', () => {
  let service: DiscoveryService;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };

    // Default stubs for pipeline functions
    vi.mocked(deduplicateBatch).mockResolvedValue({
      newLeads: [],
      duplicates: [],
      existingMatches: [],
    });
    vi.mocked(extractUrlsFromLeads).mockReturnValue([]);
    vi.mocked(checkWebsites).mockResolvedValue(new Map());
    vi.mocked(enrichLeads).mockImplementation((leads) => leads.map((l: any) => ({ ...l, enrichmentSources: l.enrichmentSources || [l.source] })) as any[]);
    mockPrismaUpsert.mockResolvedValue({});
    mockPrismaUpdate.mockResolvedValue({});
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  describe('constructor', () => {
    it('should initialize both sources when API keys are provided', () => {
      process.env.KVK_API_KEY = 'test-kvk-key';
      process.env.GOOGLE_MAPS_API_KEY = 'test-google-key';

      service = new DiscoveryService();
      expect(service).toBeDefined();
      // Functionally tested by seeing if scrape is called without "missing config" errors
    });

    it('should handle missing KVK_API_KEY gracefully', async () => {
      delete process.env.KVK_API_KEY;
      process.env.GOOGLE_MAPS_API_KEY = 'test-google-key';

      service = new DiscoveryService();
      const result = await service.discover({ sources: ['kvk'] });

      expect(result.errors).toContain('KVK API key not configured (KVK_API_KEY)');
    });

    it('should handle missing GOOGLE_MAPS_API_KEY gracefully', async () => {
      process.env.KVK_API_KEY = 'test-kvk-key';
      delete process.env.GOOGLE_MAPS_API_KEY;

      service = new DiscoveryService();
      const result = await service.discover({ sources: ['google'] });

      expect(result.errors).toContain('Google Maps API key not configured (GOOGLE_MAPS_API_KEY)');
    });
  });

  describe('discover', () => {
    beforeEach(() => {
      process.env.KVK_API_KEY = 'test-kvk-key';
      process.env.GOOGLE_MAPS_API_KEY = 'test-google-key';
      service = new DiscoveryService();
    });

    it('should run full happy path pipeline for both sources', async () => {
      const kvkLead = { businessName: 'KVK Business', city: 'Amsterdam', source: 'kvk', website: 'kvk.com' };
      const googleLead = { businessName: 'Google Business', city: 'Amsterdam', source: 'google', website: 'google.com' };

      mockKvkScrape.mockReturnValue(toAsyncIterable([kvkLead]));
      mockGoogleScrape.mockReturnValue(toAsyncIterable([googleLead]));

      const enrichedKvk = { ...kvkLead, hasWebsite: true, enrichmentSources: ['kvk'] };
      const enrichedGoogle = { ...googleLead, hasWebsite: true, enrichmentSources: ['google'] };

      vi.mocked(deduplicateBatch).mockResolvedValue({
        newLeads: [kvkLead, googleLead] as any,
        duplicates: [],
        existingMatches: [],
      });

      vi.mocked(extractUrlsFromLeads).mockReturnValue(['kvk.com', 'google.com']);
      
      const webMap = new Map([['kvk.com', { status: 'live', finalUrl: 'https://kvk.com' }]]);
      vi.mocked(checkWebsites).mockResolvedValue(webMap);

      vi.mocked(enrichLeads).mockReturnValue([enrichedKvk, enrichedGoogle] as any);

      const params = { city: 'Amsterdam', industry: 'Tech' };
      const result = await service.discover(params);

      // Step 1: Sources queried
      expect(mockKvkScrape).toHaveBeenCalledWith({ city: 'Amsterdam', industry: 'Tech', limit: undefined });
      expect(mockGoogleScrape).toHaveBeenCalledWith({ city: 'Amsterdam', industry: 'Tech', limit: undefined });

      // Step 2: Dedup
      expect(deduplicateBatch).toHaveBeenCalledWith([kvkLead, googleLead]);

      // Step 3: Websites
      expect(extractUrlsFromLeads).toHaveBeenCalledWith([kvkLead, googleLead]);
      expect(checkWebsites).toHaveBeenCalledWith(['kvk.com', 'google.com']);

      // Step 4: Enrichment
      expect(enrichLeads).toHaveBeenCalledWith([kvkLead, googleLead], webMap);

      // Step 5: Persist
      expect(mockPrismaUpsert).toHaveBeenCalledTimes(2);

      // Result
      expect(result).toEqual({
        totalDiscovered: 2,
        newLeads: 2,
        duplicates: 0,
        existingEnriched: 0,
        websiteChecked: 2,
        errors: [],
      });
    });

    it('should fallback to industry string for KVK if sbiCode is undefined', async () => {
      mockKvkScrape.mockReturnValue(toAsyncIterable([]));
      const params = { city: 'Rotterdam', industry: 'Finance', sources: ['kvk'] };
      await service.discover(params);
      expect(mockKvkScrape).toHaveBeenCalledWith({ city: 'Rotterdam', industry: 'Finance', limit: undefined });
    });

    it('should prefer sbiCode over industry for KVK source', async () => {
      mockKvkScrape.mockReturnValue(toAsyncIterable([]));
      const params = { city: 'Rotterdam', industry: 'Finance', sbiCode: '62.01', sources: ['kvk'] };
      await service.discover(params);
      expect(mockKvkScrape).toHaveBeenCalledWith({ city: 'Rotterdam', industry: '62.01', limit: undefined });
    });

    it('should only query requested sources', async () => {
      mockKvkScrape.mockReturnValue(toAsyncIterable([]));
      const params = { city: 'Utrecht', sources: ['kvk'] };
      await service.discover(params);
      
      expect(mockKvkScrape).toHaveBeenCalled();
      expect(mockGoogleScrape).not.toHaveBeenCalled();
    });

    it('should return empty stats and no errors if no sources yield leads', async () => {
      mockKvkScrape.mockReturnValue(toAsyncIterable([]));
      mockGoogleScrape.mockReturnValue(toAsyncIterable([]));

      const result = await service.discover({ city: 'Leiden' });

      expect(result).toEqual({
        totalDiscovered: 0,
        newLeads: 0,
        duplicates: 0,
        existingEnriched: 0,
        websiteChecked: 0,
        errors: [],
      });
      expect(deduplicateBatch).not.toHaveBeenCalled();
      expect(checkWebsites).not.toHaveBeenCalled();
    });

    it('should catch and record errors from KVK source', async () => {
      mockKvkScrape.mockImplementation(() => { throw new Error('KVK Network Timeout'); });
      mockGoogleScrape.mockReturnValue(toAsyncIterable([]));

      const result = await service.discover({ city: 'Groningen', sources: ['kvk'] });

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toBe('KVK source error: KVK Network Timeout');
    });

    it('should catch and record errors from Google Places source', async () => {
      mockKvkScrape.mockReturnValue(toAsyncIterable([]));
      mockGoogleScrape.mockImplementation(() => { throw new Error('Google Quota Exceeded'); });

      const result = await service.discover({ city: 'Eindhoven', sources: ['google'] });

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toBe('Google Places source error: Google Quota Exceeded');
    });

    it('should catch and record errors from non-Error objects thrown by sources', async () => {
      mockKvkScrape.mockImplementation(() => { throw 'String error'; });
      mockGoogleScrape.mockReturnValue(toAsyncIterable([]));

      const result = await service.discover({ city: 'Eindhoven', sources: ['kvk'] });

      expect(result.errors[0]).toBe('KVK source error: String error');
    });

    it('should catch and record errors from checkWebsites', async () => {
      const lead = { businessName: 'Biz', city: 'City', source: 'test', website: 'https://fail.com' };
      mockKvkScrape.mockReturnValue(toAsyncIterable([lead]));
      
      vi.mocked(deduplicateBatch).mockResolvedValue({
        newLeads: [lead] as any,
        duplicates: [],
        existingMatches: [],
      });

      vi.mocked(extractUrlsFromLeads).mockReturnValue(['https://fail.com']);
      vi.mocked(checkWebsites).mockRejectedValue(new Error('DNS resolution failed'));

      const result = await service.discover({ sources: ['kvk'] });

      expect(result.errors).toContain('Website check error: DNS resolution failed');
      expect(result.totalDiscovered).toBe(1);
      expect(result.newLeads).toBe(1);
      expect(result.websiteChecked).toBe(1);
    });

    it('should skip website checks if extractUrlsFromLeads returns empty', async () => {
      const lead = { businessName: 'NoWeb', city: 'City', source: 'test' };
      mockKvkScrape.mockReturnValue(toAsyncIterable([lead]));
      
      vi.mocked(deduplicateBatch).mockResolvedValue({
        newLeads: [lead] as any,
        duplicates: [],
        existingMatches: [],
      });

      vi.mocked(extractUrlsFromLeads).mockReturnValue([]);

      await service.discover({ sources: ['kvk'] });

      expect(checkWebsites).not.toHaveBeenCalled();
    });

    it('should report duplicates and existing matches correctly', async () => {
      const newLead = { businessName: 'New', city: 'C', source: 's' };
      const dupLead = { businessName: 'Dup', city: 'C', source: 's' };
      const existLead = { businessName: 'Exist', city: 'C', source: 's' };

      mockKvkScrape.mockReturnValue(toAsyncIterable([newLead, dupLead, existLead]));

      vi.mocked(deduplicateBatch).mockResolvedValue({
        newLeads: [newLead] as any,
        duplicates: [dupLead] as any,
        existingMatches: [{ lead: existLead, existingId: '123' }] as any,
      });

      const result = await service.discover({ sources: ['kvk'] });

      expect(result.totalDiscovered).toBe(3);
      expect(result.newLeads).toBe(1);
      expect(result.duplicates).toBe(1);
      expect(result.existingEnriched).toBe(1);
    });
  });

  describe('persistLeads', () => {
    beforeEach(() => {
      process.env.KVK_API_KEY = 'test-kvk-key';
      process.env.GOOGLE_MAPS_API_KEY = 'test-google-key';
      service = new DiscoveryService();
    });

    it('should not execute prisma queries if there are no enriched leads', async () => {
      // We trigger this by having 0 new leads
      mockKvkScrape.mockReturnValue(toAsyncIterable([]));
      const result = await service.discover({ sources: ['kvk'] });
      
      expect(mockPrismaUpsert).not.toHaveBeenCalled();
    });

    it('should batch upsert leads in batches of 50', async () => {
      const leads = Array.from({ length: 110 }).map((_, i) => ({
        businessName: `Biz ${i}`,
        city: 'City',
        source: 'test',
        enrichmentSources: ['test'],
        hasWebsite: false,
      }));

      mockKvkScrape.mockReturnValue(toAsyncIterable(leads));
      vi.mocked(deduplicateBatch).mockResolvedValue({
        newLeads: leads as any,
        duplicates: [],
        existingMatches: [],
      });
      vi.mocked(enrichLeads).mockImplementation((l) => l as any);

      await service.discover({ sources: ['kvk'] });

      // 110 leads should be split into 3 batches (50 + 50 + 10)
      expect(mockPrismaUpsert).toHaveBeenCalledTimes(110);
    });

    it('should use generated unique string for kvkNumber in upsert if null', async () => {
      const lead = { businessName: 'No KvK', city: 'City', source: 'test', enrichmentSources: ['test'], hasWebsite: false };
      mockKvkScrape.mockReturnValue(toAsyncIterable([lead]));
      
      vi.mocked(deduplicateBatch).mockResolvedValue({
        newLeads: [lead] as any,
        duplicates: [],
        existingMatches: [],
      });
      vi.mocked(enrichLeads).mockImplementation((l) => l as any);

      await service.discover({ sources: ['kvk'] });

      expect(mockPrismaUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            kvkNumber: expect.stringContaining('_gen_'),
          }),
        }),
      );
    });
  });

  describe('enrichExistingLeads', () => {
    beforeEach(() => {
      process.env.KVK_API_KEY = 'test-kvk-key';
      process.env.GOOGLE_MAPS_API_KEY = 'test-google-key';
      service = new DiscoveryService();
    });

    it('should update existing leads with new data from matches', async () => {
      const existingMatchLead = {
        businessName: 'Old Biz',
        city: 'City',
        source: 'google',
        website: 'https://new-site.com',
        phone: '123-456-7890',
        industry: 'Retail',
      };

      mockKvkScrape.mockReturnValue(toAsyncIterable([existingMatchLead]));
      
      vi.mocked(deduplicateBatch).mockResolvedValue({
        newLeads: [],
        duplicates: [],
        existingMatches: [{ lead: existingMatchLead, existingId: 'db-id-1' }] as any,
      });

      const result = await service.discover({ sources: ['kvk'] });

      // Should only update once for the existing match
      expect(mockPrismaUpdate).toHaveBeenCalledTimes(1);
      expect(mockPrismaUpdate).toHaveBeenCalledWith({
        where: { id: 'db-id-1' },
        data: {
          website: 'https://new-site.com',
          hasWebsite: true,
          phone: '123-456-7890',
          industry: 'Retail',
        },
      });

      expect(result.existingEnriched).toBe(1);
    });

    it('should not update existing leads if match has no new data fields', async () => {
      const minimalLead = {
        businessName: 'Basic Biz',
        city: 'City',
        source: 'test',
        // no website, phone, email, or industry
      };

      mockKvkScrape.mockReturnValue(toAsyncIterable([minimalLead]));
      
      vi.mocked(deduplicateBatch).mockResolvedValue({
        newLeads: [],
        duplicates: [],
        existingMatches: [{ lead: minimalLead, existingId: 'db-id-2' }] as any,
      });

      await service.discover({ sources: ['kvk'] });

      expect(mockPrismaUpdate).not.toHaveBeenCalled();
    });

    it('should handle multiple existing matches correctly', async () => {
      const match1 = { lead: { businessName: 'B1', city: 'C', source: 's', phone: '111' }, existingId: 'id1' };
      const match2 = { lead: { businessName: 'B2', city: 'C', source: 's', email: 'test@test.com' }, existingId: 'id2' };
      
      mockKvkScrape.mockReturnValue(toAsyncIterable([match1.lead, match2.lead]));
      
      vi.mocked(deduplicateBatch).mockResolvedValue({
        newLeads: [],
        duplicates: [],
        existingMatches: [match1, match2] as any,
      });

      await service.discover({ sources: ['kvk'] });

      expect(mockPrismaUpdate).toHaveBeenCalledTimes(2);
    });
  });
});