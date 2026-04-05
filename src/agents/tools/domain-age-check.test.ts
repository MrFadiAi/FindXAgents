import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { domainAgeCheckTool } from './domain-age-check.js';
import * as dns from 'node:dns/promises';

vi.mock('node:dns/promises', () => ({
  resolveNs: vi.fn(),
  resolveSoa: vi.fn(),
}));

describe('domainAgeCheckTool', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.resetAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('metadata and schema', () => {
    it('should have the correct tool name', () => {
      expect(domainAgeCheckTool.name).toBe('domain_age_check');
    });

    it('should have a description', () => {
      expect(domainAgeCheckTool.description).toBeTruthy();
    });

    it('should define the domain property as required in the input schema', () => {
      const schema = domainAgeCheckTool.input_schema;
      expect(schema.required).toContain('domain');
      expect(schema.properties.domain.type).toBe('string');
    });
  });

  describe('domain input normalization', () => {
    it('should strip http:// from domain', async () => {
      vi.mocked(dns.resolveNs).mockResolvedValue(['ns1.example.com']);
      vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({}), { status: 404 }));

      const result = await domainAgeCheckTool.execute({ domain: 'http://example.com' });
      const parsed = JSON.parse(result as string);

      expect(parsed.domain).toBe('example.com');
      expect(dns.resolveNs).toHaveBeenCalledWith('example.com');
    });

    it('should strip https:// and trailing slashes from domain', async () => {
      vi.mocked(dns.resolveNs).mockResolvedValue(['ns1.example.com']);
      vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({}), { status: 404 }));

      const result = await domainAgeCheckTool.execute({ domain: 'https://www.example.com/path/to/page' });
      const parsed = JSON.parse(result as string);

      expect(parsed.domain).toBe('example.com');
      expect(dns.resolveNs).toHaveBeenCalledWith('example.com');
    });

    it('should strip www. prefix', async () => {
      vi.mocked(dns.resolveNs).mockResolvedValue(['ns1.example.com']);
      vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({}), { status: 404 }));

      const result = await domainAgeCheckTool.execute({ domain: 'www.example.com' });
      const parsed = JSON.parse(result as string);

      expect(parsed.domain).toBe('example.com');
      expect(dns.resolveNs).toHaveBeenCalledWith('example.com');
    });

    it('should not mutate an already clean domain', async () => {
      vi.mocked(dns.resolveNs).mockResolvedValue(['ns1.example.com']);
      vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({}), { status: 404 }));

      const result = await domainAgeCheckTool.execute({ domain: 'example.com' });
      const parsed = JSON.parse(result as string);

      expect(parsed.domain).toBe('example.com');
    });
  });

  describe('DNS existence checks', () => {
    it('should set exists to true when NS record resolves', async () => {
      vi.mocked(dns.resolveNs).mockResolvedValue(['ns1.google.com']);
      vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({}), { status: 404 }));

      const result = await domainAgeCheckTool.execute({ domain: 'google.com' });
      const parsed = JSON.parse(result as string);

      expect(parsed.exists).toBe(true);
      expect(dns.resolveSoa).not.toHaveBeenCalled();
    });

    it('should fallback to SOA record and set exists to true when SOA resolves', async () => {
      vi.mocked(dns.resolveNs).mockRejectedValue(new Error('ENOTFOUND'));
      vi.mocked(dns.resolveSoa).mockResolvedValue({ nsname: 'ns1.example.com', hostmaster: 'admin', serial: 1, refresh: 1, retry: 1, expire: 1, minttl: 1 });
      vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({}), { status: 404 }));

      const result = await domainAgeCheckTool.execute({ domain: 'example.com' });
      const parsed = JSON.parse(result as string);

      expect(parsed.exists).toBe(true);
      expect(dns.resolveNs).toHaveBeenCalledTimes(1);
      expect(dns.resolveSoa).toHaveBeenCalledTimes(1);
    });

    it('should set exists to false when both NS and SOA fail', async () => {
      vi.mocked(dns.resolveNs).mockRejectedValue(new Error('ENOTFOUND'));
      vi.mocked(dns.resolveSoa).mockRejectedValue(new Error('ENOTFOUND'));
      vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({}), { status: 404 }));

      const result = await domainAgeCheckTool.execute({ domain: 'nonexistent.example' });
      const parsed = JSON.parse(result as string);

      expect(parsed.exists).toBe(false);
    });
  });

  describe('RDAP response parsing', () => {
    const baseDnsSuccess = () => vi.mocked(dns.resolveNs).mockResolvedValue(['ns1.example.com']);

    it('should return full parsed data when RDAP responds perfectly', async () => {
      baseDnsSuccess();
      const tenYearsAgo = new Date();
      tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);

      vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
        events: [
          { eventAction: 'registration', eventDate: tenYearsAgo.toISOString() },
          { eventAction: 'expiration', eventDate: '2030-01-01T00:00:00Z' }
        ],
        entities: [
          {
            roles: ['registrar'],
            vcardArray: ['vcard', [['version', {}, 'text', '4.0'], ['fn', {}, 'text', 'Cool Registrar Inc.']]]
          }
        ],
        status: ['client transfer prohibited', 'active']
      }), { status: 200 }));

      const result = await domainAgeCheckTool.execute({ domain: 'example.com' });
      const parsed = JSON.parse(result as string);

      expect(parsed.exists).toBe(true);
      expect(parsed.registrationDate).toBe(tenYearsAgo.toISOString());
      expect(parsed.ageInYears).toBe(10.0);
      expect(parsed.registrar).toBe('Cool Registrar Inc.');
      expect(parsed.status).toBe('client transfer prohibited, active');
    });

    it('should calculate partial years properly and round to 1 decimal point', async () => {
      baseDnsSuccess();
      
      const now = new Date();
      const twoYearsSixMonthsAgo = new Date(now.getTime() - (2.5 * 365.25 * 24 * 60 * 60 * 1000));

      vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
        events: [{ eventAction: 'registration', eventDate: twoYearsSixMonthsAgo.toISOString() }]
      }), { status: 200 }));

      const result = await domainAgeCheckTool.execute({ domain: 'example.com' });
      const parsed = JSON.parse(result as string);

      expect(parsed.ageInYears).toBe(2.5);
    });

    it('should handle missing events gracefully', async () => {
      baseDnsSuccess();
      vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ events: [] }), { status: 200 }));

      const result = await domainAgeCheckTool.execute({ domain: 'example.com' });
      const parsed = JSON.parse(result as string);

      expect(parsed.registrationDate).toBeNull();
      expect(parsed.ageInYears).toBeNull();
      expect(parsed.registrar).toBeNull();
      expect(parsed.status).toBeNull();
    });

    it('should handle missing entities gracefully', async () => {
      baseDnsSuccess();
      const dateStr = '2020-01-01T00:00:00Z';
      vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
        events: [{ eventAction: 'registration', eventDate: dateStr }],
        entities: []
      }), { status: 200 }));

      const result = await domainAgeCheckTool.execute({ domain: 'example.com' });
      const parsed = JSON.parse(result as string);

      expect(parsed.registrationDate).toBe(dateStr);
      expect(parsed.registrar).toBeNull();
    });

    it('should handle entities without the registrar role', async () => {
      baseDnsSuccess();
      const dateStr = '2020-01-01T00:00:00Z';
      vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
        events: [{ eventAction: 'registration', eventDate: dateStr }],
        entities: [{ roles: ['registrant'], vcardArray: ['vcard', [['fn', {}, 'text', 'John Doe']]] }]
      }), { status: 200 }));

      const result = await domainAgeCheckTool.execute({ domain: 'example.com' });
      const parsed = JSON.parse(result as string);

      expect(parsed.registrationDate).toBe(dateStr);
      expect(parsed.registrar).toBeNull();
    });

    it('should ignore malformed vcard arrays', async () => {
      baseDnsSuccess();
      const dateStr = '2020-01-01T00:00:00Z';
      vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
        events: [{ eventAction: 'registration', eventDate: dateStr }],
        entities: [{ roles: ['registrar'], vcardArray: ['vcard', [['version', {}, 'text', '4.0']]] }]
      }), { status: 200 }));

      const result = await domainAgeCheckTool.execute({ domain: 'example.com' });
      const parsed = JSON.parse(result as string);

      expect(parsed.registrationDate).toBe(dateStr);
      expect(parsed.registrar).toBeNull();
    });

    it('should ignore vcard arrays with invalid lengths', async () => {
      baseDnsSuccess();
      const dateStr = '2020-01-01T00:00:00Z';
      vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
        events: [{ eventAction: 'registration', eventDate: dateStr }],
        entities: [{ roles: ['registrar'], vcardArray: ['vcard', [['fn', {}, 'text']]] }] // length 3, requires >= 4
      }), { status: 200 }));

      const result = await domainAgeCheckTool.execute({ domain: 'example.com' });
      const parsed = JSON.parse(result as string);

      expect(parsed.registrationDate).toBe(dateStr);
      expect(parsed.registrar).toBeNull();
    });

    it('should fetch the RDAP endpoint with correct Accept header', async () => {
      baseDnsSuccess();
      vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({}), { status: 404 }));

      await domainAgeCheckTool.execute({ domain: 'test.com' });

      expect(fetch).toHaveBeenCalledWith('https://rdap.org/domain/test.com', {
        headers: { Accept: 'application/rdap+json' },
        signal: expect.any(AbortSignal)
      });
    });

    it('should return nulls when RDAP responds with non-OK status', async () => {
      baseDnsSuccess();
      vi.mocked(fetch).mockResolvedValue(new Response('Not Found', { status: 404 }));

      const result = await domainAgeCheckTool.execute({ domain: 'example.com' });
      const parsed = JSON.parse(result as string);

      expect(parsed.exists).toBe(true);
      expect(parsed.registrationDate).toBeNull();
      expect(parsed.ageInYears).toBeNull();
      expect(parsed.registrar).toBeNull();
      expect(parsed.status).toBeNull();
    });

    it('should return partial results when RDAP fetch throws an error', async () => {
      baseDnsSuccess();
      vi.mocked(fetch).mockRejectedValue(new Error('Network failure'));

      const result = await domainAgeCheckTool.execute({ domain: 'example.com' });
      const parsed = JSON.parse(result as string);

      expect(parsed.exists).toBe(true);
      expect(parsed.registrationDate).toBeNull();
      expect(parsed.ageInYears).toBeNull();
      expect(parsed.registrar).toBeNull();
      expect(parsed.status).toBeNull();
    });
  });
});