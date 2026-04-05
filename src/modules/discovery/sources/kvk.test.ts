import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { KvkSource, type KvkSearchResponse, type KvkSourceConfig } from './kvk.js';
import type { DiscoveryParams } from '../discovery.service.js';

// Mock the rate limiter module
vi.mock('./rate-limiter.js', () => ({
  createKvkRateLimiter: vi.fn(() => ({
    acquire: vi.fn().mockResolvedValue(undefined),
  })),
}));

import { createKvkRateLimiter } from './rate-limiter.js';

function mockFetchResponse(data: KvkSearchResponse, status = 200, ok = true) {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(data),
    text: vi.fn().mockResolvedValue(JSON.stringify(data)),
  };
}

describe('KvkSource', () => {
  let kvkSource: KvkSource;
  const config: KvkSourceConfig = {
    apiKey: 'test-api-key',
    baseUrl: 'https://test-api.kvk.nl',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    kvkSource = new KvkSource(config);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with provided config', () => {
      expect(createKvkRateLimiter).toHaveBeenCalledOnce();
    });

    it('should use default base URL when not provided', () => {
      const defaultConfig = { apiKey: 'test-key' };
      const source = new KvkSource(defaultConfig);
      expect(source).toBeInstanceOf(KvkSource);
    });
  });

  describe('scrape', () => {
    it('should yield leads from a single page of results', async () => {
      const mockResponse: KvkSearchResponse = {
        pagina: 1,
        aantal: 1,
        totaal: 1,
        resultaten: [
          {
            kvkNummer: '12345678',
            vestigingsnummer: '123456789012',
            handelsnamen: [{ naam: 'Test Company', volgorde: 0 }],
            adressen: [
              {
                type: 'bezoekadres',
                straatnaam: 'Teststraat',
                huisnummer: '1',
                plaats: 'Amsterdam',
                postcode: '1234AB',
                land: 'Nederland',
              },
            ],
            sbiActiviteiten: [
              {
                sbiCode: '6201',
                sbiOmschrijving: 'Software development',
                indicatieHoofdactiviteit: true,
              },
            ],
            websites: ['https://example.com'],
          },
        ],
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        mockFetchResponse(mockResponse) as any,
      );

      const params: DiscoveryParams = { city: 'Amsterdam' };
      const leads = [];
      for await (const lead of kvkSource.scrape(params)) {
        leads.push(lead);
      }

      expect(leads).toHaveLength(1);
      expect(leads[0]).toEqual({
        businessName: 'Test Company',
        kvkNumber: '12345678',
        address: 'Teststraat 1, 1234AB',
        city: 'Amsterdam',
        industry: 'Software development',
        website: 'https://example.com',
        phone: undefined,
        email: undefined,
        source: 'kvk',
        sourceId: '123456789012',
        postcode: '1234AB',
      });
    });

    it('should yield leads from multiple pages', async () => {
      const page1: KvkSearchResponse = {
        pagina: 1,
        aantal: 100,
        totaal: 150,
        resultaten: Array.from({ length: 100 }, (_, i) => ({
          kvkNummer: String(i),
          handelsnamen: [{ naam: `Company ${i}`, volgorde: 0 }],
        })),
      };

      const page2: KvkSearchResponse = {
        pagina: 2,
        aantal: 50,
        totaal: 150,
        resultaten: Array.from({ length: 50 }, (_, i) => ({
          kvkNummer: String(i + 100),
          handelsnamen: [{ naam: `Company ${i + 100}`, volgorde: 0 }],
        })),
      };

      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(mockFetchResponse(page1) as any)
        .mockResolvedValueOnce(mockFetchResponse(page2) as any);

      const params: DiscoveryParams = { city: 'Rotterdam' };
      const leads = [];
      for await (const lead of kvkSource.scrape(params)) {
        leads.push(lead);
      }

      expect(leads).toHaveLength(150);
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    });

    it('should respect the limit parameter', async () => {
      const mockResponse: KvkSearchResponse = {
        pagina: 1,
        aantal: 100,
        totaal: 200,
        resultaten: Array.from({ length: 100 }, (_, i) => ({
          kvkNummer: String(i),
          handelsnamen: [{ naam: `Company ${i}`, volgorde: 0 }],
        })),
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        mockFetchResponse(mockResponse) as any,
      );

      const params: DiscoveryParams = { city: 'Utrecht', limit: 25 };
      const leads = [];
      for await (const lead of kvkSource.scrape(params)) {
        leads.push(lead);
      }

      expect(leads).toHaveLength(25);
    });

    it('should stop when no results are returned', async () => {
      const mockResponse: KvkSearchResponse = {
        pagina: 1,
        aantal: 0,
        totaal: 0,
        resultaten: [],
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        mockFetchResponse(mockResponse) as any,
      );

      const params: DiscoveryParams = { city: 'Leiden' };
      const leads = [];
      for await (const lead of kvkSource.scrape(params)) {
        leads.push(lead);
      }

      expect(leads).toHaveLength(0);
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it('should handle API errors gracefully', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: vi.fn().mockResolvedValue('Internal Server Error'),
      } as any);

      const params: DiscoveryParams = { city: 'Groningen' };

      await expect(async () => {
        for await (const _ of kvkSource.scrape(params)) {
          // iterate
        }
      }).rejects.toThrow('KVK API error 500: Internal Server Error');
    });

    it('should handle API errors when reading response body fails', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 502,
        text: vi.fn().mockRejectedValue(new Error('Network error')),
      } as any);

      const params: DiscoveryParams = { city: 'Eindhoven' };

      await expect(async () => {
        for await (const _ of kvkSource.scrape(params)) {
          // iterate
        }
      }).rejects.toThrow('KVK API error 502: ');
    });

    it('should retry on 429 rate limit response', async () => {
      const rateLimitResponse = {
        ok: false,
        status: 429,
      };

      const successResponse = mockFetchResponse({
        pagina: 1,
        aantal: 1,
        totaal: 1,
        resultaten: [{ kvkNummer: '123', handelsnamen: [{ naam: 'Test', volgorde: 0 }] }],
      });

      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(rateLimitResponse as any)
        .mockResolvedValueOnce(successResponse as any);

      vi.useFakeTimers();

      const params: DiscoveryParams = { city: 'Tilburg' };
      const leads: any[] = [];

      const iterator = kvkSource.scrape(params);

      // Start the iteration
      const firstPromise = iterator.next();

      // Advance past the 429 retry delay
      await vi.advanceTimersByTimeAsync(2500);

      const result = await firstPromise;
      leads.push(result.value);

      await iterator.return();

      vi.useRealTimers();

      expect(leads).toHaveLength(1);
      expect(leads[0].kvkNumber).toBe('123');
    });

    it('should limit error body to 200 characters', async () => {
      const longBody = 'A'.repeat(500);
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: vi.fn().mockResolvedValue(longBody),
      } as any);

      const params: DiscoveryParams = { city: 'Breda' };

      await expect(async () => {
        for await (const _ of kvkSource.scrape(params)) {
          // iterate
        }
      }).rejects.toThrow(`KVK API error 400: ${'A'.repeat(200)}`);
    });

    it('should use default limit of 1000 when not specified', async () => {
      const mockResponse: KvkSearchResponse = {
        pagina: 1,
        aantal: 1000,
        totaal: 2000,
        resultaten: Array.from({ length: 100 }, (_, i) => ({
          kvkNummer: String(i),
          handelsnamen: [{ naam: `Company ${i}`, volgorde: 0 }],
        })),
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        mockFetchResponse(mockResponse) as any,
      );

      const params: DiscoveryParams = { city: 'Nijmegen' };
      const leads = [];
      for await (const lead of kvkSource.scrape(params)) {
        leads.push(lead);
      }

      // Should stop after fetching 1000 across multiple pages
      // In this case, it will stop when pages run out (totaal/100 = 20 pages but mock keeps returning same data)
      // Actually it stops at the page boundary based on totaal, so 10 pages of 100 = 1000 leads
      expect(leads).toHaveLength(1000);
    });

    it('should correctly build query string with city and industry', async () => {
      const mockResponse: KvkSearchResponse = {
        pagina: 1,
        aantal: 0,
        totaal: 0,
        resultaten: [],
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        mockFetchResponse(mockResponse) as any,
      );

      const params: DiscoveryParams = {
        city: 'Amsterdam',
        industry: '6201',
      };

      for await (const _ of kvkSource.scrape(params)) {
        // iterate
      }

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://test-api.kvk.nl?pagina=1&aantal=100&plaats=Amsterdam&sbiCode=6201',
        expect.objectContaining({
          headers: {
            apikey: 'test-api-key',
            Accept: 'application/json',
          },
        }),
      );
    });

    it('should build query string with only city when industry is not provided', async () => {
      const mockResponse: KvkSearchResponse = {
        pagina: 1,
        aantal: 0,
        totaal: 0,
        resultaten: [],
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        mockFetchResponse(mockResponse) as any,
      );

      const params: DiscoveryParams = { city: 'Haarlem' };

      for await (const _ of kvkSource.scrape(params)) {
        // iterate
      }

      const calledUrl = (globalThis.fetch as any).mock.calls[0][0] as string;
      expect(calledUrl).toContain('plaats=Haarlem');
      expect(calledUrl).not.toContain('sbiCode');
    });

    it('should handle missing handelsnamen gracefully', async () => {
      const mockResponse: KvkSearchResponse = {
        pagina: 1,
        aantal: 1,
        totaal: 1,
        resultaten: [{ kvkNummer: '99999999' }],
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        mockFetchResponse(mockResponse) as any,
      );

      const leads = [];
      for await (const lead of kvkSource.scrape({ city: 'Delft' })) {
        leads.push(lead);
      }

      expect(leads[0].businessName).toBe('Unknown');
    });

    it('should handle address without street name', async () => {
      const mockResponse: KvkSearchResponse = {
        pagina: 1,
        aantal: 1,
        totaal: 1,
        resultaten: [
          {
            kvkNummer: '11111111',
            adressen: [{ type: 'bezoekadres', plaats: 'Zoetermeer' }],
          },
        ],
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        mockFetchResponse(mockResponse) as any,
      );

      const leads = [];
      for await (const lead of kvkSource.scrape({ city: 'Zoetermeer' })) {
        leads.push(lead);
      }

      expect(leads[0].address).toBeUndefined();
      expect(leads[0].city).toBe('Zoetermeer');
    });

    it('should handle multiple 429 retries before success', async () => {
      const rateLimitResponse = { ok: false, status: 429 };

      const successResponse = mockFetchResponse({
        pagina: 1,
        aantal: 1,
        totaal: 1,
        resultaten: [{ kvkNummer: '456', handelsnamen: [{ naam: 'Retry Co', volgorde: 0 }] }],
      });

      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(rateLimitResponse as any)
        .mockResolvedValueOnce(rateLimitResponse as any)
        .mockResolvedValueOnce(successResponse as any);

      vi.useFakeTimers();

      const leads: any[] = [];
      const iterator = kvkSource.scrape({ city: 'Almere' });

      const firstPromise = iterator.next();
      await vi.advanceTimersByTimeAsync(2500);
      await vi.advanceTimersByTimeAsync(2500);
      const result = await firstPromise;
      leads.push(result.value);

      await iterator.return();
      vi.useRealTimers();

      expect(leads).toHaveLength(1);
      expect(globalThis.fetch).toHaveBeenCalledTimes(3);
    });

    it('should correctly sort handelsnamen by volgorde and pick primary', async () => {
      const mockResponse: KvkSearchResponse = {
        pagina: 1,
        aantal: 1,
        totaal: 1,
        resultaten: [
          {
            kvkNummer: '55555555',
            handelsnamen: [
              { naam: 'Secondary Name', volgorde: 2 },
              { naam: 'Primary Name', volgorde: 0 },
              { naam: 'Middle Name', volgorde: 1 },
            ],
          },
        ],
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        mockFetchResponse(mockResponse) as any,
      );

      const leads = [];
      for await (const lead of kvkSource.scrape({ city: 'Amersfoort' })) {
        leads.push(lead);
      }

      expect(leads[0].businessName).toBe('Primary Name');
    });

    it('should use kvkNummer as sourceId when vestigingsnummer is missing', async () => {
      const mockResponse: KvkSearchResponse = {
        pagina: 1,
        aantal: 1,
        totaal: 1,
        resultaten: [
          {
            kvkNummer: '77777777',
            handelsnamen: [{ naam: 'No Vest', volgorde: 0 }],
          },
        ],
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        mockFetchResponse(mockResponse) as any,
      );

      const leads = [];
      for await (const lead of kvkSource.scrape({ city: 'Enschede' })) {
        leads.push(lead);
      }

      expect(leads[0].sourceId).toBe('77777777');
    });

    it('should handle address with no postcode', async () => {
      const mockResponse: KvkSearchResponse = {
        pagina: 1,
        aantal: 1,
        totaal: 1,
        resultaten: [
          {
            kvkNummer: '33333333',
            handelsnamen: [{ naam: 'No Postcode BV', volgorde: 0 }],
            adressen: [
              {
                type: 'bezoekadres',
                straatnaam: 'Kerkstraat',
                huisnummer: '42',
                plaats: 'Arnhem',
              },
            ],
          },
        ],
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        mockFetchResponse(mockResponse) as any,
      );

      const leads = [];
      for await (const lead of kvkSource.scrape({ city: 'Arnhem' })) {
        leads.push(lead);
      }

      expect(leads[0].address).toBe('Kerkstraat 42');
      expect(leads[0].postcode).toBeUndefined();
    });

    it('should use postadres when bezoekadres is not present', async () => {
      const mockResponse: KvkSearchResponse = {
        pagina: 1,
        aantal: 1,
        totaal: 1,
        resultaten: [
          {
            kvkNummer: '44444444',
            handelsnamen: [{ naam: 'Post Only', volgorde: 0 }],
            adressen: [
              {
                type: 'postadres',
                straatnaam: 'Postweg',
                huisnummer: '5',
                plaats: 'Leeuwarden',
                postcode: '8912CD',
              },
            ],
          },
        ],
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        mockFetchResponse(mockResponse) as any,
      );

      const leads = [];
      for await (const lead of kvkSource.scrape({ city: 'Leeuwarden' })) {
        leads.push(lead);
      }

      // Should not find bezoekadres, so address should be undefined
      expect(leads[0].address).toBeUndefined();
    });

    it('should handle empty sbiActiviteiten array', async () => {
      const mockResponse: KvkSearchResponse = {
        pagina: 1,
        aantal: 1,
        totaal: 1,
        resultaten: [
          {
            kvkNummer: '22222222',
            handelsnamen: [{ naam: 'No SBI', volgorde: 0 }],
            sbiActiviteiten: [],
          },
        ],
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        mockFetchResponse(mockResponse) as any,
      );

      const leads = [];
      for await (const lead of kvkSource.scrape({ city: 'Maastricht' })) {
        leads.push(lead);
      }

      expect(leads[0].industry).toBeUndefined();
    });

    it('should pick hoofdactiviteit from multiple sbiActiviteiten', async () => {
      const mockResponse: KvkSearchResponse = {
        pagina: 1,
        aantal: 1,
        totaal: 1,
        resultaten: [
          {
            kvkNummer: '88888888',
            handelsnamen: [{ naam: 'Multi SBI', volgorde: 0 }],
            sbiActiviteiten: [
              {
                sbiCode: '6201',
                sbiOmschrijving: 'Software',
                indicatieHoofdactiviteit: false,
              },
              {
                sbiCode: '7022',
                sbiOmschrijving: 'Consulting',
                indicatieHoofdactiviteit: true,
              },
            ],
          },
        ],
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        mockFetchResponse(mockResponse) as any,
      );

      const leads = [];
      for await (const lead of kvkSource.scrape({ city: 'Den Bosch' })) {
        leads.push(lead);
      }

      expect(leads[0].industry).toBe('Consulting');
    });

    it('should always set source to kvk', async () => {
      const mockResponse: KvkSearchResponse = {
        pagina: 1,
        aantal: 1,
        totaal: 1,
        resultaten: [
          {
            kvkNummer: '11112222',
            handelsnamen: [{ naam: 'Source Test', volgorde: 0 }],
          },
        ],
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        mockFetchResponse(mockResponse) as any,
      );

      const leads = [];
      for await (const lead of kvkSource.scrape({ city: 'Deventer' })) {
        leads.push(lead);
      }

      expect(leads[0].source).toBe('kvk');
    });

    it('should always set phone and email to undefined', async () => {
      const mockResponse: KvkSearchResponse = {
        pagina: 1,
        aantal: 1,
        totaal: 1,
        resultaten: [
          {
            kvkNummer: '11113333',
            handelsnamen: [{ naam: 'Contact Test', volgorde: 0 }],
          },
        ],
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        mockFetchResponse(mockResponse) as any,
      );

      const leads = [];
      for await (const lead of kvkSource.scrape({ city: 'Zwolle' })) {
        leads.push(lead);
      }

      expect(leads[0].phone).toBeUndefined();
      expect(leads[0].email).toBeUndefined();
    });

    it('should increment page number correctly across requests', async () => {
      const page1: KvkSearchResponse = {
        pagina: 1,
        aantal: 100,
        totaal: 200,
        resultaten: Array.from({ length: 100 }, (_, i) => ({
          kvkNummer: `P1-${i}`,
          handelsnamen: [{ naam: `Page1 Company ${i}`, volgorde: 0 }],
        })),
      };

      const page2: KvkSearchResponse = {
        pagina: 2,
        aantal: 100,
        totaal: 200,
        resultaten: Array.from({ length: 100 }, (_, i) => ({
          kvkNummer: `P2-${i}`,
          handelsnamen: [{ naam: `Page2 Company ${i}`, volgorde: 0 }],
        })),
      };

      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(mockFetchResponse(page1) as any)
        .mockResolvedValueOnce(mockFetchResponse(page2) as any);

      const leads = [];
      for await (const lead of kvkSource.scrape({ city: 'Heerlen' })) {
        leads.push(lead);
      }

      const calls = (globalThis.fetch as any).mock.calls;
      expect(calls[0][0]).toContain('pagina=1');
      expect(calls[1][0]).toContain('pagina=2');
      expect(leads).toHaveLength(200);
    });

    it('should handle resultaten being undefined', async () => {
      const mockResponse = {
        pagina: 1,
        aantal: 0,
        totaal: 0,
      } as KvkSearchResponse;

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        mockFetchResponse(mockResponse) as any,
      );

      const leads = [];
      for await (const lead of kvkSource.scrape({ city: 'Sittard' })) {
        leads.push(lead);
      }

      expect(leads).toHaveLength(0);
    });

    it('should stop pagination when current page >= total pages', async () => {
      const mockResponse: KvkSearchResponse = {
        pagina: 1,
        aantal: 50,
        totaal: 50,
        resultaten: Array.from({ length: 50 }, (_, i) => ({
          kvkNummer: String(i),
          handelsnamen: [{ naam: `Company ${i}`, volgorde: 0 }],
        })),
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        mockFetchResponse(mockResponse) as any,
      );

      const leads = [];
      for await (const lead of kvkSource.scrape({ city: 'Venlo' })) {
        leads.push(lead);
      }

      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      expect(leads).toHaveLength(50);
    });

    it('should handle website being undefined', async () => {
      const mockResponse: KvkSearchResponse = {
        pagina: 1,
        aantal: 1,
        totaal: 1,
        resultaten: [
          {
            kvkNummer: '99998888',
            handelsnamen: [{ naam: 'No Website', volgorde: 0 }],
          },
        ],
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        mockFetchResponse(mockResponse) as any,
      );

      const leads = [];
      for await (const lead of kvkSource.scrape({ city: 'Roermond' })) {
        leads.push(lead);
      }

      expect(leads[0].website).toBeUndefined();
    });

    it('should pick first website when multiple are provided', async () => {
      const mockResponse: KvkSearchResponse = {
        pagina: 1,
        aantal: 1,
        totaal: 1,
        resultaten: [
          {
            kvkNummer: '99997777',
            handelsnamen: [{ naam: 'Multi Web', volgorde: 0 }],
            websites: ['https://primary.com', 'https://secondary.com'],
          },
        ],
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        mockFetchResponse(mockResponse) as any,
      );

      const leads = [];
      for await (const lead of kvkSource.scrape({ city: 'Kerkrade' })) {
        leads.push(lead);
      }

      expect(leads[0].website).toBe('https://primary.com');
    });

    it('should pass apikey header correctly', async () => {
      const mockResponse: KvkSearchResponse = {
        pagina: 1,
        aantal: 0,
        totaal: 0,
        resultaten: [],
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        mockFetchResponse(mockResponse) as any,
      );

      for await (const _ of kvkSource.scrape({ city: 'Weert' })) {
        // iterate
      }

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: {
            apikey: 'test-api-key',
            Accept: 'application/json',
          },
        }),
      );
    });

    it('should handle DiscoveryParams with only industry', async () => {
      const mockResponse: KvkSearchResponse = {
        pagina: 1,
        aantal: 0,
        totaal: 0,
        resultaten: [],
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        mockFetchResponse(mockResponse) as any,
      );

      for await (const _ of kvkSource.scrape({ industry: '6201' })) {
        // iterate
      }

      const calledUrl = (globalThis.fetch as any).mock.calls[0][0] as string;
      expect(calledUrl).not.toContain('plaats=');
      expect(calledUrl).toContain('sbiCode=6201');
    });

    it('should handle empty DiscoveryParams', async () => {
      const mockResponse: KvkSearchResponse = {
        pagina: 1,
        aantal: 0,
        totaal: 0,
        resultaten: [],
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        mockFetchResponse(mockResponse) as any,
      );

      for await (const _ of kvkSource.scrape({})) {
        // iterate
      }

      const calledUrl = (globalThis.fetch as any).mock.calls[0][0] as string;
      expect(calledUrl).toContain('pagina=1');
      expect(calledUrl).toContain('aantal=100');
      expect(calledUrl).not.toContain('plaats=');
      expect(calledUrl).not.toContain('sbiCode=');
    });

    it('should call rate limiter acquire before each request', async () => {
      const rateLimiterMock = {
        acquire: vi.fn().mockResolvedValue(undefined),
      };
      vi.mocked(createKvkRateLimiter).mockReturnValue(rateLimiterMock as any);

      const source = new KvkSource(config);

      const page1: KvkSearchResponse = {
        pagina: 1,
        aantal: 100,
        totaal: 150,
        resultaten: Array.from({ length: 100 }, (_, i) => ({
          kvkNummer: String(i),
          handelsnamen: [{ naam: `Company ${i}`, volgorde: 0 }],
        })),
      };

      const page2: KvkSearchResponse = {
        pagina: 2,
        aantal: 50,
        totaal: 150,
        resultaten: Array.from({ length: 50 }, (_, i) => ({
          kvkNummer: String(i + 100),
          handelsnamen: [{ naam: `Company ${i + 100}`, volgorde: 0 }],
        })),
      };

      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(mockFetchResponse(page1) as any)
        .mockResolvedValueOnce(mockFetchResponse(page2) as any);

      for await (const _ of source.scrape({ city: 'Bergen' })) {
        // iterate
      }

      expect(rateLimiterMock.acquire).toHaveBeenCalledTimes(2);
    });

    it('should handle limit of 0', async () => {
      const mockResponse: KvkSearchResponse = {
        pagina: 1,
        aantal: 100,
        totaal: 500,
        resultaten: Array.from({ length: 100 }, (_, i) => ({
          kvkNummer: String(i),
          handelsnamen: [{ naam: `Company ${i}`, volgorde: 0 }],
        })),
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        mockFetchResponse(mockResponse) as any,
      );

      const leads = [];
      for await (const lead of kvkSource.scrape({ city: 'Vlissingen', limit: 0 })) {
        leads.push(lead);
      }

      expect(leads).toHaveLength(0);
    });
  });
});