import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../tools/web-search.js', () => ({
  webSearchTool: { type: 'function', function: { name: 'web_search', parameters: {} } }
}));

vi.mock('../tools/web-scraper.js', () => ({
  scrapePageTool: { type: 'function', function: { name: 'scrape_page', parameters: {} } }
}));

vi.mock('../tools/website-checker.js', () => ({
  checkWebsiteTool: { type: 'function', function: { name: 'check_website', parameters: {} } }
}));

vi.mock('../tools/kvk-search.js', () => ({
  kvkSearchTool: { type: 'function', function: { name: 'kvk_search', parameters: {} } }
}));

vi.mock('../tools/google-places.js', () => ({
  googlePlacesTool: { type: 'function', function: { name: 'google_places_search', parameters: {} } }
}));

vi.mock('../tools/database.js', () => ({
  saveLeadTool: { type: 'function', function: { name: 'save_lead', parameters: {} } }
}));

import { createResearchAgent } from './agent.js';
import { webSearchTool } from '../tools/web-search.js';
import { scrapePageTool } from '../tools/web-scraper.js';
import { checkWebsiteTool } from '../tools/website-checker.js';
import { kvkSearchTool } from '../tools/kvk-search.js';
import { googlePlacesTool } from '../tools/google-places.js';
import { saveLeadTool } from '../tools/database.js';
import type { AgentConfig } from '../core/types.js';

