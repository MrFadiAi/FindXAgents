import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  checkWebsite,
  checkWebsites,
  extractUrlsFromLeads,
} from './website-checker';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('checkWebsite', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return status "none" for an empty string url', async () => {
    const resultPromise = checkWebsite('');
    const result = await resultPromise;
    
    expect(result.status).toBe('none');
    expect(result.url).toBe('');
    expect(result.responseTimeMs).toBeGreaterThanOrEqual(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should normalize url by adding https:// if missing', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
    });

    await checkWebsite('example.com');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com',
      expect.any(Object),
    );
  });

  it('should normalize url by trimming whitespace', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
    });

    await checkWebsite('  example.com  ');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com',
      expect.any(Object),
    );
  });

  it('should not modify url that already has http://', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
    });

    await checkWebsite('http://example.com');

    expect(mockFetch).toHaveBeenCalledWith(
      'http://example.com',
      expect.any(Object),
    );
  });

  it('should not modify url that already has https://', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
    });

    await checkWebsite('https://example.com');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com',
      expect.any(Object),
    );
  });

  it('should return status "active" for a 200 response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
    });

    const result = await checkWebsite('https://active.com');

    expect(result.status).toBe('active');
    expect(result.url).toBe('https://active.com');
    expect(result.statusCode).toBe(200);
    expect(result.finalUrl).toBeUndefined();
    expect(result.error).toBeUndefined();
  });

  it('should include finalUrl if redirects happened before 200', async () => {
    const headers = new Headers();
    headers.set('Location', 'https://redirected.com');
    
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 301,
      headers,
    });
    
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
    });

    const result = await checkWebsite('https://example.com');

    expect(result.status).toBe('active');
    expect(result.finalUrl).toBe('https://redirected.com/');
    expect(result.statusCode).toBe(200);
  });

  it('should return status "error" for 4xx responses', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      headers: new Headers(),
    });

    const result = await checkWebsite('https://notfound.com');

    expect(result.status).toBe('error');
    expect(result.statusCode).toBe(404);
    expect(result.error).toBe('HTTP 404');
  });

  it('should return status "error" for 5xx responses', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      headers: new Headers(),
    });

    const result = await checkWebsite('https://broken.com');

    expect(result.status).toBe('error');
    expect(result.statusCode).toBe(500);
    expect(result.error).toBe('HTTP 500');
  });

  it('should return status "redirect" when max redirects are exceeded', async () => {
    const headers = new Headers();
    headers.set('Location', 'https://loop.com');
    
    const redirectResponse = {
      ok: false,
      status: 301,
      headers,
    };

    // Exceed limit of 5
    mockFetch.mockResolvedValue(redirectResponse);

    const result = await checkWebsite('https://loop.com');

    expect(result.status).toBe('redirect');
    expect(result.error).toBe('Exceeded 5 redirects');
    expect(result.finalUrl).toBe('https://loop.com/');
    expect(mockFetch).toHaveBeenCalledTimes(5);
  });

  it('should return status "error" for redirect without location header', async () => {
    const headers = new Headers(); // No Location header
    
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 301,
      headers,
    });

    const result = await checkWebsite('https://badredirect.com');

    expect(result.status).toBe('error');
    expect(result.error).toBe('Redirect without location header');
    expect(result.statusCode).toBe(301);
  });

  it('should resolve relative Location headers correctly', async () => {
    const relativeHeaders = new Headers();
    relativeHeaders.set('Location', '/about');
    
    const successHeaders = new Headers();
    
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 302,
      headers: relativeHeaders,
    });
    
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: successHeaders,
    });

    const result = await checkWebsite('https://example.com');

    // Checks second fetch call used the absolute URL
    expect(mockFetch).toHaveBeenNthCalledWith(2, 'https://example.com/about', expect.any(Object));
    expect(result.status).toBe('active');
    expect(result.finalUrl).toBe('https://example.com/about');
  });

  it('should return status "none" for ECONNREFUSED errors', async () => {
    const error = new Error('ECONNREFUSED');
    mockFetch.mockRejectedValueOnce(error);

    const result = await checkWebsite('https://refused.com');

    expect(result.status).toBe('none');
    expect(result.error).toBe('ECONNREFUSED');
  });

  it('should return status "none" for ENOTFOUND errors', async () => {
    const error = new Error('ENOTFOUND');
    mockFetch.mockRejectedValueOnce(error);

    const result = await checkWebsite('https://unresolved.com');

    expect(result.status).toBe('none');
    expect(result.error).toBe('ENOTFOUND');
  });

  it('should return status "none" for timeout errors', async () => {
    const error = new Error('The operation was aborted due to timeout');
    mockFetch.mockRejectedValueOnce(error);

    const result = await checkWebsite('https://slow.com');

    expect(result.status).toBe('none');
    expect(result.error).toContain('timeout');
  });

  it('should return status "error" for non-network fetch errors', async () => {
    const error = new Error('Some weird internal error');
    mockFetch.mockRejectedValueOnce(error);

    const result = await checkWebsite('https://weird-error.com');

    expect(result.status).toBe('error');
    expect(result.error).toBe('Some weird internal error');
  });

  it('should return status "error" with "Unknown error" if thrown error is not an Error instance', async () => {
    mockFetch.mockRejectedValueOnce('string error');

    const result = await checkWebsite('https://throw-string.com');

    expect(result.status).toBe('error');
    expect(result.error).toBe('Unknown error');
  });

  it('should include responseTimeMs that is realistically >= 0', async () => {
    mockFetch.mockImplementationOnce(() => {
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            ok: true,
            status: 200,
            headers: new Headers(),
          });
        }, 150);
      });
    });

    const result = await checkWebsite('https://slow-respond.com');

    expect(result.responseTimeMs).toBeGreaterThanOrEqual(100);
  });

  it('should pass correct headers to fetch', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
    });

    await checkWebsite('https://headers-test.com');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://headers-test.com',
      expect.objectContaining({
        method: 'HEAD',
        redirect: 'manual',
        headers: {
          'User-Agent': 'FindX-Bot/1.0 (business prospecting; +https://findx.nl)',
          Accept: 'text/html',
        },
      }),
    );
  });
});

