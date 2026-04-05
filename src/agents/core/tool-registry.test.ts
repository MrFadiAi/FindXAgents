import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Inline manual mocks to isolate registry unit tests from actual tool implementations
vi.mock('../tools/web-search.js', () => ({ webSearchTool: { name: 'web_search', description: 'Searches the web' } }));
vi.mock('../tools/web-scraper.js', () => ({ scrapePageTool: { name: 'scrape_page', description: 'Scrapes a page' } }));
vi.mock('../tools/website-checker.js', () => ({ checkWebsiteTool: { name: 'check_website', description: 'Checks a website' } }));
vi.mock('../tools/kvk-search.js', () => ({ kvkSearchTool: { name: 'kvk_search', description: 'Searches KVK' } }));
vi.mock('../tools/google-places.js', () => ({ googlePlacesTool: { name: 'google_places', description: 'Searches Google Places' } }));
vi.mock('../tools/database.js', () => ({
  saveLeadTool: { name: 'save_lead', description: 'Saves a lead' },
  saveAnalysisTool: { name: 'save_analysis', description: 'Saves an analysis' },
  saveOutreachTool: { name: 'save_outreach', description: 'Saves outreach' },
}));
vi.mock('../tools/email-template.js', () => ({ renderTemplateTool: { name: 'render_template', description: 'Renders an email template' } }));
vi.mock('../tools/lighthouse.js', () => ({ runLighthouseTool: { name: 'run_lighthouse', description: 'Runs Lighthouse' } }));
vi.mock('../tools/tech-detect.js', () => ({ detectTechTool: { name: 'detect_tech', description: 'Detects technologies' } }));
vi.mock('../tools/extract-emails.js', () => ({ extractEmailsTool: { name: 'extract_emails', description: 'Extracts emails' } }));
vi.mock('../tools/check-mx.js', () => ({ checkMxTool: { name: 'check_mx', description: 'Checks MX records' } }));
vi.mock('../tools/take-screenshot.js', () => ({ takeScreenshotTool: { name: 'take_screenshot', description: 'Takes a screenshot' } }));
vi.mock('../tools/check-ssl.js', () => ({ checkSslTool: { name: 'check_ssl', description: 'Checks SSL' } }));
vi.mock('../tools/extract-social.js', () => ({ extractSocialTool: { name: 'extract_social', description: 'Extracts social links' } }));
vi.mock('../tools/email-send.js', () => ({ sendEmailTool: { name: 'send_email', description: 'Sends an email' } }));
vi.mock('../tools/place-details.js', () => ({ placeDetailsTool: { name: 'place_details', description: 'Gets place details' } }));
vi.mock('../tools/competitor-compare.js', () => ({ competitorCompareTool: { name: 'competitor_compare', description: 'Compares competitors' } }));
vi.mock('../tools/domain-age-check.js', () => ({ domainAgeCheckTool: { name: 'domain_age_check', description: 'Checks domain age' } }));
vi.mock('../tools/check-mobile-friendly.js', () => ({ checkMobileFriendlyTool: { name: 'check_mobile_friendly', description: 'Checks mobile friendliness' } }));

// Import module after mocks are set up
import {
  getTool,
  getTools,
  getAllToolDefinitions,
  getAllToolNames,
} from './tool-registry.js';