describe('createResearchAgent', () => {
  let agent: AgentConfig;

  beforeEach(() => {
    agent = createResearchAgent();
  });

  it('should return an object with the correct agent name', () => {
    expect(agent.name).toBe('research');
  });

  it('should return an AgentConfig object with all required properties', () => {
    expect(agent).toHaveProperty('name');
    expect(agent).toHaveProperty('systemPrompt');
    expect(agent).toHaveProperty('tools');
    expect(agent).toHaveProperty('maxIterations');
    expect(agent).toHaveProperty('maxTokens');
  });

  it('should set maxIterations to 20', () => {
    expect(agent.maxIterations).toBe(20);
  });

  it('should set maxTokens to 4096', () => {
    expect(agent.maxTokens).toBe(4096);
  });

  describe('systemPrompt', () => {
    it('should be a non-empty string', () => {
      expect(typeof agent.systemPrompt).toBe('string');
      expect(agent.systemPrompt.length).toBeGreaterThan(0);
    });

    it('should describe the agent as a business research agent for FindX', () => {
      expect(agent.systemPrompt).toContain('business research agent');
      expect(agent.systemPrompt).toContain('FindX');
    });

    it('should instruct the agent to focus on Dutch businesses in the Netherlands', () => {
      expect(agent.systemPrompt).toContain('Dutch businesses');
      expect(agent.systemPrompt).toContain('Netherlands');
    });

    it('should mention the target quantity of 10 to 25 businesses per search', () => {
      expect(agent.systemPrompt).toContain('at least 10 businesses');
      expect(agent.systemPrompt).toContain('up to 25');
    });

    it('should instruct to use check_website before scraping', () => {
      expect(agent.systemPrompt).toContain('check_website before scraping');
    });

    it('should instruct not to save the same business twice', () => {
      expect(agent.systemPrompt).toContain('Do NOT save the same business twice');
    });

    it('should list expected data fields: business name, city, website URL, email, phone, industry', () => {
      expect(agent.systemPrompt).toContain('business name');
      expect(agent.systemPrompt).toContain('city');
      expect(agent.systemPrompt).toContain('website URL');
      expect(agent.systemPrompt).toContain('email');
      expect(agent.systemPrompt).toContain('phone');
      expect(agent.systemPrompt).toContain('industry');
    });

    it('should specify the JSON summary output format with totalFound, saved, and leads', () => {
      expect(agent.systemPrompt).toContain('"totalFound"');
      expect(agent.systemPrompt).toContain('"saved"');
      expect(agent.systemPrompt).toContain('"leads"');
      expect(agent.systemPrompt).toContain('"businessName"');
    });

    it('should reference the correct strategy steps including web_search, check_website, scrape_page', () => {
      expect(agent.systemPrompt).toContain('web_search');
      expect(agent.systemPrompt).toContain('check_website');
      expect(agent.systemPrompt).toContain('scrape_page');
    });

    it('should mention save_lead tool usage', () => {
      expect(agent.systemPrompt).toContain('save_lead');
    });

    it('should mention KVK and Google Places as enrichment tools', () => {
      expect(agent.systemPrompt).toContain('KVK');
      expect(agent.systemPrompt).toContain('Google Places');
    });

    it('should indicate that missing email or phone is acceptable', () => {
      expect(agent.systemPrompt).toContain('If you cannot find an email or phone, that is fine');
    });
  });

  describe('tools', () => {
    it('should return exactly 6 tools', () => {
      expect(agent.tools).toHaveLength(6);
    });

    it('should include webSearchTool', () => {
      expect(agent.tools).toContainEqual(webSearchTool);
    });

    it('should include scrapePageTool', () => {
      expect(agent.tools).toContainEqual(scrapePageTool);
    });

    it('should include checkWebsiteTool', () => {
      expect(agent.tools).toContainEqual(checkWebsiteTool);
    });

    it('should include kvkSearchTool', () => {
      expect(agent.tools).toContainEqual(kvkSearchTool);
    });

    it('should include googlePlacesTool', () => {
      expect(agent.tools).toContainEqual(googlePlacesTool);
    });

    it('should include saveLeadTool', () => {
      expect(agent.tools).toContainEqual(saveLeadTool);
    });

    it('should have tools in the expected order', () => {
      expect(agent.tools[0]).toBe(webSearchTool);
      expect(agent.tools[1]).toBe(scrapePageTool);
      expect(agent.tools[2]).toBe(checkWebsiteTool);
      expect(agent.tools[3]).toBe(kvkSearchTool);
      expect(agent.tools[4]).toBe(googlePlacesTool);
      expect(agent.tools[5]).toBe(saveLeadTool);
    });

    it('should not contain duplicate tool references', () => {
      const toolSet = new Set(agent.tools);
      expect(toolSet.size).toBe(agent.tools.length);
    });
  });

  describe('immutability and determinism', () => {
    it('should return a new object on each call (not the same reference)', () => {
      const secondAgent = createResearchAgent();
      expect(secondAgent).not.toBe(agent);
    });

    it('should return tools as a new array on each call (not the same reference)', () => {
      const secondAgent = createResearchAgent();
      expect(secondAgent.tools).not.toBe(agent.tools);
    });

    it('should return the same systemPrompt value on every call', () => {
      const secondAgent = createResearchAgent();
      expect(secondAgent.systemPrompt).toBe(agent.systemPrompt);
    });

    it('should produce consistent configuration across multiple invocations', () => {
      for (let i = 0; i < 10; i++) {
        const a = createResearchAgent();
        expect(a.name).toBe('research');
        expect(a.maxIterations).toBe(20);
        expect(a.maxTokens).toBe(4096);
        expect(a.tools).toHaveLength(6);
      }
    });
  });

  describe('return type compliance', () => {
    it('should satisfy the AgentConfig interface with correct types', () => {
      expect(typeof agent.name).toBe('string');
      expect(typeof agent.systemPrompt).toBe('string');
      expect(Array.isArray(agent.tools)).toBe(true);
      expect(typeof agent.maxIterations).toBe('number');
      expect(typeof agent.maxTokens).toBe('number');
    });

    it('should have numeric maxIterations that is a positive integer', () => {
      expect(agent.maxIterations).toBeGreaterThan(0);
      expect(Number.isInteger(agent.maxIterations)).toBe(true);
    });

    it('should have numeric maxTokens that is a positive integer', () => {
      expect(agent.maxTokens).toBeGreaterThan(0);
      expect(Number.isInteger(agent.maxTokens)).toBe(true);
    });
  });
});