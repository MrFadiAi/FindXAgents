import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { competitorCompareTool } from './competitor-compare.js';
import { searxngSearch } from './web-search.js';

vi.mock('./web-search.js', () => ({
  searxngSearch: vi.fn(),
}));

const mockSearchResults = [
  {
    title: 'Competitor A',
    url: 'https://competitor-a.com',
    snippet: 'Best coffee in town',
  },
  {
    title: 'Competitor B',
    url: 'https://competitor-b.com',
    snippet: 'Great coffee',
  },
  {
    title: 'Competitor C',
    url: 'https://competitor-c.com',
    snippet: 'Also coffee',
  },
  {
    title: 'Competitor D',
    url: 'https://competitor-d.com',
    snippet: 'Coffee here too',
  },
  {
    title: 'Competitor E',
    url: 'https://competitor-e.com',
    snippet: 'More coffee',
  },
  {
    title: 'Competitor F',
    url: 'https://competitor-f.com',
    snippet: 'Yet another coffee shop',
  },
  {
    title: 'Competitor G',
    url: 'https://competitor-g.com',
    snippet: 'Last coffee shop',
  },
];

describe('competitorCompareTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('tool metadata', () => {
    it('should have the correct tool name', () => {
      expect(competitorCompareTool.name).toBe('competitor_compare');
    });

    it('should have a description', () => {
      expect(competitorCompareTool.description).toBeTruthy();
      expect(typeof competitorCompareTool.description).toBe('string');
    });

    it('should have an input_schema with required fields', () => {
      expect(competitorCompareTool.input_schema).toBeDefined();
      expect(competitorCompareTool.input_schema.type).toBe('object');
      expect(competitorCompareTool.input_schema.required).toEqual(['businessName', 'city']);
    });

    it('should define all expected properties in input_schema', () => {
      const props = competitorCompareTool.input_schema.properties;
      expect(Object.keys(props)).toEqual(['businessName', 'city', 'industry', 'website']);
      expect(props.businessName.type).toBe('string');
      expect(props.city.type).toBe('string');
      expect(props.industry.type).toBe('string');
      expect(props.website.type).toBe('string');
    });
  });

  describe('execute', () => {
    it('should build query with industry when provided', async () => {
      vi.mocked(searxngSearch).mockResolvedValue(mockSearchResults);
      const result = await competitorCompareTool.execute({
        businessName: 'Test Cafe',
        city: 'Amsterdam',
        industry: 'coffee shop',
      });

      expect(searxngSearch).toHaveBeenCalledWith('coffee shop in Amsterdam', 10, { language: 'nl' });
      const parsed = JSON.parse(result as string);
      expect(parsed.query).toBe('coffee shop in Amsterdam');
    });

    it('should build query without industry when not provided', async () => {
      vi.mocked(searxngSearch).mockResolvedValue(mockSearchResults);
      const result = await competitorCompareTool.execute({
        businessName: 'Test Cafe',
        city: 'Amsterdam',
      });

      expect(searxngSearch).toHaveBeenCalledWith('Test Cafe competitors Amsterdam', 10, { language: 'nl' });
      const parsed = JSON.parse(result as string);
      expect(parsed.query).toBe('Test Cafe competitors Amsterdam');
    });

    it('should return parsed JSON with businessName, city, query, competitors', async () => {
      vi.mocked(searxngSearch).mockResolvedValue(mockSearchResults);
      const result = await competitorCompareTool.execute({
        businessName: 'Test Cafe',
        city: 'Amsterdam',
        industry: 'coffee shop',
      });

      const parsed = JSON.parse(result as string);
      expect(parsed).toHaveProperty('businessName', 'Test Cafe');
      expect(parsed).toHaveProperty('city', 'Amsterdam');
      expect(parsed).toHaveProperty('query', 'coffee shop in Amsterdam');
      expect(parsed).toHaveProperty('competitors');
      expect(Array.isArray(parsed.competitors)).toBe(true);
    });

    it('should limit competitors to 5 results', async () => {
      vi.mocked(searxngSearch).mockResolvedValue(mockSearchResults);
      const result = await competitorCompareTool.execute({
        businessName: 'Test Cafe',
        city: 'Amsterdam',
        industry: 'coffee shop',
      });

      const parsed = JSON.parse(result as string);
      expect(parsed.competitors).toHaveLength(5);
    });

    it('should map results to name, url, snippet objects', async () => {
      vi.mocked(searxngSearch).mockResolvedValue(mockSearchResults);
      const result = await competitorCompareTool.execute({
        businessName: 'Test Cafe',
        city: 'Amsterdam',
        industry: 'coffee shop',
      });

      const parsed = JSON.parse(result as string);
      expect(parsed.competitors[0]).toEqual({
        name: 'Competitor A',
        url: 'https://competitor-a.com',
        snippet: 'Best coffee in town',
      });
    });

    it('should exclude the business own website from results (with https://)', async () => {
      const resultsWithOwn = [
        { title: 'My Cafe', url: 'https://mycafe.com', snippet: 'My site' },
        ...mockSearchResults,
      ];
      vi.mocked(searxngSearch).mockResolvedValue(resultsWithOwn);

      const result = await competitorCompareTool.execute({
        businessName: 'My Cafe',
        city: 'Amsterdam',
        website: 'https://mycafe.com',
      });

      const parsed = JSON.parse(result as string);
      const urls = parsed.competitors.map((c: any) => c.url);
      expect(urls).not.toContain('https://mycafe.com');
      expect(parsed.competitors).toHaveLength(5);
    });

    it('should exclude the business own website when URL has www prefix', async () => {
      const resultsWithOwn = [
        { title: 'My Cafe', url: 'https://www.mycafe.com', snippet: 'My site' },
        ...mockSearchResults,
      ];
      vi.mocked(searxngSearch).mockResolvedValue(resultsWithOwn);

      const result = await competitorCompareTool.execute({
        businessName: 'My Cafe',
        city: 'Amsterdam',
        website: 'mycafe.com',
      });

      const parsed = JSON.parse(result as string);
      const urls = parsed.competitors.map((c: any) => c.url);
      expect(urls).not.toContain('https://www.mycafe.com');
    });

    it('should exclude the business own website when input website has www prefix', async () => {
      const resultsWithOwn = [
        { title: 'My Cafe', url: 'https://mycafe.com', snippet: 'My site' },
        ...mockSearchResults,
      ];
      vi.mocked(searxngSearch).mockResolvedValue(resultsWithOwn);

      const result = await competitorCompareTool.execute({
        businessName: 'My Cafe',
        city: 'Amsterdam',
        website: 'www.mycafe.com',
      });

      const parsed = JSON.parse(result as string);
      const urls = parsed.competitors.map((c: any) => c.url);
      expect(urls).not.toContain('https://mycafe.com');
    });

    it('should exclude website when input is full URL with https and result has www', async () => {
      const resultsWithOwn = [
        { title: 'My Cafe', url: 'https://www.mycafe.com', snippet: 'My site' },
        { title: 'Competitor A', url: 'https://competitor-a.com', snippet: 'Good' },
      ];
      vi.mocked(searxngSearch).mockResolvedValue(resultsWithOwn);

      const result = await competitorCompareTool.execute({
        businessName: 'My Cafe',
        city: 'Amsterdam',
        website: 'https://www.mycafe.com',
      });

      const parsed = JSON.parse(result as string);
      expect(parsed.competitors).toHaveLength(1);
      expect(parsed.competitors[0].name).toBe('Competitor A');
    });

    it('should handle website without protocol by prepending https://', async () => {
      const resultsWithOwn = [
        { title: 'My Cafe', url: 'https://mycafe.com', snippet: 'My site' },
        { title: 'Competitor A', url: 'https://competitor-a.com', snippet: 'Good' },
      ];
      vi.mocked(searxngSearch).mockResolvedValue(resultsWithOwn);

      const result = await competitorCompareTool.execute({
        businessName: 'My Cafe',
        city: 'Amsterdam',
        website: 'mycafe.com',
      });

      const parsed = JSON.parse(result as string);
      expect(parsed.competitors).toHaveLength(1);
      expect(parsed.competitors[0].name).toBe('Competitor A');
    });

    it('should not filter any results when website is not provided', async () => {
      vi.mocked(searxngSearch).mockResolvedValue(mockSearchResults);
      const result = await competitorCompareTool.execute({
        businessName: 'Test Cafe',
        city: 'Amsterdam',
      });

      const parsed = JSON.parse(result as string);
      expect(parsed.competitors).toHaveLength(5);
      expect(parsed.competitors[0].url).toBe('https://competitor-a.com');
    });

    it('should return empty competitors when search returns no results', async () => {
      vi.mocked(searxngSearch).mockResolvedValue([]);
      const result = await competitorCompareTool.execute({
        businessName: 'Test Cafe',
        city: 'Amsterdam',
        industry: 'coffee shop',
      });

      const parsed = JSON.parse(result as string);
      expect(parsed.competitors).toHaveLength(0);
    });

    it('should handle fewer than 5 results', async () => {
      const fewResults = mockSearchResults.slice(0, 2);
      vi.mocked(searxngSearch).mockResolvedValue(fewResults);

      const result = await competitorCompareTool.execute({
        businessName: 'Test Cafe',
        city: 'Amsterdam',
      });

      const parsed = JSON.parse(result as string);
      expect(parsed.competitors).toHaveLength(2);
    });

    it('should handle SearXNG errors gracefully', async () => {
      vi.mocked(searxngSearch).mockRejectedValue(new Error('Service unavailable'));

      const result = await competitorCompareTool.execute({
        businessName: 'Test Cafe',
        city: 'Amsterdam',
      });

      const parsed = JSON.parse(result as string);
      expect(parsed.businessName).toBe('Test Cafe');
      expect(parsed.city).toBe('Amsterdam');
      expect(parsed.competitors).toEqual([]);
      expect(parsed.note).toContain('Could not fetch competitor data');
      expect(parsed.note).toContain('Service unavailable');
      expect(parsed.note).toContain('SearXNG may be unavailable');
    });

    it('should handle non-Error exceptions in catch block', async () => {
      vi.mocked(searxngSearch).mockRejectedValue('string error');

      const result = await competitorCompareTool.execute({
        businessName: 'Test Cafe',
        city: 'Amsterdam',
      });

      const parsed = JSON.parse(result as string);
      expect(parsed.note).toContain('Could not fetch competitor data');
      expect(parsed.note).toContain('string error');
    });

    it('should handle URL parsing error for invalid website', async () => {
      vi.mocked(searxngSearch).mockResolvedValue(mockSearchResults);

      const result = await competitorCompareTool.execute({
        businessName: 'Test Cafe',
        city: 'Amsterdam',
        website: '::invalid',
      });

      const parsed = JSON.parse(result as string);
      expect(parsed.businessName).toBe('Test Cafe');
      expect(parsed.competitors).toEqual([]);
      expect(parsed.note).toBeDefined();
    });

    it('should handle URL parsing error for invalid result URLs', async () => {
      const badResults = [
        { title: 'Bad', url: '::bad-url', snippet: 'Broken' },
        ...mockSearchResults,
      ];
      vi.mocked(searxngSearch).mockResolvedValue(badResults);

      const result = await competitorCompareTool.execute({
        businessName: 'Test Cafe',
        city: 'Amsterdam',
      });

      const parsed = JSON.parse(result as string);
      expect(parsed.businessName).toBe('Test Cafe');
      expect(parsed.competitors).toEqual([]);
      expect(parsed.note).toBeDefined();
    });

    it('should pass language: "nl" to searxngSearch', async () => {
      vi.mocked(searxngSearch).mockResolvedValue([]);

      await competitorCompareTool.execute({
        businessName: 'Test',
        city: 'Rotterdam',
      });

      expect(searxngSearch).toHaveBeenCalledWith(expect.any(String), 10, { language: 'nl' });
    });

    it('should request 10 results from searxngSearch', async () => {
      vi.mocked(searxngSearch).mockResolvedValue([]);

      await competitorCompareTool.execute({
        businessName: 'Test',
        city: 'Rotterdam',
      });

      expect(searxngSearch).toHaveBeenCalledWith(expect.any(String), 10, expect.any(Object));
    });

    it('should return a string from execute', async () => {
      vi.mocked(searxngSearch).mockResolvedValue(mockSearchResults);

      const result = await competitorCompareTool.execute({
        businessName: 'Test Cafe',
        city: 'Amsterdam',
      });

      expect(typeof result).toBe('string');
      expect(() => JSON.parse(result as string)).not.toThrow();
    });

    it('should correctly exclude multiple instances of own domain appearing in results', async () => {
      const resultsWithMultipleOwn = [
        { title: 'My Cafe Home', url: 'https://mycafe.com', snippet: 'Home' },
        { title: 'Competitor A', url: 'https://competitor-a.com', snippet: 'Good' },
        { title: 'My Cafe About', url: 'https://www.mycafe.com/about', snippet: 'About' },
        { title: 'Competitor B', url: 'https://competitor-b.com', snippet: 'Also good' },
      ];
      vi.mocked(searxngSearch).mockResolvedValue(resultsWithMultipleOwn);

      const result = await competitorCompareTool.execute({
        businessName: 'My Cafe',
        city: 'Amsterdam',
        website: 'mycafe.com',
      });

      const parsed = JSON.parse(result as string);
      expect(parsed.competitors).toHaveLength(2);
      expect(parsed.competitors.every((c: any) => !c.url.includes('mycafe.com'))).toBe(true);
    });

    it('should handle city names with special characters', async () => {
      vi.mocked(searxngSearch).mockResolvedValue(mockSearchResults);

      const result = await competitorCompareTool.execute({
        businessName: 'Test',
        city: "'s-Hertogenbosch",
        industry: 'bakery',
      });

      expect(searxngSearch).toHaveBeenCalledWith("bakery in 's-Hertogenbosch", 10, { language: 'nl' });
      const parsed = JSON.parse(result as string);
      expect(parsed.city).toBe("'s-Hertogenbosch");
    });

    it('should handle business names with special characters', async () => {
      vi.mocked(searxngSearch).mockResolvedValue(mockSearchResults);

      const result = await competitorCompareTool.execute({
        businessName: "Café 't Mandje",
        city: 'Amsterdam',
      });

      expect(searxngSearch).toHaveBeenCalledWith("Café 't Mandje competitors Amsterdam", 10, { language: 'nl' });
    });
  });
});