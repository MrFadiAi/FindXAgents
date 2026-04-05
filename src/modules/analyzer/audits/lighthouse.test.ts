import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { CategoryScore, Finding, Severity } from '../types.js';
import { runLighthouseAudit, type LighthouseAuditResult } from './lighthouse.js';

// --- Mocks ---
const { mockPathResolve, mockPathJoin, mockMkdir, mockLaunch, mockLighthouse } = vi.hoisted(() => ({
  mockPathResolve: (...args: string[]) => args.join('/'),
  mockPathJoin: (...args: string[]) => args.join('/'),
  mockMkdir: vi.fn().mockResolvedValue(undefined),
  mockLaunch: vi.fn(),
  mockLighthouse: vi.fn(),
}));

vi.mock('node:path', () => ({
  resolve: (...args: string[]) => mockPathResolve(...args),
  join: (...args: string[]) => mockPathJoin(...args),
}));

vi.mock('node:fs', () => ({
  promises: {
    mkdir: mockMkdir,
  },
}));

vi.mock('chrome-launcher', () => ({
  launch: mockLaunch,
}));

vi.mock('lighthouse', () => ({
  default: mockLighthouse,
}));

import chromeLauncher from 'chrome-launcher';
import lighthouse from 'lighthouse';

// Internal helper functions aren't exported, we test them via the exported function's outputs.
// But we CAN test the HTTP fallback behavior directly by causing the chrome-launcher to fail.

