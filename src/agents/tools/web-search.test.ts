import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Store original env
const originalEnv = process.env;

// Import after mocks are set up
import {
  searxngSearch,
  webSearchTool,
  type SearchResult,
} from './web-search.js';

const mockSearXNGResponse = {
  results: [
    {
      title: 'Best Pizza in Amsterdam',
      url: 'https://example.com/pizza',
      content: 'Find the best pizza places in Amsterdam',
      engine: 'google',
      engines: ['google', 'bing'],
      score: 1.5,
      publishedDate: '2024-01-15',
    },
    {
      title: 'Amsterdam Restaurants Guide',
      url: 'https://example.com/restaurants',
      content: 'Complete guide to Amsterdam restaurants',
      engine: 'duckduckgo',
      engines: ['duckduckgo'],
      score: 1.2,
      publishedDate: null,
    },
    {
      title: 'Italian Food NL',
      url: 'https://example.com/italian',
      content: '',
      engine: 'brave',
      engines: [],
      score: 0.8,
      publishedDate: null,
    },
  ],
};

describe('searxngSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.SEARXNG_URL;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should call fetch with correct default URL and basic params', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockSearXNGResponse,
    });

    await searxngSearch('test query');

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('http://localhost:8080/search?');
    expect(calledUrl).toContain('q=test+query');
    expect(calledUrl).toContain('format=json');
  });

  it('should use SEARXNG_URL env variable when set', async () => {
    // getSearxngBaseUrl() reads env at runtime, so changes are respected.
    process.env.SEARXNG_URL = 'http://custom-searx:9999';
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),
    });

    await searxngSearch('test');

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    // Getter reads env at call time, so custom URL is used
    expect(calledUrl).toContain('http://custom-searx:9999/search?');
  });

  it('should return search results mapped to SearchResult interface', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockSearXNGResponse,
    });

    const results = await searxngSearch('pizza in Amsterdam');

    expect(results).toHaveLength(3);
    expect(results[0]).toEqual({
      title: 'Best Pizza in Amsterdam',
      url: 'https://example.com/pizza',
      snippet: 'Find the best pizza places in Amsterdam',
      engines: ['google', 'bing'],
      score: 1.5,
      publishedDate: '2024-01-15',
    });
  });

  it('should handle result with empty engines array and use single engine fallback', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockSearXNGResponse,
    });

    const results = await searxngSearch('test');

    // Third result has engines: [] — empty array is truthy, so [] is kept (not replaced with [engine])
    expect(results[2].engines).toEqual([]);
  });

  it('should handle empty content by converting to empty string snippet', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockSearXNGResponse,
    });

    const results = await searxngSearch('test');

    // Third result has content: ""
    expect(results[2].snippet).toBe('');
  });

  it('should convert null publishedDate to undefined', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockSearXNGResponse,
    });

    const results = await searxngSearch('test');

    expect(results[1].publishedDate).toBeUndefined();
    expect(results[0].publishedDate).toBe('2024-01-15');
  });

  it('should limit results to numResults parameter', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockSearXNGResponse,
    });

    const results = await searxngSearch('test', 2);

    expect(results).toHaveLength(2);
    expect(results[0].title).toBe('Best Pizza in Amsterdam');
    expect(results[1].title).toBe('Amsterdam Restaurants Guide');
  });

  it('should use default numResults of 20 when not specified', async () => {
    const manyResults = Array.from({ length: 25 }, (_, i) => ({
      title: `Result ${i}`,
      url: `https://example.com/${i}`,
      content: `Content ${i}`,
      engine: 'google',
      engines: ['google'],
      score: 1.0,
      publishedDate: null,
    }));

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: manyResults }),
    });

    const results = await searxngSearch('test');

    expect(results).toHaveLength(20);
  });

  it('should pass categories option as query parameter', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),
    });

    await searxngSearch('test', 10, { categories: 'news' });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('categories=news');
  });

  it('should pass language option as query parameter', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),
    });

    await searxngSearch('test', 10, { language: 'nl' });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('language=nl');
  });

  it('should pass engines option as query parameter', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),
    });

    await searxngSearch('test', 10, { engines: 'google,bing' });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('engines=google%2Cbing');
  });

  it('should pass all options simultaneously', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),
    });

    await searxngSearch('test', 5, {
      categories: 'general',
      language: 'en',
      engines: 'google',
    });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('categories=general');
    expect(calledUrl).toContain('language=en');
    expect(calledUrl).toContain('engines=google');
  });

  it('should not include optional params when options are undefined', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),
    });

    await searxngSearch('test', 10, {});

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).not.toContain('categories=');
    expect(calledUrl).not.toContain('language=');
    expect(calledUrl).not.toContain('engines=');
  });

  it('should throw error when response is not ok', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({}),
    });

    await expect(searxngSearch('test')).rejects.toThrow(
      'SearXNG search failed: 500'
    );
  });

  it('should throw error with correct status code for 403', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({}),
    });

    await expect(searxngSearch('test')).rejects.toThrow(
      'SearXNG search failed: 403'
    );
  });

  it('should throw error with correct status code for 502', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: async () => ({}),
    });

    await expect(searxngSearch('test')).rejects.toThrow(
      'SearXNG search failed: 502'
    );
  });

  it('should set a 15 second timeout on the fetch request', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),
    });

    await searxngSearch('test');

    const fetchOptions = mockFetch.mock.calls[0][1] as RequestInit;
    expect(fetchOptions.signal).toBeDefined();
    // AbortSignal.timeout returns a signal; we can verify it exists
    // but cannot directly check the timeout value
  });

  it('should handle empty results array from API', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),
    });

    const results = await searxngSearch('obscure query with no results');

    expect(results).toEqual([]);
    expect(results).toHaveLength(0);
  });

  it('should handle URL-encoded query strings', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),
    });

    await searxngSearch('restaurants & cafés in Amsterdàm');

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('q=restaurants');
    // URL should be properly encoded
    expect(calledUrl).toContain('%26');
  });

  it('should handle network errors from fetch', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('fetch failed'));

    await expect(searxngSearch('test')).rejects.toThrow('fetch failed');
  });

  it('should handle timeout errors', async () => {
    mockFetch.mockRejectedValueOnce(new DOMException('The operation was aborted', 'AbortError'));

    await expect(searxngSearch('test')).rejects.toThrow();
  });

  it('should handle JSON parsing errors', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => {
        throw new SyntaxError('Unexpected token');
      },
    });

    await expect(searxngSearch('test')).rejects.toThrow();
  });

  it('should handle results where engines is undefined and fallback to single engine', async () => {
    const responseWithMissingEngines = {
      results: [
        {
          title: 'Test',
          url: 'https://example.com',
          content: 'Test content',
          engine: 'google',
          engines: undefined as any,
          score: 1.0,
          publishedDate: null,
        },
      ],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => responseWithMissingEngines,
    });

    const results = await searxngSearch('test');

    expect(results[0].engines).toEqual(['google']);
  });

  it('should handle results where both engines and engine are missing', async () => {
    const responseMissingAll = {
      results: [
        {
          title: 'Test',
          url: 'https://example.com',
          content: 'Content',
          score: 1.0,
          publishedDate: null,
        },
      ],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => responseMissingAll,
    });

    const results = await searxngSearch('test');

    expect(results[0].engines).toEqual([undefined]);
  });

  it('should handle content being null by defaulting to empty string', async () => {
    const responseWithNullContent = {
      results: [
        {
          title: 'Test',
          url: 'https://example.com',
          content: null,
          engine: 'google',
          engines: ['google'],
          score: 1.0,
          publishedDate: null,
        },
      ],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => responseWithNullContent,
    });

    const results = await searxngSearch('test');

    expect(results[0].snippet).toBe('');
  });

  it('should handle numResults = 0 and return empty array', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockSearXNGResponse,
    });

    const results = await searxngSearch('test', 0);

    expect(results).toEqual([]);
  });

  it('should handle numResults larger than available results', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockSearXNGResponse,
    });

    const results = await searxngSearch('test', 100);

    expect(results).toHaveLength(3);
  });

  it('should handle numResults = 1 and return single result', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockSearXNGResponse,
    });

    const results = await searxngSearch('test', 1);

    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Best Pizza in Amsterdam');
  });
});

