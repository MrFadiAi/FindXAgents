import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createAnalysisAgent } from './agent.js';
import type { AgentConfig } from '../core/types.js';
import { runLighthouseTool } from '../tools/lighthouse.js';
import { detectTechTool } from '../tools/tech-detect.js';
import { scrapePageTool } from '../tools/web-scraper.js';
import { checkWebsiteTool } from '../tools/website-checker.js';
import { saveAnalysisTool } from '../tools/database.js';

vi.mock('../tools/lighthouse.js', () => ({
  runLighthouseTool: { type: 'function', function: { name: 'run_lighthouse', description: 'Runs Lighthouse audit', parameters: {} } },
}));

vi.mock('../tools/tech-detect.js', () => ({
  detectTechTool: { type: 'function', function: { name: 'detect_tech', description: 'Detects technology stack', parameters: {} } },
}));

vi.mock('../tools/web-scraper.js', () => ({
  scrapePageTool: { type: 'function', function: { name: 'scrape_page', description: 'Scrapes a web page', parameters: {} } },
}));

vi.mock('../tools/website-checker.js', () => ({
  checkWebsiteTool: { type: 'function', function: { name: 'check_website', description: 'Checks website accessibility', parameters: {} } },
}));

vi.mock('../tools/database.js', () => ({
  saveAnalysisTool: { type: 'function', function: { name: 'save_analysis', description: 'Saves analysis results', parameters: {} } },
}));

