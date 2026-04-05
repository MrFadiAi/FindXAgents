import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { googlePlacesTool } from './google-places.js';

// Mock the GooglePlacesSource module
vi.mock('../../modules/discovery/sources/google-places.js', () => {
  return {
    GooglePlacesSource: vi.fn(),
  };
});

// Import the mocked class
import { GooglePlacesSource } from '../../modules/discovery/sources/google-places.js';

const MockedGooglePlacesSource = vi.mocked(GooglePlacesSource);

// Store original env
const originalEnv = process.env;

describe('googlePlacesTool', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('tool definition', () => {
    it('should have the correct tool name', () => {
      expect(googlePlacesTool.name).toBe('google_places_search');
    });

    it('should have a non-empty description', () => {
      expect(googlePlacesTool.description).toBeTruthy();
      expect(typeof googlePlacesTool.description).toBe('string');
    });

    it('should define an input_schema of type object', () => {
      expect(googlePlacesTool.input_schema.type).toBe('object');
    });

    it('should require "query" in input_schema', () => {
      expect(googlePlacesTool.input_schema.required).toContain('query');
    });

    it('should define query property as a string', () => {
      expect(googlePlacesTool.input_schema.properties.query.type).toBe('string');
    });

    it('should define city property as a string', () => {
      expect(googlePlacesTool.input_schema.properties.city.type).toBe('string');
    });

    it('should define industry property as a string', () => {
      expect(googlePlacesTool.input_schema.properties.industry.type).toBe('string');
    });

    it('should define limit property as a number', () => {
      expect(googlePlacesTool.input_schema.properties.limit.type).toBe('number');
    });

    it('should have an execute function', () => {
      expect(typeof googlePlacesTool.execute).toBe('function');
    });
  });

  describe('execute', () => {
    // Helper to create a mock generator
    function* mockGenerator(items: any[]) {
      for (const item of items) {
        yield item;
      }
    }

    // Sample lead data from GooglePlacesSource
    const mockLeads = [
      {
        businessName: 'Cafe Amsterdam',
        address: 'Prinsengracht 123',
        city: 'Amsterdam',
        industry: 'restaurant',
        website: 'https://cafe-amsterdam.example.com',
        phone: '+31201234567',
        sourceId: 'place-id-001',
      },
      {
        businessName: 'Pizza Palace',
        address: 'Keizersgracht 456',
        city: 'Amsterdam',
        industry: 'restaurant',
        website: 'https://pizza-palace.example.com',
        phone: '+31209876543',
        sourceId: 'place-id-002',
      },
    ];

    const singleLead = [
      {
        businessName: 'Solo Business',
        address: 'Dam 1',
        city: 'Amsterdam',
        industry: 'cafe',
        website: 'https://solo.example.com',
        phone: '+31201112233',
        sourceId: 'place-id-003',
      },
    ];

    it('should return unavailable JSON when GOOGLE_MAPS_API_KEY is not set', async () => {
      delete process.env.GOOGLE_MAPS_API_KEY;

      const result = await googlePlacesTool.execute({ query: 'restaurants in Amsterdam' });
      const parsed = JSON.parse(result);

      expect(parsed.available).toBe(false);
      expect(parsed.message).toContain('missing GOOGLE_MAPS_API_KEY');
      expect(parsed.message).toContain('web_search');
    });

    it('should return unavailable JSON when GOOGLE_MAPS_API_KEY is empty string', async () => {
      process.env.GOOGLE_MAPS_API_KEY = '';

      const result = await googlePlacesTool.execute({ query: 'restaurants in Amsterdam' });
      const parsed = JSON.parse(result);

      expect(parsed.available).toBe(false);
    });

    it('should instantiate GooglePlacesSource with the correct API key', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-api-key-123';

      const mockScrape = vi.fn().mockReturnValue(mockGenerator([]));
      MockedGooglePlacesSource.mockImplementation(() => {
        return { scrape: mockScrape } as any;
      });

      await googlePlacesTool.execute({ query: 'test query' });

      expect(MockedGooglePlacesSource).toHaveBeenCalledWith({
        apiKey: 'test-api-key-123',
      });
    });

    it('should call scrape with query as fallback industry when industry is not provided', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-key';

      const mockScrape = vi.fn().mockReturnValue(mockGenerator([]));
      MockedGooglePlacesSource.mockImplementation(() => {
        return { scrape: mockScrape } as any;
      });

      await googlePlacesTool.execute({ query: 'coffee shops in Berlin' });

      expect(mockScrape).toHaveBeenCalledWith({
        city: undefined,
        industry: 'coffee shops in Berlin',
        limit: 50,
      });
    });

    it('should call scrape with explicit city and industry when provided', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-key';

      const mockScrape = vi.fn().mockReturnValue(mockGenerator([]));
      MockedGooglePlacesSource.mockImplementation(() => {
        return { scrape: mockScrape } as any;
      });

      await googlePlacesTool.execute({
        query: 'hotels',
        city: 'Rotterdam',
        industry: 'hospitality',
        limit: 25,
      });

      expect(mockScrape).toHaveBeenCalledWith({
        city: 'Rotterdam',
        industry: 'hospitality',
        limit: 25,
      });
    });

    it('should use default limit of 50 when limit is not provided', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-key';

      const mockScrape = vi.fn().mockReturnValue(mockGenerator([]));
      MockedGooglePlacesSource.mockImplementation(() => {
        return { scrape: mockScrape } as any;
      });

      await googlePlacesTool.execute({ query: 'test' });

      expect(mockScrape).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 50 })
      );
    });

    it('should use default limit of 50 when limit is 0', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-key';

      const mockScrape = vi.fn().mockReturnValue(mockGenerator([]));
      MockedGooglePlacesSource.mockImplementation(() => {
        return { scrape: mockScrape } as any;
      });

      await googlePlacesTool.execute({ query: 'test', limit: 0 });

      expect(mockScrape).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 50 })
      );
    });

    it('should use default limit of 50 when limit is null', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-key';

      const mockScrape = vi.fn().mockReturnValue(mockGenerator([]));
      MockedGooglePlacesSource.mockImplementation(() => {
        return { scrape: mockScrape } as any;
      });

      await googlePlacesTool.execute({ query: 'test', limit: null });

      expect(mockScrape).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 50 })
      );
    });

    it('should use default limit of 50 when limit is undefined', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-key';

      const mockScrape = vi.fn().mockReturnValue(mockGenerator([]));
      MockedGooglePlacesSource.mockImplementation(() => {
        return { scrape: mockScrape } as any;
      });

      await googlePlacesTool.execute({ query: 'test', limit: undefined });

      expect(mockScrape).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 50 })
      );
    });

    it('should return leads with correctly mapped fields', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-key';

      const mockScrape = vi.fn().mockReturnValue(mockGenerator(mockLeads));
      MockedGooglePlacesSource.mockImplementation(() => {
        return { scrape: mockScrape } as any;
      });

      const result = await googlePlacesTool.execute({ query: 'restaurants' });
      const parsed = JSON.parse(result);

      expect(parsed.available).toBe(true);
      expect(parsed.source).toBe('google_places');
      expect(parsed.totalFound).toBe(2);
      expect(parsed.results).toHaveLength(2);

      const firstResult = parsed.results[0];
      expect(firstResult).toEqual({
        businessName: 'Cafe Amsterdam',
        address: 'Prinsengracht 123',
        city: 'Amsterdam',
        industry: 'restaurant',
        website: 'https://cafe-amsterdam.example.com',
        phone: '+31201234567',
        placeId: 'place-id-001',
      });

      const secondResult = parsed.results[1];
      expect(secondResult).toEqual({
        businessName: 'Pizza Palace',
        address: 'Keizersgracht 456',
        city: 'Amsterdam',
        industry: 'restaurant',
        website: 'https://pizza-palace.example.com',
        phone: '+31209876543',
        placeId: 'place-id-002',
      });
    });

    it('should map sourceId to placeId', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-key';

      const mockScrape = vi.fn().mockReturnValue(mockGenerator(singleLead));
      MockedGooglePlacesSource.mockImplementation(() => {
        return { scrape: mockScrape } as any;
      });

      const result = await googlePlacesTool.execute({ query: 'test' });
      const parsed = JSON.parse(result);

      expect(parsed.results[0].placeId).toBe('place-id-003');
    });

    it('should return empty results when scrape yields no leads', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-key';

      const mockScrape = vi.fn().mockReturnValue(mockGenerator([]));
      MockedGooglePlacesSource.mockImplementation(() => {
        return { scrape: mockScrape } as any;
      });

      const result = await googlePlacesTool.execute({ query: 'nonexistent' });
      const parsed = JSON.parse(result);

      expect(parsed.available).toBe(true);
      expect(parsed.source).toBe('google_places');
      expect(parsed.totalFound).toBe(0);
      expect(parsed.results).toEqual([]);
    });

    it('should handle leads with undefined fields gracefully', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-key';

      const leadsWithUndefined = [
        {
          businessName: 'Sparse Data',
          address: undefined,
          city: undefined,
          industry: undefined,
          website: undefined,
          phone: undefined,
          sourceId: undefined,
        },
      ];

      const mockScrape = vi.fn().mockReturnValue(mockGenerator(leadsWithUndefined));
      MockedGooglePlacesSource.mockImplementation(() => {
        return { scrape: mockScrape } as any;
      });

      const result = await googlePlacesTool.execute({ query: 'test' });
      const parsed = JSON.parse(result);

      expect(parsed.results[0]).toEqual({
        businessName: 'Sparse Data',
        address: undefined,
        city: undefined,
        industry: undefined,
        website: undefined,
        phone: undefined,
        placeId: undefined,
      });
    });

    it('should catch Error instances and return structured error JSON', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-key';

      MockedGooglePlacesSource.mockImplementation(() => {
        throw new Error('API quota exceeded');
      });

      const result = await googlePlacesTool.execute({ query: 'test' });
      const parsed = JSON.parse(result);

      expect(parsed.available).toBe(true);
      expect(parsed.error).toBe('Google Places API call failed: API quota exceeded');
      expect(parsed.results).toEqual([]);
    });

    it('should catch non-Error throws and return structured error JSON', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-key';

      MockedGooglePlacesSource.mockImplementation(() => {
        throw 'something went terribly wrong'; // eslint-disable-line no-throw-literal
      });

      const result = await googlePlacesTool.execute({ query: 'test' });
      const parsed = JSON.parse(result);

      expect(parsed.available).toBe(true);
      expect(parsed.error).toBe(
        'Google Places API call failed: something went terribly wrong'
      );
      expect(parsed.results).toEqual([]);
    });

    it('should catch errors thrown during iteration of scrape generator', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-key';

      function* failingGenerator() {
        yield mockLeads[0];
        throw new Error('Network timeout during pagination');
      }

      const mockScrape = vi.fn().mockReturnValue(failingGenerator());
      MockedGooglePlacesSource.mockImplementation(() => {
        return { scrape: mockScrape } as any;
      });

      const result = await googlePlacesTool.execute({ query: 'test' });
      const parsed = JSON.parse(result);

      expect(parsed.available).toBe(true);
      expect(parsed.error).toBe(
        'Google Places API call failed: Network timeout during pagination'
      );
      expect(parsed.results).toEqual([]);
    });

    it('should catch null throws', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-key';

      MockedGooglePlacesSource.mockImplementation(() => {
        throw null; // eslint-disable-line no-throw-literal
      });

      const result = await googlePlacesTool.execute({ query: 'test' });
      const parsed = JSON.parse(result);

      expect(parsed.available).toBe(true);
      expect(parsed.error).toBe('Google Places API call failed: null');
      expect(parsed.results).toEqual([]);
    });

    it('should catch undefined throws', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-key';

      MockedGooglePlacesSource.mockImplementation(() => {
        throw undefined; // eslint-disable-line no-throw-literal
      });

      const result = await googlePlacesTool.execute({ query: 'test' });
      const parsed = JSON.parse(result);

      expect(parsed.available).toBe(true);
      expect(parsed.error).toBe('Google Places API call failed: undefined');
      expect(parsed.results).toEqual([]);
    });

    it('should catch numeric throws', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-key';

      MockedGooglePlacesSource.mockImplementation(() => {
        throw 42; // eslint-disable-line no-throw-literal
      });

      const result = await googlePlacesTool.execute({ query: 'test' });
      const parsed = JSON.parse(result);

      expect(parsed.available).toBe(true);
      expect(parsed.error).toBe('Google Places API call failed: 42');
      expect(parsed.results).toEqual([]);
    });

    it('should pass city as undefined when city is empty string', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-key';

      const mockScrape = vi.fn().mockReturnValue(mockGenerator([]));
      MockedGooglePlacesSource.mockImplementation(() => {
        return { scrape: mockScrape } as any;
      });

      await googlePlacesTool.execute({ query: 'test', city: '' });

      expect(mockScrape).toHaveBeenCalledWith(
        expect.objectContaining({ city: undefined })
      );
    });

    it('should pass industry as undefined when industry is empty string', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-key';

      const mockScrape = vi.fn().mockReturnValue(mockGenerator([]));
      MockedGooglePlacesSource.mockImplementation(() => {
        return { scrape: mockScrape } as any;
      });

      await googlePlacesTool.execute({ query: 'test', industry: '' });

      // When industry is empty string, it falsies out, so query is used instead
      expect(mockScrape).toHaveBeenCalledWith(
        expect.objectContaining({ industry: 'test' })
      );
    });

    it('should pass industry from input when provided (not falling back to query)', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-key';

      const mockScrape = vi.fn().mockReturnValue(mockGenerator([]));
      MockedGooglePlacesSource.mockImplementation(() => {
        return { scrape: mockScrape } as any;
      });

      await googlePlacesTool.execute({ query: 'test query', industry: 'specific-industry' });

      expect(mockScrape).toHaveBeenCalledWith(
        expect.objectContaining({ industry: 'specific-industry' })
      );
    });

    it('should handle a large number of results', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-key';

      const manyLeads = Array.from({ length: 200 }, (_, i) => ({
        businessName: `Business ${i}`,
        address: `Address ${i}`,
        city: 'City',
        industry: 'industry',
        website: `https://biz${i}.example.com`,
        phone: `+3120${String(i).padStart(6, '0')}`,
        sourceId: `place-${i}`,
      }));

      const mockScrape = vi.fn().mockReturnValue(mockGenerator(manyLeads));
      MockedGooglePlacesSource.mockImplementation(() => {
        return { scrape: mockScrape } as any;
      });

      const result = await googlePlacesTool.execute({ query: 'test', limit: 200 });
      const parsed = JSON.parse(result);

      expect(parsed.totalFound).toBe(200);
      expect(parsed.results).toHaveLength(200);
      expect(parsed.results[199].businessName).toBe('Business 199');
    });

    it('should handle input with only query (minimal valid input)', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-key';

      const mockScrape = vi.fn().mockReturnValue(mockGenerator([]));
      MockedGooglePlacesSource.mockImplementation(() => {
        return { scrape: mockScrape } as any;
      });

      const result = await googlePlacesTool.execute({ query: 'minimal' });
      const parsed = JSON.parse(result);

      expect(parsed.available).toBe(true);
      expect(parsed.source).toBe('google_places');
      expect(parsed.totalFound).toBe(0);
      expect(parsed.results).toEqual([]);

      expect(mockScrape).toHaveBeenCalledWith({
        city: undefined,
        industry: 'minimal',
        limit: 50,
      });
    });

    it('should return valid JSON string in all cases (available)', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-key';

      const mockScrape = vi.fn().mockReturnValue(mockGenerator(singleLead));
      MockedGooglePlacesSource.mockImplementation(() => {
        return { scrape: mockScrape } as any;
      });

      const result = await googlePlacesTool.execute({ query: 'test' });

      expect(() => JSON.parse(result)).not.toThrow();
    });

    it('should return valid JSON string in all cases (unavailable)', async () => {
      delete process.env.GOOGLE_MAPS_API_KEY;

      const result = await googlePlacesTool.execute({ query: 'test' });

      expect(() => JSON.parse(result)).not.toThrow();
    });

    it('should return valid JSON string in all cases (error)', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-key';

      MockedGooglePlacesSource.mockImplementation(() => {
        throw new Error('break');
      });

      const result = await googlePlacesTool.execute({ query: 'test' });

      expect(() => JSON.parse(result)).not.toThrow();
    });

    it('should handle negative limit by passing it through to scrape', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-key';

      const mockScrape = vi.fn().mockReturnValue(mockGenerator([]));
      MockedGooglePlacesSource.mockImplementation(() => {
        return { scrape: mockScrape } as any;
      });

      await googlePlacesTool.execute({ query: 'test', limit: -10 });

      // Negative limit is truthy but falsy || won't catch it, so it passes through
      expect(mockScrape).toHaveBeenCalledWith(
        expect.objectContaining({ limit: -10 })
      );
    });

    it('should handle NaN limit by falling back to 50', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-key';

      const mockScrape = vi.fn().mockReturnValue(mockGenerator([]));
      MockedGooglePlacesSource.mockImplementation(() => {
        return { scrape: mockScrape } as any;
      });

      await googlePlacesTool.execute({ query: 'test', limit: NaN });

      // NaN is falsy in boolean context, so || 50 kicks in
      expect(mockScrape).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 50 })
      );
    });

    it('should handle string limit passed incorrectly by falling back to 50', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-key';

      const mockScrape = vi.fn().mockReturnValue(mockGenerator([]));
      MockedGooglePlacesSource.mockImplementation(() => {
        return { scrape: mockScrape } as any;
      });

      // Someone passes limit as string "100" — cast to number is NaN-ish
      const input = { query: 'test', limit: '100' };
      await googlePlacesTool.execute(input);

      // String '100' cast as number is NaN, which is falsy, so || 50
      // Actually, '100' as number via `as number` is just a type assertion,
      // at runtime it's still the string "100". "100" || 50 evaluates to "100"
      // because non-empty string is truthy
      expect(mockScrape).toHaveBeenCalledWith(
        expect.objectContaining({ limit: '100' })
      );
    });
  });
});