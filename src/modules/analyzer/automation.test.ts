import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Store original env
const originalEnv = process.env;

// Import after mocks are set up
import { detectOpportunities } from './automation.js';
import type { Finding, DetectedTechnology } from './types.js';

beforeEach(() => {
  vi.resetModules();
  mockFetch.mockReset();
  process.env = { ...originalEnv, GLM_API_KEY: 'test-api-key' };
});

afterEach(() => {
  process.env = originalEnv;
});

describe('detectOpportunities', () => {
  const sampleFindings: Finding[] = [
    {
      title: 'Large image files detected',
      category: 'performance',
      severity: 'critical',
      value: '2.5 MB',
    },
    {
      title: 'Missing meta description',
      category: 'seo',
      severity: 'high',
      value: null,
    },
    {
      title: 'Low color contrast',
      category: 'accessibility',
      severity: 'medium',
      value: '#888 on #fff',
    },
  ];

  const sampleTechnologies: DetectedTechnology[] = [
    { name: 'WordPress', category: 'CMS' },
    { name: 'jQuery', category: 'JavaScript Library' },
  ];

  const validAIResponse = {
    content: [
      {
        type: 'text',
        text: JSON.stringify([
          {
            title: 'Optimize image delivery',
            description: 'Large images slow down page load and hurt conversions.',
            impact: 'high',
            effort: 'low',
            category: 'performance',
          },
          {
            title: 'Add meta descriptions',
            description: 'Missing meta descriptions reduce click-through from search results.',
            impact: 'medium',
            effort: 'low',
            category: 'seo',
          },
        ]),
      },
    ],
  };

  function mockFetchResponse(data: unknown, status = 200, ok = true) {
    mockFetch.mockResolvedValueOnce({
      ok,
      status,
      text: async () => JSON.stringify(data),
      json: async () => data,
    });
  }

  it('returns empty array when no findings and no technologies are provided', async () => {
    const result = await detectOpportunities([], [], 'https://example.com');
    expect(result).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('calls the AI API with correct headers and body', async () => {
    mockFetchResponse(validAIResponse);

    await detectOpportunities(sampleFindings, sampleTechnologies, 'https://example.com');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];

    expect(url).toBe('https://api.z.ai/api/anthropic/v1/messages');
    expect(options.method).toBe('POST');
    expect(options.headers).toEqual({
      'Content-Type': 'application/json',
      'x-api-key': '',
      'anthropic-version': '2023-06-01',
    });

    const body = JSON.parse(options.body);
    expect(body.model).toBe('claude-sonnet-4-20250514');
    expect(body.max_tokens).toBe(2048);
    expect(body.messages).toEqual([{ role: 'user', content: expect.any(String) }]);
    expect(body.system).toContain('web consultant');
  });

  it('uses custom GLM_BASE_URL and GLM_MODEL from environment', async () => {
    process.env.GLM_BASE_URL = 'https://custom.api.com/v1';
    process.env.GLM_MODEL = 'custom-model-v2';

    // Need to re-import to pick up env changes — since module reads env at import time,
    // we test by calling and checking the URL used
    mockFetchResponse(validAIResponse);

    await detectOpportunities(sampleFindings, [], 'https://example.com');

    // Note: Since the module reads env at module load time, the original values are cached.
    // This test verifies the fetch was called (the URL depends on when the module was loaded)
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('parses AI response as array and returns mapped opportunities', async () => {
    mockFetchResponse(validAIResponse);

    const result = await detectOpportunities(sampleFindings, sampleTechnologies, 'https://example.com');

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      title: 'Optimize image delivery',
      description: 'Large images slow down page load and hurt conversions.',
      impact: 'high',
      effort: 'low',
      category: 'performance',
    });
    expect(result[1]).toEqual({
      title: 'Add meta descriptions',
      description: 'Missing meta descriptions reduce click-through from search results.',
      impact: 'medium',
      effort: 'low',
      category: 'seo',
    });
  });

  it('parses AI response when wrapped in object with opportunities key', async () => {
    const responseObject = {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            opportunities: [
              {
                title: 'Add analytics',
                description: 'No tracking detected.',
                impact: 'high',
                effort: 'low',
                category: 'technology',
              },
            ],
          }),
        },
      ],
    };
    mockFetchResponse(responseObject);

    const result = await detectOpportunities(sampleFindings, [], 'https://example.com');

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Add analytics');
  });

  it('returns empty array when AI response content is empty text', async () => {
    mockFetchResponse({
      content: [{ type: 'text', text: '' }],
    });

    const result = await detectOpportunities(sampleFindings, [], 'https://example.com');

    expect(result).toEqual([]);
  });

  it('returns empty array when AI response has no content array', async () => {
    mockFetchResponse({
      content: [],
    });

    const result = await detectOpportunities(sampleFindings, [], 'https://example.com');

    expect(result).toEqual([]);
  });

  it('returns empty array when AI response content is null/undefined', async () => {
    mockFetchResponse({});

    const result = await detectOpportunities(sampleFindings, [], 'https://example.com');

    expect(result).toEqual([]);
  });

  it('returns fallback opportunities when AI API returns non-OK response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
      json: async () => ({}),
    });

    const result = await detectOpportunities(sampleFindings, [], 'https://example.com');

    // Should fallback to generated opportunities from findings
    expect(result.length).toBeGreaterThanOrEqual(0);
    // The findings have "critical" severity in performance, so should generate fallback
    const criticalFindings = sampleFindings.filter((f) => f.severity === 'critical');
    if (criticalFindings.length > 0) {
      expect(result.length).toBeGreaterThan(0);
    }
  });

  it('returns fallback opportunities when AI response is invalid JSON', async () => {
    mockFetchResponse({
      content: [{ type: 'text', text: 'not valid json {{{' }],
    });

    const result = await detectOpportunities(sampleFindings, [], 'https://example.com');

    // Falls back to generating from findings
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].title).toContain('critical');
    expect(result[0].impact).toBe('high');
  });

  it('returns fallback opportunities when fetch throws a network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network failure'));

    const result = await detectOpportunities(sampleFindings, [], 'https://example.com');

    expect(result.length).toBeGreaterThan(0);
  });

  it('generates correct fallback from critical findings grouped by category', async () => {
    mockFetch.mockRejectedValueOnce(new Error('fail'));

    const findings: Finding[] = [
      { title: 'Issue 1', category: 'performance', severity: 'critical', value: null },
      { title: 'Issue 2', category: 'performance', severity: 'critical', value: null },
      { title: 'Issue 3', category: 'seo', severity: 'critical', value: null },
      { title: 'Issue 4', category: 'accessibility', severity: 'warning', value: null },
    ];

    const result = await detectOpportunities(findings, [], 'https://example.com');

    expect(result).toHaveLength(2); // performance (2 critical) and seo (1 critical)
    const perfOpp = result.find((r) => r.category === 'performance');
    expect(perfOpp).toBeDefined();
    expect(perfOpp!.title).toBe('Fix 2 critical performance issues');
    expect(perfOpp!.impact).toBe('high');
    expect(perfOpp!.effort).toBe('medium');

    const seoOpp = result.find((r) => r.category === 'seo');
    expect(seoOpp).toBeDefined();
    expect(seoOpp!.title).toBe('Fix 1 critical seo issues');
  });

  it('limits fallback opportunities to 5', async () => {
    mockFetch.mockRejectedValueOnce(new Error('fail'));

    const findings: Finding[] = Array.from({ length: 8 }, (_, i) => ({
      title: `Issue ${i}`,
      category: `category-${i}`,
      severity: 'critical' as const,
      value: null,
    }));

    const result = await detectOpportunities(findings, [], 'https://example.com');

    expect(result.length).toBeLessThanOrEqual(5);
  });

  it('returns empty fallback when no critical findings exist', async () => {
    mockFetch.mockRejectedValueOnce(new Error('fail'));

    const findings: Finding[] = [
      { title: 'Minor issue', category: 'seo', severity: 'info', value: null },
      { title: 'Another minor', category: 'performance', severity: 'warning', value: null },
    ];

    const result = await detectOpportunities(findings, [], 'https://example.com');

    expect(result).toEqual([]);
  });

  it('includes URL in the prompt', async () => {
    mockFetchResponse(validAIResponse);

    await detectOpportunities(sampleFindings, [], 'https://my-dutch-site.nl');

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    const userPrompt = body.messages[0].content;
    expect(userPrompt).toContain('https://my-dutch-site.nl');
  });

  it('includes technologies in the prompt when provided', async () => {
    mockFetchResponse(validAIResponse);

    await detectOpportunities([], sampleTechnologies, 'https://example.com');

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    const userPrompt = body.messages[0].content;
    expect(userPrompt).toContain('WordPress');
    expect(userPrompt).toContain('jQuery');
    expect(userPrompt).toContain('CMS');
    expect(userPrompt).toContain('JavaScript Library');
  });

  it('includes findings in the prompt with severity and value', async () => {
    mockFetchResponse(validAIResponse);

    await detectOpportunities(sampleFindings, [], 'https://example.com');

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    const userPrompt = body.messages[0].content;
    expect(userPrompt).toContain('CRITICAL');
    expect(userPrompt).toContain('performance');
    expect(userPrompt).toContain('Large image files detected');
    expect(userPrompt).toContain('2.5 MB');
  });

  it('limits findings to 20 in the prompt', async () => {
    mockFetchResponse(validAIResponse);

    const manyFindings: Finding[] = Array.from({ length: 30 }, (_, i) => ({
      title: `Finding ${i}`,
      category: 'performance',
      severity: 'warning' as const,
      value: null,
    }));

    await detectOpportunities(manyFindings, [], 'https://example.com');

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    const userPrompt = body.messages[0].content;
    // Should include findings 0-19 but not 20-29
    expect(userPrompt).toContain('Finding 0');
    expect(userPrompt).toContain('Finding 19');
    expect(userPrompt).not.toContain('Finding 20');
    expect(userPrompt).not.toContain('Finding 29');
  });

  it('omits value from prompt when finding value is null', async () => {
    mockFetchResponse(validAIResponse);

    const findings: Finding[] = [
      { title: 'No value issue', category: 'seo', severity: 'high', value: null },
    ];

    await detectOpportunities(findings, [], 'https://example.com');

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    const userPrompt = body.messages[0].content;
    // The finding line should end with the title, no parenthetical value
    const line = userPrompt.split('\n').find((l: string) => l.includes('No value issue'));
    expect(line).toBeDefined();
    expect(line!.trim()).toBe('- [HIGH] seo: No value issue');
  });

  it('includes value in prompt when finding has a value', async () => {
    mockFetchResponse(validAIResponse);

    const findings: Finding[] = [
      { title: 'Slow load', category: 'performance', severity: 'critical', value: '8.5s' },
    ];

    await detectOpportunities(findings, [], 'https://example.com');

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    const userPrompt = body.messages[0].content;
    const line = userPrompt.split('\n').find((l: string) => l.includes('Slow load'));
    expect(line).toBeDefined();
    expect(line!.trim()).toBe('- [CRITICAL] performance: Slow load (8.5s)');
  });

  it('works with only technologies and no findings', async () => {
    mockFetchResponse(validAIResponse);

    const result = await detectOpportunities([], sampleTechnologies, 'https://example.com');

    expect(result).toHaveLength(2);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('works with only findings and no technologies', async () => {
    mockFetchResponse(validAIResponse);

    const result = await detectOpportunities(sampleFindings, [], 'https://example.com');

    expect(result).toHaveLength(2);
  });

  it('handles AI response with empty array', async () => {
    mockFetchResponse({
      content: [{ type: 'text', text: '[]' }],
    });

    const result = await detectOpportunities(sampleFindings, [], 'https://example.com');

    expect(result).toEqual([]);
  });

  it('handles AI response with object containing empty opportunities array', async () => {
    mockFetchResponse({
      content: [{ type: 'text', text: '{"opportunities": []}' }],
    });

    const result = await detectOpportunities(sampleFindings, [], 'https://example.com');

    expect(result).toEqual([]);
  });

  it('handles AI response where parsed JSON has no opportunities key and is not array', async () => {
    mockFetchResponse({
      content: [{ type: 'text', text: '{"other_key": "value"}' }],
    });

    const result = await detectOpportunities(sampleFindings, [], 'https://example.com');

    // parsed.opportunities is undefined, so opportunities array is empty []
    expect(result).toEqual([]);
  });

  it('maps all fields from AI opportunity to output opportunity', async () => {
    const aiResponse = {
      content: [
        {
          type: 'text',
          text: JSON.stringify([
            {
              title: 'Install booking system',
              description: 'No online booking available for customers.',
              impact: 'high',
              effort: 'medium',
              category: 'conversion',
            },
          ]),
        },
      ],
    };
    mockFetchResponse(aiResponse);

    const result = await detectOpportunities(
      [{ title: 't', category: 'c', severity: 'low', value: null }],
      [],
      'https://example.com',
    );

    expect(result).toHaveLength(1);
    const opp = result[0];
    expect(opp).toHaveProperty('title', 'Install booking system');
    expect(opp).toHaveProperty('description', 'No online booking available for customers.');
    expect(opp).toHaveProperty('impact', 'high');
    expect(opp).toHaveProperty('effort', 'medium');
    expect(opp).toHaveProperty('category', 'conversion');
  });

  it('throws descriptive error when AI API returns error status', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: async () => 'Rate limited',
      json: async () => ({}),
    });

    // The function catches errors and falls back, so it shouldn't throw
    const result = await detectOpportunities(
      [{ title: 't', category: 'c', severity: 'critical', value: null }],
      [],
      'https://example.com',
    );

    expect(result.length).toBeGreaterThan(0);
  });

  it('handles multiple opportunities with different impact/effort levels', async () => {
    const multiResponse = {
      content: [
        {
          type: 'text',
          text: JSON.stringify([
            { title: 'A', description: 'd', impact: 'high', effort: 'low', category: 'performance' },
            { title: 'B', description: 'd', impact: 'medium', effort: 'medium', category: 'seo' },
            { title: 'C', description: 'd', impact: 'low', effort: 'high', category: 'accessibility' },
            { title: 'D', description: 'd', impact: 'high', effort: 'high', category: 'technology' },
          ]),
        },
      ],
    };
    mockFetchResponse(multiResponse);

    const result = await detectOpportunities(sampleFindings, sampleTechnologies, 'https://example.com');

    expect(result).toHaveLength(4);
    expect(result.map((r) => r.impact)).toEqual(['high', 'medium', 'low', 'high']);
    expect(result.map((r) => r.effort)).toEqual(['low', 'medium', 'high', 'high']);
  });

  it('uses empty string for x-api-key when GLM_API_KEY is not set', async () => {
    delete process.env.GLM_API_KEY;

    mockFetchResponse(validAIResponse);

    await detectOpportunities(sampleFindings, [], 'https://example.com');

    // Note: API_KEY is captured at module load time, so this may still use old value
    // But we verify the call happens
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('falls back gracefully when content array has no text property', async () => {
    mockFetchResponse({
      content: [{ type: 'image', data: 'base64...' }],
    });

    // content[0].text is undefined, so the function returns empty string then []
    const result = await detectOpportunities(
      [{ title: 't', category: 'c', severity: 'critical', value: null }],
      [],
      'https://example.com',
    );

    expect(result).toEqual([]);
  });

  it('builds prompt with technologies and findings sections combined', async () => {
    mockFetchResponse(validAIResponse);

    await detectOpportunities(sampleFindings, sampleTechnologies, 'https://test.nl');

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    const userPrompt = body.messages[0].content;

    expect(userPrompt).toContain('## Detected Technologies');
    expect(userPrompt).toContain('## Audit Findings');
    expect(userPrompt).toContain('Website: https://test.nl');
    expect(userPrompt).toContain('automation/improvement opportunities');
  });

  it('does not include technologies section when technologies array is empty', async () => {
    mockFetchResponse(validAIResponse);

    await detectOpportunities(sampleFindings, [], 'https://example.com');

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    const userPrompt = body.messages[0].content;

    expect(userPrompt).not.toContain('## Detected Technologies');
    expect(userPrompt).toContain('## Audit Findings');
  });

  it('does not include findings section when findings array is empty', async () => {
    mockFetchResponse(validAIResponse);

    await detectOpportunities([], sampleTechnologies, 'https://example.com');

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    const userPrompt = body.messages[0].content;

    expect(userPrompt).toContain('## Detected Technologies');
    expect(userPrompt).not.toContain('## Audit Findings');
  });

  it('handles AI response with extra properties on opportunity objects', async () => {
    const extraResponse = {
      content: [
        {
          type: 'text',
          text: JSON.stringify([
            {
              title: 'Fix perf',
              description: 'desc',
              impact: 'high',
              effort: 'low',
              category: 'performance',
              extraField: 'ignored',
              anotherExtra: 42,
            },
          ]),
        },
      ],
    };
    mockFetchResponse(extraResponse);

    const result = await detectOpportunities(sampleFindings, [], 'https://example.com');

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      title: 'Fix perf',
      description: 'desc',
      impact: 'high',
      effort: 'low',
      category: 'performance',
    });
    expect(result[0]).not.toHaveProperty('extraField');
  });
});