describe('createAnalysisAgent', () => {
  let result: AgentConfig;

  beforeEach(() => {
    result = createAnalysisAgent();
  });

  it('should return an object with the correct structure', () => {
    expect(result).toBeTypeOf('object');
    expect(result).toHaveProperty('name');
    expect(result).toHaveProperty('systemPrompt');
    expect(result).toHaveProperty('tools');
    expect(result).toHaveProperty('maxIterations');
    expect(result).toHaveProperty('maxTokens');
  });

  it('should set the agent name to "analysis"', () => {
    expect(result.name).toBe('analysis');
  });

  it('should return a non-empty system prompt string', () => {
    expect(result.systemPrompt).toBeTypeOf('string');
    expect(result.systemPrompt.length).toBeGreaterThan(0);
  });

  describe('system prompt', () => {
    it('should identify itself as a business analysis agent for FindX', () => {
      expect(result.systemPrompt).toContain('FindX');
      expect(result.systemPrompt).toContain('business analysis agent');
    });

    it('should mention Dutch business prospecting platform', () => {
      expect(result.systemPrompt).toContain('Dutch business prospecting platform');
    });

    it('should include the lead data JSON schema', () => {
      expect(result.systemPrompt).toContain('"id"');
      expect(result.systemPrompt).toContain('"businessName"');
      expect(result.systemPrompt).toContain('"website"');
      expect(result.systemPrompt).toContain('"city"');
      expect(result.systemPrompt).toContain('"industry"');
      expect(result.systemPrompt).toContain('"email"');
      expect(result.systemPrompt).toContain('"phone"');
    });

    it('should describe strategy for businesses with a website', () => {
      expect(result.systemPrompt).toContain('check_website');
      expect(result.systemPrompt).toContain('run_lighthouse');
      expect(result.systemPrompt).toContain('detect_tech');
      expect(result.systemPrompt).toContain('scrape_page');
    });

    it('should describe strategy for businesses without a website', () => {
      expect(result.systemPrompt).toContain('no website');
      expect(result.systemPrompt).toContain('invisible online');
    });

    it('should include instructions to save analysis using save_analysis', () => {
      expect(result.systemPrompt).toContain('save_analysis');
      expect(result.systemPrompt).toContain('findings');
      expect(result.systemPrompt).toContain('opportunities');
      expect(result.systemPrompt).toContain('score');
    });

    it('should define scoring guide ranges', () => {
      expect(result.systemPrompt).toContain('0-15');
      expect(result.systemPrompt).toContain('16-40');
      expect(result.systemPrompt).toContain('41-60');
      expect(result.systemPrompt).toContain('61-80');
      expect(result.systemPrompt).toContain('81-100');
    });

    it('should describe severity levels', () => {
      expect(result.systemPrompt).toContain('critical');
      expect(result.systemPrompt).toContain('warning');
      expect(result.systemPrompt).toContain('info');
    });

    it('should instruct the agent to output a brief summary', () => {
      expect(result.systemPrompt).toContain('brief summary');
    });

    it('should list analysis categories: missing tools, performance, SEO, accessibility, social media, mobile', () => {
      expect(result.systemPrompt).toContain('Missing tools');
      expect(result.systemPrompt).toContain('Performance issues');
      expect(result.systemPrompt).toContain('SEO gaps');
      expect(result.systemPrompt).toContain('Accessibility');
      expect(result.systemPrompt).toContain('social media');
      expect(result.systemPrompt).toContain('mobile');
    });
  });

  describe('tools array', () => {
    it('should return exactly 5 tools', () => {
      expect(result.tools).toHaveLength(5);
    });

    it('should include runLighthouseTool', () => {
      expect(result.tools).toContainEqual(runLighthouseTool);
    });

    it('should include detectTechTool', () => {
      expect(result.tools).toContainEqual(detectTechTool);
    });

    it('should include scrapePageTool', () => {
      expect(result.tools).toContainEqual(scrapePageTool);
    });

    it('should include checkWebsiteTool', () => {
      expect(result.tools).toContainEqual(checkWebsiteTool);
    });

    it('should include saveAnalysisTool', () => {
      expect(result.tools).toContainEqual(saveAnalysisTool);
    });

    it('should not contain duplicate tools', () => {
      const toolNames = result.tools.map((t: any) => t.function?.name);
      const uniqueNames = new Set(toolNames);
      expect(uniqueNames.size).toBe(toolNames.length);
    });

    it('should contain all expected tool names', () => {
      const toolNames = result.tools.map((t: any) => t.function?.name);
      expect(toolNames).toContain('run_lighthouse');
      expect(toolNames).toContain('detect_tech');
      expect(toolNames).toContain('scrape_page');
      expect(toolNames).toContain('check_website');
      expect(toolNames).toContain('save_analysis');
    });
  });

  describe('maxIterations', () => {
    it('should be set to 15', () => {
      expect(result.maxIterations).toBe(15);
    });

    it('should be a positive integer', () => {
      expect(result.maxIterations).toBeGreaterThan(0);
      expect(Number.isInteger(result.maxIterations)).toBe(true);
    });
  });

  describe('maxTokens', () => {
    it('should be set to 4096', () => {
      expect(result.maxTokens).toBe(4096);
    });

    it('should be a positive integer', () => {
      expect(result.maxTokens).toBeGreaterThan(0);
      expect(Number.isInteger(result.maxTokens)).toBe(true);
    });
  });

  describe('idempotency', () => {
    it('should return a new object on each call (not cached)', () => {
      const call1 = createAnalysisAgent();
      const call2 = createAnalysisAgent();
      expect(call1).not.toBe(call2);
    });

    it('should return equivalent config objects on each call', () => {
      const call1 = createAnalysisAgent();
      const call2 = createAnalysisAgent();
      expect(call1.name).toBe(call2.name);
      expect(call1.systemPrompt).toBe(call2.systemPrompt);
      expect(call1.maxIterations).toBe(call2.maxIterations);
      expect(call1.maxTokens).toBe(call2.maxTokens);
      expect(call1.tools).toEqual(call2.tools);
    });
  });

  describe('conformance to AgentConfig type', () => {
    it('should have a name that is a string', () => {
      expect(typeof result.name).toBe('string');
    });

    it('should have a systemPrompt that is a string', () => {
      expect(typeof result.systemPrompt).toBe('string');
    });

    it('should have tools that is an array', () => {
      expect(Array.isArray(result.tools)).toBe(true);
    });

    it('should have maxIterations that is a number', () => {
      expect(typeof result.maxIterations).toBe('number');
    });

    it('should have maxTokens that is a number', () => {
      expect(typeof result.maxTokens).toBe('number');
    });
  });
});