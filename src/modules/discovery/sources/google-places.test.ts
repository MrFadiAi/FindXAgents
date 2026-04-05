import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DiscoveryParams } from '../discovery.service.js';
import { GooglePlacesSource, type GooglePlacesConfig } from './google-places.js';

// Mock the rate limiter module
vi.mock('./rate-limiter.js', () => ({
  createGoogleRateLimiter: vi.fn(() => ({
    acquire: vi.fn().mockResolvedValue(undefined),
  })),
}));

describe('GooglePlacesSource', () => {
  let source: GooglePlacesSource;
  const config: GooglePlacesConfig = { apiKey: 'test-api-key' };
  
  const mockFetch = vi.fn();
  vi.stubGlobal('fetch', mockFetch);

  beforeEach(() => {
    vi.clearAllMocks();
    source = new GooglePlacesSource(config);
  });

  describe('scrape', () => {
    const baseParams: DiscoveryParams = {
      industry: 'Plumbing',
      city: 'Amsterdam',
      limit: 10,
    };

    const mockSearchResponse = (places: any[], nextPageToken?: string) => ({
      ok: true,
      json: () => Promise.resolve({
        status: 'OK',
        results: places,
        next_page_token: nextPageToken,
      }),
    });

    const mockDetailsResponse = (details: any) => ({
      ok: true,
      json: () => Promise.resolve({
        status: 'OK',
        result: details,
      }),
    });

    it('should yield leads with details for a single page of results', async () => {
      const places = [
        {
          place_id: '1',
          name: 'Google Business',
          formatted_address: '1234AB Amsterdam, Netherlands',
          types: ['plumber'],
          rating: 4.5,
          user_ratings_total: 100,
          business_status: 'OPERATIONAL',
        },
      ];

      const details = {
        name: 'Google Business',
        formatted_address: '1234AB Amsterdam, Netherlands',
        formatted_phone_number: '020-1234567',
        international_phone_number: '+31 20-1234567',
        website: 'https://googlebusiness.nl',
        url: 'https://maps.google.com/?cid=1',
        types: ['plumber'],
        business_status: 'OPERATIONAL',
      };

      mockFetch
        .mockResolvedValueOnce(mockSearchResponse(places))
        .mockResolvedValueOnce(mockDetailsResponse(details));

      const leads = [];
      for await (const lead of source.scrape(baseParams)) {
        leads.push(lead);
      }

      expect(leads).toHaveLength(1);
      expect(leads[0]).toEqual({
        businessName: 'Google Business',
        address: '1234AB Amsterdam, Netherlands',
        city: 'Amsterdam',
        industry: 'Plumbing',
        website: 'https://googlebusiness.nl',
        phone: '+31 20-1234567',
        source: 'google',
        sourceId: '1',
      });
      
      // 1 search call + 1 details call
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should fall back to formatted_phone_number if international is missing', async () => {
      const places = [
        {
          place_id: '2',
          name: 'Local Business',
          formatted_address: '1011AB Amsterdam',
        },
      ];

      const details = {
        name: 'Local Business',
        formatted_address: '1011AB Amsterdam',
        formatted_phone_number: '020-7654321',
      };

      mockFetch
        .mockResolvedValueOnce(mockSearchResponse(places))
        .mockResolvedValueOnce(mockDetailsResponse(details));

      const leads = [];
      for await (const lead of source.scrape(baseParams)) {
        leads.push(lead);
      }

      expect(leads[0].phone).toBe('020-7654321');
    });

    it('should handle pagination (next_page_token) and enforce delay', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      
      const page1Places = [
        { place_id: 'p1', name: 'Page 1 Biz', formatted_address: '1111AA Rotterdam, Netherlands' },
      ];
      const page2Places = [
        { place_id: 'p2', name: 'Page 2 Biz', formatted_address: '2222BB Rotterdam, Netherlands' },
      ];
      const details = { website: 'https://example.com' };

      mockFetch
        .mockResolvedValueOnce(mockSearchResponse(page1Places, 'token-page-2'))
        .mockResolvedValueOnce(mockDetailsResponse(details))
        .mockResolvedValueOnce(mockSearchResponse(page2Places))
        .mockResolvedValueOnce(mockDetailsResponse(details));

      const leads = [];
      for await (const lead of source.scrape({ ...baseParams, limit: 500 })) {
        leads.push(lead);
      }

      expect(leads).toHaveLength(2);
      expect(mockFetch).toHaveBeenCalledTimes(4); // 2 searches + 2 details
      vi.useRealTimers();
    });

    it('should enforce the limit parameter and stop fetching', async () => {
      const places = Array.from({ length: 5 }).map((_, i) => ({
        place_id: `id-${i}`,
        name: `Biz ${i}`,
        formatted_address: '1000AA Utrecht, Netherlands',
      }));

      mockFetch.mockImplementation(async (urlStr) => {
        if (urlStr.includes('textsearch')) return mockSearchResponse(places);
        return mockDetailsResponse({ name: 'Biz' });
      });

      const params: DiscoveryParams = { ...baseParams, limit: 3 };
      const leads = [];
      for await (const lead of source.scrape(params)) {
        leads.push(lead);
      }

      // Should process exactly 3 out of 5 available on the page
      expect(leads).toHaveLength(3);
      // 1 search call + 3 details calls
      expect(mockFetch).toHaveBeenCalledTimes(4); 
    });

    it('should throw an error if Google Places search API returns bad HTTP status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const generator = source.scrape(baseParams);
      await expect(generator.next()).rejects.toThrow('Google Places API error: 500');
    });

    it('should throw an error if Google Places search API returns error status in JSON', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          status: 'REQUEST_DENIED',
          error_message: 'API key is invalid',
        }),
      });

      const generator = source.scrape(baseParams);
      await expect(generator.next()).rejects.toThrow(
        'Google Places error: REQUEST_DENIED — API key is invalid'
      );
    });

    it('should handle ZERO_RESULTS status gracefully and return nothing', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          status: 'ZERO_RESULTS',
          results: [],
        }),
      });

      const leads = [];
      for await (const lead of source.scrape(baseParams)) {
        leads.push(lead);
      }

      expect(leads).toHaveLength(0);
    });

    it('should gracefully skip details if fetch returns non-OK status', async () => {
      const places = [
        { place_id: '1', name: 'Ghost Biz', formatted_address: '1111AA City, Netherlands' },
      ];

      mockFetch
        .mockResolvedValueOnce(mockSearchResponse(places))
        .mockResolvedValueOnce({ ok: false, status: 404 });

      const leads = [];
      for await (const lead of source.scrape(baseParams)) {
        leads.push(lead);
      }

      expect(leads).toHaveLength(1);
      expect(leads[0].website).toBeUndefined();
      expect(leads[0].phone).toBeUndefined();
    });

    it('should gracefully skip details if API returns non-OK JSON status', async () => {
      const places = [
        { place_id: '1', name: 'Biz', formatted_address: '1111AA City, Netherlands' },
      ];

      mockFetch
        .mockResolvedValueOnce(mockSearchResponse(places))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'INVALID_REQUEST', result: null }),
        });

      const leads = [];
      for await (const lead of source.scrape(baseParams)) {
        leads.push(lead);
      }

      expect(leads).toHaveLength(1);
      expect(leads[0].website).toBeUndefined();
    });
  });

  describe('extractCity (via scrape)', () => {
    const generatePlace = (address: string) => [
      { place_id: '1', name: 'Biz', formatted_address: address },
    ];
    const mockSearch = (places: any[]) => ({
      ok: true,
      json: () => Promise.resolve({ status: 'OK', results: places }),
    });
    const mockDetails = () => ({
      ok: true,
      json: () => Promise.resolve({ status: 'OK', result: {} }),
    });

    it('should extract city from typical Dutch postcode pattern', async () => {
      mockFetch
        .mockResolvedValueOnce(mockSearch(generatePlace('1234 AB Amsterdam, Netherlands')))
        .mockResolvedValueOnce(mockDetails());

      const leads = [];
      for await (const lead of source.scrape({ city: 'Amsterdam' })) {
        leads.push(lead);
      }
      expect(leads[0].city).toBe('Amsterdam');
    });

    it('should extract city from Dutch postcode without space', async () => {
      mockFetch
        .mockResolvedValueOnce(mockSearch(generatePlace('1234AB Utrecht, Netherlands')))
        .mockResolvedValueOnce(mockDetails());

      const leads = [];
      for await (const lead of source.scrape({ city: 'Utrecht' })) {
        leads.push(lead);
      }
      expect(leads[0].city).toBe('Utrecht');
    });

    it('should extract city from Dutch postcode without explicit country', async () => {
      mockFetch
        .mockResolvedValueOnce(mockSearch(generatePlace('1011AB Amsterdam')))
        .mockResolvedValueOnce(mockDetails());

      const leads = [];
      for await (const lead of source.scrape({ city: 'Amsterdam' })) {
        leads.push(lead);
      }
      expect(leads[0].city).toBe('Amsterdam');
    });

    it('should fallback to Unknown when address has no postcode and last segment is country name', async () => {
      mockFetch
        .mockResolvedValueOnce(mockSearch(generatePlace('Somestreet 12, Rotterdam, Netherlands')))
        .mockResolvedValueOnce(mockDetails());

      const leads = [];
      for await (const lead of source.scrape({ city: 'Rotterdam' })) {
        leads.push(lead);
      }
      // The fallback takes last comma segment "Netherlands", strips "Netherlands" → empty → "Unknown"
      expect(leads[0].city).toBe('Unknown');
    });

    it('should fallback to Unknown for entirely malformed address', async () => {
      mockFetch
        .mockResolvedValueOnce(mockSearch(generatePlace('Netherlands')))
        .mockResolvedValueOnce(mockDetails());

      const leads = [];
      for await (const lead of source.scrape({ city: 'Anywhere' })) {
        leads.push(lead);
      }
      expect(leads[0].city).toBe('Unknown');
    });
  });
});