describe('lighthouse.ts', () => {
  const originalFetch = global.fetch;
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    global.fetch = vi.fn();
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  describe('runLighthouseAudit', () => {
    const targetUrl = 'http://example.com';

    it('should create a tmp directory on startup', async () => {
      mockLaunch.mockRejectedValue(new Error('Fail early'));
      vi.mocked(global.fetch).mockResolvedValue(new Response('<html></html>', { status: 200 }));

      await runLighthouseAudit(targetUrl);
      
      expect(mockMkdir).toHaveBeenCalled();
    });

    describe('Happy Path (Lighthouse execution)', () => {
      it('should launch chrome, run lighthouse, return mapped categories and kill chrome', async () => {
        const killMock = vi.fn().mockResolvedValue(undefined);
        mockLaunch.mockResolvedValue({ port: 9222, kill: killMock } as any);
        
        const mockLhr = {
          categories: {
            performance: { score: 0.95, auditRefs: [] },
            accessibility: { score: 0.85, auditRefs: [] },
            seo: { score: 0.90, auditRefs: [] },
            'best-practices': { score: 1.0, auditRefs: [] },
          },
          audits: {},
        };

        mockLighthouse.mockResolvedValue({ lhr: mockLhr } as any);

        const result = await runLighthouseAudit(targetUrl);

        expect(mockLaunch).toHaveBeenCalledWith(expect.objectContaining({
          chromeFlags: expect.arrayContaining(['--headless', '--no-sandbox']),
        }));
        expect(mockLighthouse).toHaveBeenCalledWith(targetUrl, expect.objectContaining({
          port: 9222,
          onlyCategories: ['performance', 'accessibility', 'seo', 'best-practices'],
        }));

        expect(killMock).toHaveBeenCalledOnce();
        
        expect(result.categories).toEqual([
          { name: 'performance', score: 95 },
          { name: 'accessibility', score: 85 },
          { name: 'seo', score: 90 },
          { name: 'bestPractices', score: 100 },
        ]);
        expect(result.findings).toEqual([]);
      });

      it('should extract findings for scores < 0.9 and sort them by severity', async () => {
        const killMock = vi.fn().mockResolvedValue(undefined);
        mockLaunch.mockResolvedValue({ port: 9222, kill: killMock } as any);
        
        const mockLhr = {
          categories: {
            performance: { 
              score: 0.5, 
              auditRefs: [
                { id: 'slow-resource', weight: 1, result: { score: 0.4, scoreDisplayMode: 'numeric', title: 'Slow Resource', description: 'Resource is slow', numericValue: 5000, displayValue: '5.0s' }},
                { id: 'fast-resource', weight: 1, result: { score: 1.0, scoreDisplayMode: 'numeric', title: 'Fast Resource' }},
              ] 
            },
            seo: {
              score: 0.6,
              auditRefs: [
                { id: 'missing-meta', weight: 1, result: { score: 0, scoreDisplayMode: 'binary', title: 'Missing Meta Description', description: 'No meta desc' }},
              ]
            }
          },
          audits: {},
        };

        mockLighthouse.mockResolvedValue({ lhr: mockLhr } as any);

        const result = await runLighthouseAudit(targetUrl);

        // 0.4 is critical (< 0.5), 0 is critical
        expect(result.findings).toHaveLength(2);
        
        // Both are critical, so order depends on category loop
        expect(result.findings[0].severity).toBe('critical');
        expect(result.findings[0].title).toBe('Slow Resource');
        expect(result.findings[0].auditId).toBe('slow-resource');
        expect(result.findings[0].value).toBe('5.0s');
        
        expect(result.findings[1].severity).toBe('critical');
        expect(result.findings[1].title).toBe('Missing Meta Description');
      });

      it('should default score to 0 if lighthouse score is null', async () => {
        const killMock = vi.fn().mockResolvedValue(undefined);
        mockLaunch.mockResolvedValue({ port: 9222, kill: killMock } as any);
        
        const mockLhr = {
          categories: {
            performance: { score: null, auditRefs: [] },
          },
          audits: {},
        };

        mockLighthouse.mockResolvedValue({ lhr: mockLhr } as any);

        const result = await runLighthouseAudit(targetUrl);
        expect(result.categories).toEqual([{ name: 'performance', score: 0 }]);
      });

      it('should still kill chrome if lighthouse throws an internal error', async () => {
        const killMock = vi.fn().mockResolvedValue(undefined);
        mockLaunch.mockResolvedValue({ port: 9222, kill: killMock } as any);
        
        mockLighthouse.mockRejectedValue(new Error('Lighthouse internal panic'));
        
        // Fallback to HTTP
        vi.mocked(global.fetch).mockResolvedValue(new Response('<html lang="en"><head><title>Test</title><meta name="viewport" content="width=device-width"></head></html>', { status: 200 }));

        await runLighthouseAudit(targetUrl);

        expect(killMock).toHaveBeenCalledOnce();
      });
    });

    describe('Fallback Path (HTTP-based scoring)', () => {
      beforeEach(() => {
        // Force fallback path
        mockLaunch.mockRejectedValue(new Error('No Chrome installed'));
      });

      it('should calculate Performance score based on status and response time', async () => {
        vi.mocked(global.fetch).mockImplementation(async (url: any) => {
          if (typeof url === 'string' && url.startsWith('https://')) {
            return new Response(null, { status: 200 }); // SSL check
          }
          // Simulate 500ms response time
          return new Response('<html></html>', { status: 200 });
        });

        const result = await runLighthouseAudit(targetUrl);
        
        const perf = result.categories.find(c => c.name === 'performance');
        expect(perf).toBeDefined();
        // Base 50 + 20 (good status) + 20 (fast response, we assume it's < 1000ms in test env)
        expect(perf!.score).toBe(90); 
      });

      it('should cap Performance score at 100', async () => {
        vi.mocked(global.fetch).mockResolvedValue(new Response('<html></html>', { status: 200 }));
        const result = await runLighthouseAudit(targetUrl);
        const perf = result.categories.find(c => c.name === 'performance');
        expect(perf!.score).toBeLessThanOrEqual(100);
      });

      it('should heavily penalize performance and add critical finding if server is unreachable (status 0)', async () => {
        vi.mocked(global.fetch).mockImplementation(async (url: any) => {
          throw new Error('Network error');
        });

        const result = await runLighthouseAudit(targetUrl);

        const perf = result.categories.find(c => c.name === 'performance');
        expect(perf!.score).toBe(10);

        const unreachableFinding = result.findings.find(f => f.auditId === 'server-unreachable');
        expect(unreachableFinding).toBeDefined();
        expect(unreachableFinding!.severity).toBe('critical');
      });

      it('should evaluate Accessibility checks (lang, title, viewport, alts)', async () => {
        const html = `
          <html>
          <head></head>
          <body>
            <img src="1.jpg">
            <img src="2.jpg">
            <img src="3.jpg">
            <img src="4.jpg">
            <img src="5.jpg">
            <img src="6.jpg"> <!-- 6 missing alts -->
          </body></html>
        `;
        vi.mocked(global.fetch).mockResolvedValue(new Response(html, { status: 200 }));

        const result = await runLighthouseAudit(targetUrl);

        const a11y = result.categories.find(c => c.name === 'accessibility');
        // Base 60 + 0(lang) + 0(title) + 0(viewport) - 10(imgs) = 50
        expect(a11y!.score).toBe(50);

        expect(result.findings).toContainEqual(expect.objectContaining({ auditId: 'html-lang', severity: 'warning' }));
        expect(result.findings).toContainEqual(expect.objectContaining({ auditId: 'document-title', severity: 'critical' }));
        expect(result.findings).toContainEqual(expect.objectContaining({ auditId: 'viewport', severity: 'warning' }));
        expect(result.findings).toContainEqual(expect.objectContaining({ auditId: 'image-alt', severity: 'warning', title: '6 images may lack alt text' }));
      });

      it('should evaluate SEO checks (desc, h1, canonical, og, ssl)', async () => {
        const html = `
          <html lang="en">
          <head>
            <title>Test</title>
            <meta name="viewport" content="width=device-width">
            <meta name="description" content="A test">
            <link rel="canonical" href="https://example.com">
            <meta property="og:title" content="Test">
          </head>
          <body><h1>Hello</h1></body></html>
        `;
        
        vi.mocked(global.fetch).mockImplementation(async (url: any) => {
          if (typeof url === 'string' && url.startsWith('https://')) {
            return new Response(null, { status: 200 }); // hasSSL = true
          }
          return new Response(html, { status: 200 });
        });

        const result = await runLighthouseAudit(targetUrl);

        const seo = result.categories.find(c => c.name === 'seo');
        // Base 50 + 15(desc) + 15(h1) + 10(canonical) + 10(og) + 5(ssl) = 105 -> min 100
        expect(seo!.score).toBe(100);
        
        const seoFindings = result.findings.filter(f => f.category === 'seo');
        expect(seoFindings).toHaveLength(0);
      });

      it('should handle missing SEO elements properly', async () => {
        const html = `<html><head></head><body></body></html>`;
        
        vi.mocked(global.fetch).mockImplementation(async (url: any) => {
          if (typeof url === 'string' && url.startsWith('https://')) {
            return new Response(null, { status: 500 }); // hasSSL = false
          }
          return new Response(html, { status: 200 });
        });

        const result = await runLighthouseAudit(targetUrl);

        const seo = result.categories.find(c => c.name === 'seo');
        // Base 50 + 0 + 0 + 0 + 0 + 0 = 50
        expect(seo!.score).toBe(50);

        expect(result.findings).toContainEqual(expect.objectContaining({ auditId: 'meta-description' }));
        expect(result.findings).toContainEqual(expect.objectContaining({ auditId: 'h1' }));
        expect(result.findings).toContainEqual(expect.objectContaining({ auditId: 'ssl' }));
      });

      it('should evaluate Best Practices based on SSL and good status', async () => {
        vi.mocked(global.fetch).mockImplementation(async (url: any) => {
          if (typeof url === 'string' && url.startsWith('https://')) {
            return new Response(null, { status: 200 }); // hasSSL = true
          }
          return new Response('<html></html>', { status: 200 }); // Good status
        });

        const result = await runLighthouseAudit(targetUrl);

        const bp = result.categories.find(c => c.name === 'bestPractices');
        // Base 70 + 15(ssl) + 15(good status) = 100
        expect(bp!.score).toBe(100);
      });

      it('should heavily penalize Best Practices for bad status and no SSL', async () => {
        vi.mocked(global.fetch).mockImplementation(async (url: any) => {
          if (typeof url === 'string' && url.startsWith('https://')) {
            throw new Error('No SSL'); // hasSSL = false
          }
          return new Response('<html></html>', { status: 500 }); // Bad status
        });

        const result = await runLighthouseAudit(targetUrl);

        const bp = result.categories.find(c => c.name === 'bestPractices');
        // Base 70 - 20(no ssl) - 30(bad status) = 20 -> max(0, 20)
        expect(bp!.score).toBe(20);
      });

      it('should sort findings by severity (critical first)', async () => {
        const html = `<html><head></head><body></body></html>`;
        
        vi.mocked(global.fetch).mockImplementation(async (url: any) => {
          if (typeof url === 'string' && url.startsWith('https://')) {
            return new Response(null, { status: 500 }); 
          }
          return new Response(html, { status: 500 }); // triggers server error finding (if we had specific logic for 500, but here it triggers BP penalty)
        });

        const result = await runLighthouseAudit(targetUrl);
        
        const severities = result.findings.map(f => f.severity);
        // Simple check: if there's a critical, it shouldn't be after a warning
        const firstWarningIdx = severities.indexOf('warning');
        const firstCriticalIdx = severities.indexOf('critical');

        if (firstCriticalIdx !== -1 && firstWarningIdx !== -1) {
          expect(firstCriticalIdx).toBeLessThan(firstWarningIdx);
        }
      });

      it('should fall back gracefully if lighthouse returns null result', async () => {
        const killMock = vi.fn().mockResolvedValue(undefined);
        mockLaunch.mockResolvedValue({ port: 9222, kill: killMock } as any);
        
        mockLighthouse.mockResolvedValue({ lhr: null } as any);
        vi.mocked(global.fetch).mockResolvedValue(new Response('<html></html>', { status: 200 }));

        const result = await runLighthouseAudit(targetUrl);
        
        // Should hit the throw new Error("Lighthouse returned no results") -> catch block -> fallback
        expect(result.categories.find(c => c.name === 'performance')?.score).toBeDefined();
      });
    });
  });
});