describe('tool-registry', () => {
  const EXPECTED_TOOL_NAMES = [
    'web_search',
    'scrape_page',
    'check_website',
    'kvk_search',
    'google_places',
    'save_lead',
    'save_analysis',
    'save_outreach',
    'render_template',
    'run_lighthouse',
    'detect_tech',
    'extract_emails',
    'check_mx',
    'take_screenshot',
    'check_ssl',
    'extract_social',
    'send_email',
    'place_details',
    'competitor_compare',
    'domain_age_check',
    'check_mobile_friendly',
  ];

  describe('getTool', () => {
    it('should return the correct tool when given a valid name', () => {
      const tool = getTool('web_search');
      expect(tool).toBeDefined();
      expect(tool!.name).toBe('web_search');
      expect(tool!.description).toBe('Searches the web');
    });

    it('should return the correct tool for every registered tool name', () => {
      for (const name of EXPECTED_TOOL_NAMES) {
        const tool = getTool(name);
        expect(tool).toBeDefined();
        expect(tool!.name).toBe(name);
      }
    });

    it('should return undefined for a non-existent tool name', () => {
      const tool = getTool('non_existent_tool');
      expect(tool).toBeUndefined();
    });

    it('should return undefined for an empty string', () => {
      const tool = getTool('');
      expect(tool).toBeUndefined();
    });

    it('should be case-sensitive and return undefined for wrong casing', () => {
      const tool = getTool('WEB_SEARCH');
      expect(tool).toBeUndefined();
    });

    it('should be case-sensitive and return undefined for capitalized tool name', () => {
      const tool = getTool('Web_Search');
      expect(tool).toBeUndefined();
    });

    it('should handle tool names with leading/trailing whitespace by returning undefined', () => {
      const tool = getTool(' web_search');
      expect(tool).toBeUndefined();
    });

    it('should return the exact same tool object reference for multiple calls with the same name', () => {
      const tool1 = getTool('check_website');
      const tool2 = getTool('check_website');
      expect(tool1).toBe(tool2);
    });
  });

  describe('getTools', () => {
    it('should return multiple tools for an array of valid names', () => {
      const tools = getTools(['web_search', 'scrape_page', 'check_website']);
      expect(tools).toHaveLength(3);
      expect(tools.map((t) => t.name)).toEqual(['web_search', 'scrape_page', 'check_website']);
    });

    it('should return an empty array for an empty input array', () => {
      const tools = getTools([]);
      expect(tools).toEqual([]);
    });

    it('should filter out undefined results for non-existent tool names', () => {
      const tools = getTools(['web_search', 'fake_tool', 'scrape_page']);
      expect(tools).toHaveLength(2);
      expect(tools.map((t) => t.name)).toEqual(['web_search', 'scrape_page']);
    });

    it('should return an empty array if all provided names are non-existent', () => {
      const tools = getTools(['fake1', 'fake2', 'fake3']);
      expect(tools).toEqual([]);
    });

    it('should maintain the order of requested tools (minus missing ones)', () => {
      const tools = getTools(['check_ssl', 'extract_emails', 'ghost_tool', 'send_email']);
      expect(tools).toHaveLength(3);
      expect(tools[0].name).toBe('check_ssl');
      expect(tools[1].name).toBe('extract_emails');
      expect(tools[2].name).toBe('send_email');
    });

    it('should return all tools when provided all valid names', () => {
      const tools = getTools(EXPECTED_TOOL_NAMES);
      expect(tools).toHaveLength(EXPECTED_TOOL_NAMES.length);
      const returnedNames = tools.map((t) => t.name);
      expect(returnedNames).toEqual(EXPECTED_TOOL_NAMES);
    });

    it('should handle a mix of casing issues gracefully by filtering them out', () => {
      const tools = getTools(['web_search', 'Web_Search', 'WEB_SEARCH']);
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('web_search');
    });
  });

  describe('getAllToolDefinitions', () => {
    it('should return an array of objects with name and description properties', () => {
      const definitions = getAllToolDefinitions();
      for (const def of definitions) {
        expect(def).toHaveProperty('name');
        expect(def).toHaveProperty('description');
        expect(typeof def.name).toBe('string');
        expect(typeof def.description).toBe('string');
      }
    });

    it('should return definitions for all 21 expected tools', () => {
      const definitions = getAllToolDefinitions();
      expect(definitions).toHaveLength(21);
    });

    it('should match the expected set of tool names exactly', () => {
      const definitions = getAllToolDefinitions();
      const names = definitions.map((d) => d.name);
      expect(names.sort()).toEqual([...EXPECTED_TOOL_NAMES].sort());
    });

    it('should not contain extra properties beyond name and description', () => {
      const definitions = getAllToolDefinitions();
      for (const def of definitions) {
        expect(Object.keys(def)).toEqual(['name', 'description']);
      }
    });
  });

  describe('getAllToolNames', () => {
    it('should return an array of strings', () => {
      const names = getAllToolNames();
      for (const name of names) {
        expect(typeof name).toBe('string');
      }
    });

    it('should return exactly 21 tool names', () => {
      const names = getAllToolNames();
      expect(names).toHaveLength(21);
    });

    it('should match the expected list of tool names', () => {
      const names = getAllToolNames();
      expect(names.sort()).toEqual([...EXPECTED_TOOL_NAMES].sort());
    });

    it('should not contain duplicate names', () => {
      const names = getAllToolNames();
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(names.length);
    });
  });

  describe('Registry Integrity', () => {
    it('should ensure all exported definitions correspond to retrievable tools', () => {
      const definitions = getAllToolDefinitions();
      for (const def of definitions) {
        const tool = getTool(def.name);
        expect(tool).toBeDefined();
        expect(tool!.name).toBe(def.name);
        expect(tool!.description).toBe(def.description);
      }
    });

    it('should ensure getAllToolNames matches the names from getAllToolDefinitions', () => {
      const names = getAllToolNames();
      const defNames = getAllToolDefinitions().map((d) => d.name);
      expect(names.sort()).toEqual(defNames.sort());
    });
  });
});