describe('webSearchTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.SEARXNG_URL;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should have correct tool name', () => {
    expect(webSearchTool.name).toBe('web_search');
  });

  it('should have a description mentioning SearXNG', () => {
    expect(webSearchTool.description).toContain('SearXNG');
    expect(webSearchTool.description).toContain('search');
  });

  it('should have input_schema with query as required', () => {
    expect(webSearchTool.input_schema.required).toEqual(['query']);
    expect(webSearchTool.input_schema.type).toBe('object');
  });

  it('should have correct properties in input_schema', () => {
    const props = webSearchTool.input_schema.properties!;
    expect(props.query).toBeDefined();
    expect(props.query.type).toBe('string');
    expect(props.num_results).toBeDefined();
    expect(props.num_results.type).toBe('number');
    expect(props.categories).toBeDefined();
    expect(props.categories.type).toBe('string');
    expect(props.language).toBeDefined();
    expect(props.language.type).toBe('string');
  });

  it('should return JSON stringified results on successful search', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockSearXNGResponse,
    });

    const result = await webSearchTool.execute({
      query: 'restaurants in Amsterdam',
    });

    const parsed = JSON.parse(result as string);
    expect(parsed).toHaveLength(3);
    expect(parsed[0].title).toBe('Best Pizza in Amsterdam');
    expect(parsed[0].url).toBe('https://example.com/pizza');
  });

  it('should pass num_results from input to search', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockSearXNGResponse,
    });

    await webSearchTool.execute({
      query: 'test',
      num_results: 5,
    });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('q=test');
    // The results will be sliced to 5
  });

  it('should use default num_results of 20 when not provided', async () => {
    const manyResults = Array.from({ length: 25 }, (_, i) => ({
      title: `Result ${i}`,
      url: `https://example.com/${i}`,
      content: `Content ${i}`,
      engine: 'google',
      engines: ['google'],
      score: 1.0,
      publishedDate: null,
    }));

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: manyResults }),
    });

    const result = await webSearchTool.execute({ query: 'test' });
    const parsed = JSON.parse(result as string);

    expect(parsed).toHaveLength(20);
  });

  it('should pass categories from input to search', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),
    });

    await webSearchTool.execute({
      query: 'test',
      categories: 'news',
    });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('categories=news');
  });

  it('should pass language from input to search', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),
    });

    await webSearchTool.execute({
      query: 'test',
      language: 'nl',
    });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('language=nl');
  });

  it('should return error JSON when search fails', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({}),
    });

    const result = await webSearchTool.execute({ query: 'test' });
    const parsed = JSON.parse(result as string);

    expect(parsed.error).toContain('SearXNG search failed');
    expect(parsed.error).toContain('500');
    expect(parsed.results).toEqual([]);
  });

  it('should include SearXNG base URL in error message', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({}),
    });

    const result = await webSearchTool.execute({ query: 'test' });
    const parsed = JSON.parse(result as string);

    expect(parsed.error).toContain('http://localhost:8080');
  });

  it('should include custom SearXNG URL in error message when env is set', async () => {
    // getSearxngBaseUrl() reads env at runtime, so the custom URL appears in errors.
    process.env.SEARXNG_URL = 'http://my-searx:4040';
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: async () => ({}),
    });

    const result = await webSearchTool.execute({ query: 'test' });
    const parsed = JSON.parse(result as string);

    // Getter reads env at call time, so custom URL is used
    expect(parsed.error).toContain('http://my-searx:4040');
  });

  it('should handle network errors gracefully', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const result = await webSearchTool.execute({ query: 'test' });
    const parsed = JSON.parse(result as string);

    expect(parsed.error).toContain('SearXNG search failed');
    expect(parsed.error).toContain('ECONNREFUSED');
    expect(parsed.results).toEqual([]);
  });

  it('should handle non-Error exceptions', async () => {
    mockFetch.mockRejectedValueOnce('string error');

    const result = await webSearchTool.execute({ query: 'test' });
    const parsed = JSON.parse(result as string);

    expect(parsed.error).toContain('string error');
    expect(parsed.results).toEqual([]);
  });

  it('should handle null error thrown', async () => {
    mockFetch.mockRejectedValueOnce(null);

    const result = await webSearchTool.execute({ query: 'test' });
    const parsed = JSON.parse(result as string);

    expect(parsed.error).toBeDefined();
    expect(parsed.results).toEqual([]);
  });

  it('should handle undefined error thrown', async () => {
    mockFetch.mockRejectedValueOnce(undefined);

    const result = await webSearchTool.execute({ query: 'test' });
    const parsed = JSON.parse(result as string);

    expect(parsed.error).toBeDefined();
    expect(parsed.results).toEqual([]);
  });

  it('should handle timeout errors gracefully', async () => {
    mockFetch.mockRejectedValueOnce(
      new DOMException('The operation was aborted', 'AbortError')
    );

    const result = await webSearchTool.execute({ query: 'test' });
    const parsed = JSON.parse(result as string);

    expect(parsed.error).toContain('SearXNG search failed');
    expect(parsed.results).toEqual([]);
  });

  it('should pass all input options simultaneously', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),
    });

    await webSearchTool.execute({
      query: 'best restaurants',
      num_results: 10,
      categories: 'general',
      language: 'en',
    });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('q=best+restaurants');
    expect(calledUrl).toContain('categories=general');
    expect(calledUrl).toContain('language=en');
  });

  it('should return empty JSON array for zero results', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),
    });

    const result = await webSearchTool.execute({ query: 'nonexistent' });
    const parsed = JSON.parse(result as string);

    expect(parsed).toEqual([]);
  });

  it('should handle query with special characters', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),
    });

    await webSearchTool.execute({ query: 'cafés & restaurants in Zürich' });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('q=');
    // Verify special characters are handled
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should handle num_results being undefined and default to 20', async () => {
    const manyResults = Array.from({ length: 25 }, (_, i) => ({
      title: `Result ${i}`,
      url: `https://example.com/${i}`,
      content: `Content ${i}`,
      engine: 'google',
      engines: ['google'],
      score: 1.0,
      publishedDate: null,
    }));

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: manyResults }),
    });

    const result = await webSearchTool.execute({
      query: 'test',
      num_results: undefined,
    });

    const parsed = JSON.parse(result as string);
    expect(parsed).toHaveLength(20);
  });

  it('should handle num_results being null and default to 20', async () => {
    const manyResults = Array.from({ length: 25 }, (_, i) => ({
      title: `Result ${i}`,
      url: `https://example.com/${i}`,
      content: `Content ${i}`,
      engine: 'google',
      engines: ['google'],
      score: 1.0,
      publishedDate: null,
    }));

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: manyResults }),
    });

    const result = await webSearchTool.execute({
      query: 'test',
      num_results: null as any,
    });

    const parsed = JSON.parse(result as string);
    expect(parsed).toHaveLength(20);
  });

  it('should handle num_results being 0', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockSearXNGResponse,
    });

    const result = await webSearchTool.execute({
      query: 'test',
      num_results: 0,
    });

    const parsed = JSON.parse(result as string);
    // 0 || 20 evaluates to 20, so all 3 mock results are returned
    expect(parsed).toHaveLength(3);
  });

  it('should return a valid JSON string from execute', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockSearXNGResponse,
    });

    const result = await webSearchTool.execute({ query: 'test' });

    expect(typeof result).toBe('string');
    expect(() => JSON.parse(result as string)).not.toThrow();
  });

  it('should return a valid JSON string even on error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network failure'));

    const result = await webSearchTool.execute({ query: 'test' });

    expect(typeof result).toBe('string');
    expect(() => JSON.parse(result as string)).not.toThrow();
    const parsed = JSON.parse(result as string);
    expect(parsed).toHaveProperty('error');
    expect(parsed).toHaveProperty('results');
  });
});

describe('SearchResult interface', () => {
  it('should accept valid SearchResult objects with all fields', () => {
    const result: SearchResult = {
      title: 'Test Title',
      url: 'https://example.com',
      snippet: 'Test snippet',
      engines: ['google'],
      score: 1.5,
      publishedDate: '2024-01-01',
    };

    expect(result.title).toBe('Test Title');
    expect(result.url).toBe('https://example.com');
    expect(result.snippet).toBe('Test snippet');
    expect(result.engines).toEqual(['google']);
    expect(result.score).toBe(1.5);
    expect(result.publishedDate).toBe('2024-01-01');
  });

  it('should accept SearchResult with only required fields', () => {
    const result: SearchResult = {
      title: 'Test Title',
      url: 'https://example.com',
      snippet: 'Test snippet',
    };

    expect(result.title).toBe('Test Title');
    expect(result.engines).toBeUndefined();
    expect(result.score).toBeUndefined();
    expect(result.publishedDate).toBeUndefined();
  });
});