describe('checkWebsites', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('should return an empty map for empty array of urls', async () => {
    const result = await checkWebsites([]);
    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
  });

  it('should process a batch of urls and return map of results', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
    });

    const urls = ['https://one.com', 'https://two.com', 'https://three.com'];
    const results = await checkWebsites(urls);

    expect(results.size).toBe(3);
    expect(results.get('https://one.com')?.status).toBe('active');
    expect(results.get('https://two.com')?.status).toBe('active');
    expect(results.get('https://three.com')?.status).toBe('active');
  });

  it('should handle concurrency and mixed results properly', async () => {
    const errorHeaders = new Headers();
    errorHeaders.set('Location', 'https://fail.com');

    mockFetch
      .mockRejectedValueOnce(new Error('ENOTFOUND'))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        headers: new Headers(),
      });

    const urls = ['https://none.com', 'https://active.com', 'https://error.com'];
    const results = await checkWebsites(urls);

    expect(results.get('https://none.com')?.status).toBe('none');
    expect(results.get('https://active.com')?.status).toBe('active');
    expect(results.get('https://error.com')?.status).toBe('error');
  });

  it('should maintain original keys from the input urls array', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
    });

    const urls = ['example.com']; // will be normalized internally
    const results = await checkWebsites(urls);

    // Map key should be the exact original URL provided in the array
    expect(results.has('example.com')).toBe(true);
    // The internal fetch uses normalized URL
    expect(mockFetch).toHaveBeenCalledWith('https://example.com', expect.any(Object));
  });
});

describe('extractUrlsFromLeads', () => {
  it('should filter out leads without a website', () => {
    const leads = [
      { name: 'Lead 1', website: null },
      { name: 'Lead 2' },
      { name: 'Lead 3', website: undefined },
    ];
    
    const urls = extractUrlsFromLeads(leads);
    expect(urls).toEqual([]);
  });

  it('should extract valid websites from leads', () => {
    const leads = [
      { name: 'Lead 1', website: 'https://test.com' },
      { name: 'Lead 2', website: 'example.org' },
    ];
    
    const urls = extractUrlsFromLeads(leads);
    expect(urls).toEqual(['https://test.com', 'example.org']);
  });

  it('should trim whitespace from extracted urls', () => {
    const leads = [
      { name: 'Lead 1', website: '  https://spaced.com  ' },
    ];
    
    const urls = extractUrlsFromLeads(leads);
    expect(urls).toEqual(['https://spaced.com']);
  });

  it('should filter out empty strings and whitespace-only strings', () => {
    const leads = [
      { name: 'Lead 1', website: '' },
      { name: 'Lead 2', website: '   ' },
      { name: 'Lead 3', website: 'valid.com' },
    ];
    
    const urls = extractUrlsFromLeads(leads);
    expect(urls).toEqual(['valid.com']);
  });

  it('should return an empty array if given an empty array', () => {
    const urls = extractUrlsFromLeads([]);
    expect(urls).toEqual([]);
  });

  it('should correctly handle mixed valid and invalid leads', () => {
    const leads = [
      { name: 'Valid', website: 'https://good.com' },
      { name: 'Null', website: null },
      { name: 'Empty', website: '' },
      { name: 'Undefined', website: undefined },
      { name: 'Whitespace', website: '   ' },
      { name: 'Also Valid', website: 'another.ca' },
    ];

    const urls = extractUrlsFromLeads(leads);
    expect(urls).toEqual(['https://good.com', 'another.ca']);
  });
});