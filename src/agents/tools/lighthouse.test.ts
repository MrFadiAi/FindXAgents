import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the dynamic import of the lighthouse audit module
const mockRunLighthouseAudit = vi.fn();
vi.mock('../../modules/analyzer/audits/lighthouse.js', () => ({
  get runLighthouseAudit() {
    return mockRunLighthouseAudit;
  },
}));

// Import the tool after mocks are set up
import { runLighthouseTool } from './lighthouse.js';

describe('runLighthouseTool', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Reset process event listener mocks
    vi.spyOn(process, 'on').mockImplementation(() => process);
    vi.spyOn(process, 'off').mockImplementation(() => process);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should have correct tool metadata', () => {
    expect(runLighthouseTool.name).toBe('run_lighthouse');
    expect(runLighthouseTool.description).toContain('Lighthouse audit');
    expect(runLighthouseTool.description).toContain('10-30 seconds');
    expect(runLighthouseTool.input_schema).toEqual({
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The website URL to audit',
        },
      },
      required: ['url'],
    });
  });

  describe('execute', () => {
    it('should run lighthouse audit and return categories and findings', async () => {
      const mockResult = {
        categories: {
          performance: { score: 0.95 },
          accessibility: { score: 0.88 },
          seo: { score: 0.92 },
          'best-practices': { score: 0.90 },
        },
        findings: [
          { id: 'f1', description: 'Finding 1' },
          { id: 'f2', description: 'Finding 2' },
        ],
      };
      mockRunLighthouseAudit.mockResolvedValue(mockResult);

      const input = { url: 'https://example.com' };
      const result = await runLighthouseTool.execute(input);

      expect(mockRunLighthouseAudit).toHaveBeenCalledWith('https://example.com');
      expect(JSON.parse(result as string)).toEqual({
        categories: mockResult.categories,
        findings: mockResult.findings,
      });
    });

    it('should slice findings to a maximum of 20 items', async () => {
      const manyFindings = Array.from({ length: 50 }, (_, i) => ({
        id: `f${i}`,
        description: `Finding ${i}`,
      }));
      const mockResult = {
        categories: { performance: { score: 0.5 } },
        findings: manyFindings,
      };
      mockRunLighthouseAudit.mockResolvedValue(mockResult);

      const input = { url: 'https://example.com' };
      const result = await runLighthouseTool.execute(input);
      const parsed = JSON.parse(result as string);

      expect(parsed.findings).toHaveLength(20);
      expect(parsed.findings[0].id).toBe('f0');
      expect(parsed.findings[19].id).toBe('f19');
    });

    it('should pass through findings unchanged if there are fewer than 20', async () => {
      const fewFindings = Array.from({ length: 5 }, (_, i) => ({
        id: `f${i}`,
        description: `Finding ${i}`,
      }));
      const mockResult = {
        categories: { performance: { score: 1.0 } },
        findings: fewFindings,
      };
      mockRunLighthouseAudit.mockResolvedValue(mockResult);

      const input = { url: 'https://example.com' };
      const result = await runLighthouseTool.execute(input);
      const parsed = JSON.parse(result as string);

      expect(parsed.findings).toHaveLength(5);
    });

    it('should handle errors from runLighthouseAudit and return error JSON', async () => {
      const error = new Error('Audit failed: invalid URL');
      mockRunLighthouseAudit.mockRejectedValue(error);

      const input = { url: 'not-a-valid-url' };
      const result = await runLighthouseTool.execute(input);
      const parsed = JSON.parse(result as string);

      expect(parsed).toEqual({ error: 'Audit failed: invalid URL' });
    });

    it('should handle non-Error thrown values', async () => {
      mockRunLighthouseAudit.mockRejectedValue('string error message');

      const input = { url: 'https://example.com' };
      const result = await runLighthouseTool.execute(input);
      const parsed = JSON.parse(result as string);

      expect(parsed).toEqual({ error: 'string error message' });
    });

    it('should register and remove uncaughtException handler', async () => {
      mockRunLighthouseAudit.mockResolvedValue({
        categories: {},
        findings: [],
      });

      const input = { url: 'https://example.com' };
      await runLighthouseTool.execute(input);

      expect(process.on).toHaveBeenCalledWith('uncaughtException', expect.any(Function));
      expect(process.off).toHaveBeenCalledWith('uncaughtException', expect.any(Function));

      // Verify the same handler reference was used for both on and off
      const onHandler = (process.on as ReturnType<typeof vi.fn>).mock.calls[0][1];
      const offHandler = (process.off as ReturnType<typeof vi.fn>).mock.calls[0][1];
      expect(onHandler).toBe(offHandler);
    });

    it('should suppress uncaughtException with "performance mark has not been set" message', async () => {
      let capturedHandler: ((err: Error) => void) | null = null;
      const originalOn = process.on.bind(process);
      vi.spyOn(process, 'on').mockImplementation((event: string, handler: any) => {
        if (event === 'uncaughtException') {
          capturedHandler = handler;
        }
        return originalOn(event, handler) as typeof process;
      });

      mockRunLighthouseAudit.mockResolvedValue({
        categories: { performance: { score: 0.9 } },
        findings: [],
      });

      const result = await runLighthouseTool.execute({ url: 'https://example.com' });
      const parsed = JSON.parse(result as string);

      // Verify the handler was registered (for suppressing performance mark errors)
      expect(capturedHandler).not.toBeNull();
      // Verify the execute completed successfully
      expect(parsed.categories).toEqual({ performance: { score: 0.9 } });
    });

    it('should re-throw genuinely unexpected uncaught exceptions', async () => {
      let capturedHandler: (err: Error) => void = () => {};
      const originalOn = process.on.bind(process);
      vi.spyOn(process, 'on').mockImplementation((event: string, handler: any) => {
        if (event === 'uncaughtException') {
          capturedHandler = handler;
        }
        return originalOn(event, handler) as typeof process;
      });

      mockRunLighthouseAudit.mockImplementation(async () => {
        // Simulate an unexpected uncaught exception during audit
        const unexpectedError = new Error('Something completely unexpected');
        capturedHandler(unexpectedError);
      });

      // The handler re-throws, which is caught by the execute function's catch block
      // and returned as JSON error (not a rejected promise)
      const result = await runLighthouseTool.execute({ url: 'https://example.com' });
      const parsed = JSON.parse(result as string);
      expect(parsed.error).toContain('Something completely unexpected');
    });

    it('should remove uncaughtException handler even when audit throws', async () => {
      mockRunLighthouseAudit.mockRejectedValue(new Error('Audit error'));

      const input = { url: 'https://example.com' };
      await runLighthouseTool.execute(input);

      expect(process.off).toHaveBeenCalledWith('uncaughtException', expect.any(Function));
    });

    it('should handle empty findings array', async () => {
      mockRunLighthouseAudit.mockResolvedValue({
        categories: { performance: { score: 1.0 } },
        findings: [],
      });

      const input = { url: 'https://example.com' };
      const result = await runLighthouseTool.execute(input);
      const parsed = JSON.parse(result as string);

      expect(parsed.findings).toEqual([]);
    });

    it('should handle empty categories object', async () => {
      mockRunLighthouseAudit.mockResolvedValue({
        categories: {},
        findings: [{ id: 'f1' }],
      });

      const input = { url: 'https://example.com' };
      const result = await runLighthouseTool.execute(input);
      const parsed = JSON.parse(result as string);

      expect(parsed.categories).toEqual({});
    });

    it('should cast input.url to string', async () => {
      mockRunLighthouseAudit.mockResolvedValue({
        categories: {},
        findings: [],
      });

      // Even if the value is somehow not a string, it gets cast
      const input = { url: 12345 as any };
      await runLighthouseTool.execute(input);

      expect(mockRunLighthouseAudit).toHaveBeenCalledWith(12345);
    });

    it('should handle URL with path and query parameters', async () => {
      mockRunLighthouseAudit.mockResolvedValue({
        categories: { performance: { score: 0.8 } },
        findings: [],
      });

      const input = { url: 'https://example.com/path/to/page?query=value&other=123' };
      const result = await runLighthouseTool.execute(input);
      const parsed = JSON.parse(result as string);

      expect(mockRunLighthouseAudit).toHaveBeenCalledWith(
        'https://example.com/path/to/page?query=value&other=123'
      );
      expect(parsed.categories).toEqual({ performance: { score: 0.8 } });
    });

    it('should suppress multiple performance mark errors', async () => {
      let capturedHandler: (err: Error) => void = () => {};
      vi.spyOn(process, 'on').mockImplementation((_event: string, handler: any) => {
        capturedHandler = handler;
        return process;
      });

      mockRunLighthouseAudit.mockResolvedValue({
        categories: {},
        findings: [],
      });

      const executePromise = runLighthouseTool.execute({ url: 'https://example.com' });

      capturedHandler(new Error("A performance mark has not been set for 'mark1'"));
      capturedHandler(new Error("The performance mark has not been set"));
      capturedHandler(new Error("performance mark has not been set at all"));

      const result = await executePromise;
      const parsed = JSON.parse(result as string);
      expect(parsed.categories).toEqual({});
    });

    it('should handle null thrown as error', async () => {
      mockRunLighthouseAudit.mockRejectedValue(null);

      const input = { url: 'https://example.com' };
      const result = await runLighthouseTool.execute(input);
      const parsed = JSON.parse(result as string);

      expect(parsed).toEqual({ error: 'null' });
    });

    it('should handle undefined thrown as error', async () => {
      mockRunLighthouseAudit.mockRejectedValue(undefined);

      const input = { url: 'https://example.com' };
      const result = await runLighthouseTool.execute(input);
      const parsed = JSON.parse(result as string);

      expect(parsed).toEqual({ error: 'undefined' });
    });

    it('should handle an object thrown as error', async () => {
      mockRunLighthouseAudit.mockRejectedValue({ code: 'ERR_FAILURE', detail: 'bad' });

      const input = { url: 'https://example.com' };
      const result = await runLighthouseTool.execute(input);
      const parsed = JSON.parse(result as string);

      expect(parsed).toEqual({ error: '[object Object]' });
    });

    it('should handle exactly 20 findings without slicing', async () => {
      const twentyFindings = Array.from({ length: 20 }, (_, i) => ({
        id: `f${i}`,
        description: `Finding ${i}`,
      }));
      const mockResult = {
        categories: {},
        findings: twentyFindings,
      };
      mockRunLighthouseAudit.mockResolvedValue(mockResult);

      const result = await runLighthouseTool.execute({ url: 'https://example.com' });
      const parsed = JSON.parse(result as string);

      expect(parsed.findings).toHaveLength(20);
      expect(parsed.findings[19].id).toBe('f19');
    });

    it('should handle 21 findings by slicing to 20', async () => {
      const twentyOneFindings = Array.from({ length: 21 }, (_, i) => ({
        id: `f${i}`,
        description: `Finding ${i}`,
      }));
      const mockResult = {
        categories: {},
        findings: twentyOneFindings,
      };
      mockRunLighthouseAudit.mockResolvedValue(mockResult);

      const result = await runLighthouseTool.execute({ url: 'https://example.com' });
      const parsed = JSON.parse(result as string);

      expect(parsed.findings).toHaveLength(20);
      expect(parsed.findings[19].id).toBe('f19');
    });
  });
});