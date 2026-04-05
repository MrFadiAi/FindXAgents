import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { kvkSearchTool } from './kvk-search.js';

// Mock the KvkSource module
vi.mock('../../modules/discovery/sources/kvk.js', () => {
  return {
    KvkSource: vi.fn(),
  };
});

// Import the mocked class
import { KvkSource } from '../../modules/discovery/sources/kvk.js';

// Type the mock for better TypeScript support
const MockedKvkSource = vi.mocked(KvkSource);

describe('kvkSearchTool', () => {
  let mockScrape: any;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    mockScrape = vi.fn();
    
    MockedKvkSource.mockImplementation(() => ({
      scrape: mockScrape,
    }));
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('tool configuration', () => {
    it('should have correct tool name', () => {
      expect(kvkSearchTool.name).toBe('kvk_search');
    });

    it('should have a description mentioning Dutch Chamber of Commerce', () => {
      expect(kvkSearchTool.description).toContain('Dutch Chamber of Commerce');
      expect(kvkSearchTool.description).toContain('KVK');
    });

    it('should define input_schema as object type', () => {
      expect(kvkSearchTool.input_schema.type).toBe('object');
    });

    it('should require "query" in input schema', () => {
      expect(kvkSearchTool.input_schema.required).toContain('query');
    });

    it('should define query property as string', () => {
      expect(kvkSearchTool.input_schema.properties.query).toEqual({
        type: 'string',
        description: 'Business name or trade name to search',
      });
    });

    it('should define city property as string', () => {
      expect(kvkSearchTool.input_schema.properties.city).toEqual({
        type: 'string',
        description: 'City to filter by',
      });
    });

    it('should define industry property as string', () => {
      expect(kvkSearchTool.input_schema.properties.industry).toEqual({
        type: 'string',
        description: 'SBI code or industry description to filter by',
      });
    });

    it('should define limit property as number', () => {
      expect(kvkSearchTool.input_schema.properties.limit).toEqual({
        type: 'number',
        description: 'Max number of results (default 50)',
      });
    });
  });

  describe('execute', () => {
    it('should return unavailable message when KVK_API_KEY is not configured', async () => {
      delete process.env.KVK_API_KEY;

      const result = await kvkSearchTool.execute({ query: 'test business' });
      const parsed = JSON.parse(result as string);

      expect(parsed).toEqual({
        available: false,
        message: 'KVK API is not configured (missing KVK_API_KEY). Use web_search instead to find businesses.',
      });
      expect(MockedKvkSource).not.toHaveBeenCalled();
    });

    it('should return unavailable message when KVK_API_KEY is empty string', async () => {
      process.env.KVK_API_KEY = '';

      const result = await kvkSearchTool.execute({ query: 'test business' });
      const parsed = JSON.parse(result as string);

      expect(parsed).toEqual({
        available: false,
        message: 'KVK API is not configured (missing KVK_API_KEY). Use web_search instead to find businesses.',
      });
      expect(MockedKvkSource).not.toHaveBeenCalled();
    });

    it('should instantiate KvkSource with apiKey from environment', async () => {
      process.env.KVK_API_KEY = 'test-api-key-123';

      // Mock async generator that yields nothing
      mockScrape.mockReturnValue((async function* () {})());

      await kvkSearchTool.execute({ query: 'test business' });

      expect(MockedKvkSource).toHaveBeenCalledWith({ apiKey: 'test-api-key-123' });
    });

    it('should call scrape with correct parameters from input', async () => {
      process.env.KVK_API_KEY = 'test-api-key';

      mockScrape.mockReturnValue((async function* () {})());

      await kvkSearchTool.execute({
        query: 'Coffee Shop',
        city: 'Amsterdam',
        industry: 'Hospitality',
        limit: 25,
      });

      expect(mockScrape).toHaveBeenCalledWith({
        city: 'Amsterdam',
        industry: 'Hospitality',
        limit: 25,
      });
    });

    it('should default limit to 50 when not provided', async () => {
      process.env.KVK_API_KEY = 'test-api-key';

      mockScrape.mockReturnValue((async function* () {})());

      await kvkSearchTool.execute({ query: 'Test' });

      expect(mockScrape).toHaveBeenCalledWith({
        city: undefined,
        industry: undefined,
        limit: 50,
      });
    });

    it('should pass undefined for city and industry when not provided', async () => {
      process.env.KVK_API_KEY = 'test-api-key';

      mockScrape.mockReturnValue((async function* () {})());

      await kvkSearchTool.execute({ query: 'Test', limit: 10 });

      expect(mockScrape).toHaveBeenCalledWith({
        city: undefined,
        industry: undefined,
        limit: 10,
      });
    });

    it('should collect leads from async generator and return JSON string', async () => {
      process.env.KVK_API_KEY = 'test-api-key';

      const mockLeads = [
        {
          businessName: 'Business A',
          kvkNumber: '12345678',
          address: 'Main Street 1',
          city: 'Amsterdam',
          industry: 'Tech',
          website: 'https://a.nl',
          postcode: '1011AA',
        },
        {
          businessName: 'Business B',
          kvkNumber: '87654321',
          address: 'Side Street 2',
          city: 'Rotterdam',
          industry: 'Finance',
          website: 'https://b.nl',
          postcode: '3011BB',
        },
      ];

      mockScrape.mockReturnValue((async function* () {
        for (const lead of mockLeads) {
          yield lead;
        }
      })());

      const result = await kvkSearchTool.execute({ query: 'Business' });
      const parsed = JSON.parse(result as string);

      expect(parsed).toEqual({
        available: true,
        source: 'kvk',
        totalFound: 2,
        results: mockLeads,
      });
    });

    it('should return empty results when scrape yields no leads', async () => {
      process.env.KVK_API_KEY = 'test-api-key';

      mockScrape.mockReturnValue((async function* () {})());

      const result = await kvkSearchTool.execute({ query: 'Nonexistent' });
      const parsed = JSON.parse(result as string);

      expect(parsed).toEqual({
        available: true,
        source: 'kvk',
        totalFound: 0,
        results: [],
      });
    });

    it('should handle leads with undefined optional fields', async () => {
      process.env.KVK_API_KEY = 'test-api-key';

      mockScrape.mockReturnValue(
        (async function* () {
          yield {
            businessName: 'Partial Business',
            kvkNumber: '11122233',
            address: undefined,
            city: undefined,
            industry: undefined,
            website: undefined,
            postcode: undefined,
          };
        })()
      );

      const result = await kvkSearchTool.execute({ query: 'Partial' });
      const parsed = JSON.parse(result as string);

      expect(parsed.totalFound).toBe(1);
      expect(parsed.results[0]).toEqual({
        businessName: 'Partial Business',
        kvkNumber: '11122233',
        address: undefined,
        city: undefined,
        industry: undefined,
        website: undefined,
        postcode: undefined,
      });
    });

    it('should handle large number of results from scrape', async () => {
      process.env.KVK_API_KEY = 'test-api-key';

      const largeLeadSet = Array.from({ length: 200 }, (_, i) => ({
        businessName: `Business ${i}`,
        kvkNumber: String(10000000 + i),
        address: `Address ${i}`,
        city: 'City',
        industry: 'Industry',
        website: `https://${i}.nl`,
        postcode: '1234AB',
      }));

      mockScrape.mockReturnValue(
        (async function* () {
          for (const lead of largeLeadSet) {
            yield lead;
          }
        })()
      );

      const result = await kvkSearchTool.execute({ query: 'Business', limit: 200 });
      const parsed = JSON.parse(result as string);

      expect(parsed.totalFound).toBe(200);
      expect(parsed.results).toHaveLength(200);
      expect(parsed.results[0].businessName).toBe('Business 0');
      expect(parsed.results[199].businessName).toBe('Business 199');
    });

    it('should handle Error thrown by scrape', async () => {
      process.env.KVK_API_KEY = 'test-api-key';

      mockScrape.mockImplementation(() => {
        throw new Error('Network timeout');
      });

      const result = await kvkSearchTool.execute({ query: 'Test' });
      const parsed = JSON.parse(result as string);

      expect(parsed).toEqual({
        available: true,
        error: 'KVK API call failed: Network timeout',
        results: [],
      });
    });

    it('should handle non-Error thrown by scrape', async () => {
      process.env.KVK_API_KEY = 'test-api-key';

      mockScrape.mockImplementation(() => {
        throw 'Something went horribly wrong'; // eslint-disable-line no-throw-literal
      });

      const result = await kvkSearchTool.execute({ query: 'Test' });
      const parsed = JSON.parse(result as string);

      expect(parsed).toEqual({
        available: true,
        error: 'KVK API call failed: Something went horribly wrong',
        results: [],
      });
    });

    it('should handle error thrown as number', async () => {
      process.env.KVK_API_KEY = 'test-api-key';

      mockScrape.mockImplementation(() => {
        throw 42; // eslint-disable-line no-throw-literal
      });

      const result = await kvkSearchTool.execute({ query: 'Test' });
      const parsed = JSON.parse(result as string);

      expect(parsed).toEqual({
        available: true,
        error: 'KVK API call failed: 42',
        results: [],
      });
    });

    it('should handle error during async iteration (yield throws)', async () => {
      process.env.KVK_API_KEY = 'test-api-key';

      mockScrape.mockReturnValue(
        (async function* () {
          yield {
            businessName: 'First',
            kvkNumber: '111',
            address: 'Addr',
            city: 'City',
            industry: 'Ind',
            website: 'https://first.nl',
            postcode: '1111AA',
          };
          throw new Error('Rate limited');
        })()
      );

      const result = await kvkSearchTool.execute({ query: 'Test' });
      const parsed = JSON.parse(result as string);

      expect(parsed).toEqual({
        available: true,
        error: 'KVK API call failed: Rate limited',
        results: [],
      });
    });

    it('should only extract specific fields from each lead', async () => {
      process.env.KVK_API_KEY = 'test-api-key';

      mockScrape.mockReturnValue(
        (async function* () {
          yield {
            businessName: 'Business',
            kvkNumber: '123',
            address: 'Street',
            city: 'City',
            industry: 'Tech',
            website: 'https://biz.nl',
            postcode: '1234AB',
            extraField: 'should not appear',
            anotherExtra: 42,
          };
        })()
      );

      const result = await kvkSearchTool.execute({ query: 'Business' });
      const parsed = JSON.parse(result as string);

      expect(parsed.results[0]).toEqual({
        businessName: 'Business',
        kvkNumber: '123',
        address: 'Street',
        city: 'City',
        industry: 'Tech',
        website: 'https://biz.nl',
        postcode: '1234AB',
      });
      // Extra fields should not be included
      expect(parsed.results[0]).not.toHaveProperty('extraField');
      expect(parsed.results[0]).not.toHaveProperty('anotherExtra');
    });

    it('should always return a JSON string', async () => {
      process.env.KVK_API_KEY = 'test-api-key';

      mockScrape.mockReturnValue((async function* () {})());

      const result = await kvkSearchTool.execute({ query: 'Test' });

      expect(typeof result).toBe('string');
      expect(() => JSON.parse(result as string)).not.toThrow();
    });

    it('should always return a JSON string even when API key is missing', async () => {
      delete process.env.KVK_API_KEY;

      const result = await kvkSearchTool.execute({ query: 'Test' });

      expect(typeof result).toBe('string');
      expect(() => JSON.parse(result as string)).not.toThrow();
    });

    it('should always return a JSON string even when error occurs', async () => {
      process.env.KVK_API_KEY = 'test-api-key';

      mockScrape.mockImplementation(() => {
        throw new Error('Critical failure');
      });

      const result = await kvkSearchTool.execute({ query: 'Test' });

      expect(typeof result).toBe('string');
      expect(() => JSON.parse(result as string)).not.toThrow();
    });

    it('should handle limit of 0 (falsy, falls back to 50)', async () => {
      process.env.KVK_API_KEY = 'test-api-key';

      mockScrape.mockReturnValue((async function* () {})());

      await kvkSearchTool.execute({ query: 'Test', limit: 0 });

      expect(mockScrape).toHaveBeenCalledWith({
        city: undefined,
        industry: undefined,
        limit: 50, // 0 is falsy, so || 50 kicks in
      });
    });

    it('should handle negative limit value', async () => {
      process.env.KVK_API_KEY = 'test-api-key';

      mockScrape.mockReturnValue((async function* () {})());

      await kvkSearchTool.execute({ query: 'Test', limit: -5 });

      // -5 is truthy so it passes through as-is
      expect(mockScrape).toHaveBeenCalledWith({
        city: undefined,
        industry: undefined,
        limit: -5,
      });
    });
  });
});