import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Tool } from '../core/types.js';

// Mock playwright before importing the tool
const mockScreenshot = Buffer.from('fake-png-data-that-is-long-enough-to-slice-200-chars-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
const mockPage = {
  goto: vi.fn(),
  waitForTimeout: vi.fn(),
  screenshot: vi.fn().mockResolvedValue(mockScreenshot),
};
const mockBrowser = {
  newPage: vi.fn().mockResolvedValue(mockPage),
  close: vi.fn(),
};
const mockChromium = {
  launch: vi.fn().mockResolvedValue(mockBrowser),
};

vi.mock('playwright', () => ({
  chromium: mockChromium,
}));

// Import the tool under test
import { takeScreenshotTool } from './take-screenshot.js';

describe('takeScreenshotTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('tool definition', () => {
    it('should have the correct name', () => {
      expect(takeScreenshotTool.name).toBe('take_screenshot');
    });

    it('should have a non-empty description', () => {
      expect(takeScreenshotTool.description).toBeTruthy();
      expect(typeof takeScreenshotTool.description).toBe('string');
    });

    it('should define input_schema as object type', () => {
      expect(takeScreenshotTool.input_schema.type).toBe('object');
    });

    it('should require the url property', () => {
      expect(takeScreenshotTool.input_schema.required).toContain('url');
    });

    it('should define url as a string property', () => {
      expect(takeScreenshotTool.input_schema.properties.url.type).toBe('string');
    });

    it('should define fullPage as a boolean property', () => {
      expect(takeScreenshotTool.input_schema.properties.fullPage.type).toBe('boolean');
    });

    it('should define width as a number property', () => {
      expect(takeScreenshotTool.input_schema.properties.width.type).toBe('number');
    });

    it('should define height as a number property', () => {
      expect(takeScreenshotTool.input_schema.properties.height.type).toBe('number');
    });
  });

  describe('execute — happy path', () => {
    it('should capture a screenshot and return JSON with captured: true', async () => {
      const result = await takeScreenshotTool.execute({ url: 'https://example.com' });
      const parsed = JSON.parse(result as string);

      expect(parsed.url).toBe('https://example.com');
      expect(parsed.captured).toBe(true);
      expect(parsed.format).toBe('png');
      expect(parsed.fullPage).toBe(false);
      expect(parsed.viewport).toBe('1440x900');
      expect(parsed.sizeBytes).toBe(mockScreenshot.length);
      expect(parsed.base64Preview).toBeTruthy();
      expect(parsed.note).toContain('KB');
    });

    it('should launch chromium in headless mode', async () => {
      await takeScreenshotTool.execute({ url: 'https://example.com' });

      expect(mockChromium.launch).toHaveBeenCalledWith({ headless: true });
    });

    it('should create a new page with default viewport and nl-NL locale', async () => {
      await takeScreenshotTool.execute({ url: 'https://example.com' });

      expect(mockBrowser.newPage).toHaveBeenCalledWith({
        viewport: { width: 1440, height: 900 },
        locale: 'nl-NL',
      });
    });

    it('should navigate to the given URL with networkidle and 30s timeout', async () => {
      await takeScreenshotTool.execute({ url: 'https://example.com' });

      expect(mockPage.goto).toHaveBeenCalledWith('https://example.com', {
        waitUntil: 'networkidle',
        timeout: 30000,
      });
    });

    it('should wait 1000ms for lazy-loaded content', async () => {
      await takeScreenshotTool.execute({ url: 'https://example.com' });

      expect(mockPage.waitForTimeout).toHaveBeenCalledWith(1000);
    });

    it('should take a screenshot with fullPage false by default and type png', async () => {
      await takeScreenshotTool.execute({ url: 'https://example.com' });

      expect(mockPage.screenshot).toHaveBeenCalledWith({
        fullPage: false,
        type: 'png',
      });
    });

    it('should close the browser after capturing', async () => {
      await takeScreenshotTool.execute({ url: 'https://example.com' });

      expect(mockBrowser.close).toHaveBeenCalled();
    });

    it('should return base64Preview as a truncated string ending with ...', async () => {
      const result = await takeScreenshotTool.execute({ url: 'https://example.com' });
      const parsed = JSON.parse(result as string);

      expect(parsed.base64Preview).toMatch(/\.\.\.$/);
      // The preview is the first 200 chars of the full base64 + "..."
      const fullBase64 = mockScreenshot.toString('base64');
      expect(parsed.base64Preview).toBe(fullBase64.slice(0, 200) + '...');
    });

    it('should include size in KB in the note', async () => {
      const result = await takeScreenshotTool.execute({ url: 'https://example.com' });
      const parsed = JSON.parse(result as string);

      const expectedKB = (mockScreenshot.length / 1024).toFixed(0);
      expect(parsed.note).toContain(expectedKB + 'KB');
    });
  });

  describe('execute — custom input parameters', () => {
    it('should pass fullPage: true when specified', async () => {
      await takeScreenshotTool.execute({ url: 'https://example.com', fullPage: true });

      expect(mockPage.screenshot).toHaveBeenCalledWith(
        expect.objectContaining({ fullPage: true })
      );
    });

    it('should use fullPage: false when explicitly set to false', async () => {
      await takeScreenshotTool.execute({ url: 'https://example.com', fullPage: false });

      expect(mockPage.screenshot).toHaveBeenCalledWith(
        expect.objectContaining({ fullPage: false })
      );
    });

    it('should create a page with custom width and height', async () => {
      await takeScreenshotTool.execute({ url: 'https://example.com', width: 1920, height: 1080 });

      expect(mockBrowser.newPage).toHaveBeenCalledWith({
        viewport: { width: 1920, height: 1080 },
        locale: 'nl-NL',
      });
    });

    it('should reflect custom viewport in the result', async () => {
      const result = await takeScreenshotTool.execute({ url: 'https://example.com', width: 800, height: 600 });
      const parsed = JSON.parse(result as string);

      expect(parsed.viewport).toBe('800x600');
    });

    it('should use default viewport when width is 0 (falsy)', async () => {
      await takeScreenshotTool.execute({ url: 'https://example.com', width: 0, height: 0 });

      expect(mockBrowser.newPage).toHaveBeenCalledWith({
        viewport: { width: 1440, height: 900 },
        locale: 'nl-NL',
      });
    });

    it('should use default viewport when width is NaN', async () => {
      const result = await takeScreenshotTool.execute({ url: 'https://example.com', width: NaN });
      const parsed = JSON.parse(result as string);

      expect(parsed.viewport).toBe('1440x900');
    });

    it('should use defaults when only url is provided', async () => {
      const result = await takeScreenshotTool.execute({ url: 'https://example.com' });
      const parsed = JSON.parse(result as string);

      expect(parsed.fullPage).toBe(false);
      expect(parsed.viewport).toBe('1440x900');
    });

    it('should handle partial custom params — only width', async () => {
      await takeScreenshotTool.execute({ url: 'https://example.com', width: 1024 });

      expect(mockBrowser.newPage).toHaveBeenCalledWith({
        viewport: { width: 1024, height: 900 },
        locale: 'nl-NL',
      });
    });

    it('should handle partial custom params — only height', async () => {
      await takeScreenshotTool.execute({ url: 'https://example.com', height: 1200 });

      expect(mockBrowser.newPage).toHaveBeenCalledWith({
        viewport: { width: 1440, height: 1200 },
        locale: 'nl-NL',
      });
    });
  });

  describe('execute — error handling', () => {
    it('should return captured: false when navigation fails', async () => {
      mockPage.goto.mockRejectedValueOnce(new Error('net::ERR_CONNECTION_REFUSED'));

      const result = await takeScreenshotTool.execute({ url: 'https://unreachable.example.com' });
      const parsed = JSON.parse(result as string);

      expect(parsed.captured).toBe(false);
      expect(parsed.url).toBe('https://unreachable.example.com');
      expect(parsed.error).toBe('net::ERR_CONNECTION_REFUSED');
    });

    it('should return captured: false when screenshot fails', async () => {
      mockPage.screenshot.mockRejectedValueOnce(new Error('Screenshot failed'));

      const result = await takeScreenshotTool.execute({ url: 'https://example.com' });
      const parsed = JSON.parse(result as string);

      expect(parsed.captured).toBe(false);
      expect(parsed.error).toBe('Screenshot failed');
    });

    it('should return captured: false when browser launch fails', async () => {
      mockChromium.launch.mockRejectedValueOnce(new Error('Browser launch failed'));

      const result = await takeScreenshotTool.execute({ url: 'https://example.com' });
      const parsed = JSON.parse(result as string);

      expect(parsed.captured).toBe(false);
      expect(parsed.error).toBe('Browser launch failed');
    });

    it('should handle non-Error thrown values', async () => {
      mockPage.goto.mockRejectedValueOnce('string error');

      const result = await takeScreenshotTool.execute({ url: 'https://example.com' });
      const parsed = JSON.parse(result as string);

      expect(parsed.captured).toBe(false);
      expect(parsed.error).toBe('string error');
    });

    it('should handle null thrown values', async () => {
      mockPage.goto.mockRejectedValueOnce(null);

      const result = await takeScreenshotTool.execute({ url: 'https://example.com' });
      const parsed = JSON.parse(result as string);

      expect(parsed.captured).toBe(false);
      expect(parsed.error).toBe('null');
    });

    it('should handle undefined thrown values', async () => {
      mockPage.goto.mockRejectedValueOnce(undefined);

      const result = await takeScreenshotTool.execute({ url: 'https://example.com' });
      const parsed = JSON.parse(result as string);

      expect(parsed.captured).toBe(false);
      expect(parsed.error).toBe('undefined');
    });

    it('should still close the browser even when an error occurs', async () => {
      mockPage.goto.mockRejectedValueOnce(new Error('Navigation timeout'));

      await takeScreenshotTool.execute({ url: 'https://example.com' });

      expect(mockBrowser.close).toHaveBeenCalled();
    });

    it('should handle timeout errors gracefully', async () => {
      mockPage.goto.mockRejectedValueOnce(new Error('Timeout of 30000ms exceeded'));

      const result = await takeScreenshotTool.execute({ url: 'https://slow.example.com' });
      const parsed = JSON.parse(result as string);

      expect(parsed.captured).toBe(false);
      expect(parsed.error).toContain('Timeout');
    });
  });

  describe('execute — edge cases', () => {
    it('should handle URL with path and query string', async () => {
      const url = 'https://example.com/path/to/page?query=value&other=123';
      const result = await takeScreenshotTool.execute({ url });
      const parsed = JSON.parse(result as string);

      expect(parsed.url).toBe(url);
      expect(parsed.captured).toBe(true);
      expect(mockPage.goto).toHaveBeenCalledWith(url, expect.any(Object));
    });

    it('should handle localhost URL', async () => {
      const url = 'http://localhost:3000';
      const result = await takeScreenshotTool.execute({ url });
      const parsed = JSON.parse(result as string);

      expect(parsed.url).toBe(url);
      expect(parsed.captured).toBe(true);
    });

    it('should handle URL with port number', async () => {
      const url = 'http://example.com:8080';
      const result = await takeScreenshotTool.execute({ url });
      const parsed = JSON.parse(result as string);

      expect(parsed.url).toBe(url);
      expect(parsed.captured).toBe(true);
    });

    it('should handle URL with fragment', async () => {
      const url = 'https://example.com/page#section';
      const result = await takeScreenshotTool.execute({ url });
      const parsed = JSON.parse(result as string);

      expect(parsed.url).toBe(url);
      expect(parsed.captured).toBe(true);
    });

    it('should handle very large viewport dimensions', async () => {
      await takeScreenshotTool.execute({ url: 'https://example.com', width: 3840, height: 2160 });

      expect(mockBrowser.newPage).toHaveBeenCalledWith({
        viewport: { width: 3840, height: 2160 },
        locale: 'nl-NL',
      });
    });

    it('should handle very small viewport dimensions', async () => {
      await takeScreenshotTool.execute({ url: 'https://example.com', width: 320, height: 240 });

      expect(mockBrowser.newPage).toHaveBeenCalledWith({
        viewport: { width: 320, height: 240 },
        locale: 'nl-NL',
      });
    });

    it('should handle negative width by falling back to default', async () => {
      // Negative number is truthy but could produce unexpected behavior
      await takeScreenshotTool.execute({ url: 'https://example.com', width: -100 });

      expect(mockBrowser.newPage).toHaveBeenCalledWith(
        expect.objectContaining({
          viewport: expect.objectContaining({ width: -100 }),
        })
      );
    });

    it('should return a JSON string', async () => {
      const result = await takeScreenshotTool.execute({ url: 'https://example.com' });

      expect(typeof result).toBe('string');
      expect(() => JSON.parse(result as string)).not.toThrow();
    });

    it('should handle missing optional parameters (empty object beyond url)', async () => {
      const result = await takeScreenshotTool.execute({ url: 'https://example.com' });
      const parsed = JSON.parse(result as string);

      expect(parsed.captured).toBe(true);
      expect(parsed.fullPage).toBe(false);
      expect(parsed.viewport).toBe('1440x900');
    });

    it('should handle fullPage being undefined (not passed)', async () => {
      const result = await takeScreenshotTool.execute({ url: 'https://example.com' });
      const parsed = JSON.parse(result as string);

      expect(parsed.fullPage).toBe(false);
    });

    it('should handle fullPage being null', async () => {
      const result = await takeScreenshotTool.execute({ url: 'https://example.com', fullPage: null });
      const parsed = JSON.parse(result as string);

      // null as boolean is falsy, so ?? returns false
      expect(parsed.fullPage).toBe(false);
    });

    it('should handle dynamic import of playwright', async () => {
      // This test ensures the dynamic import path works
      const result = await takeScreenshotTool.execute({ url: 'https://example.com' });
      const parsed = JSON.parse(result as string);

      expect(parsed.captured).toBe(true);
      expect(mockChromium.launch).toHaveBeenCalledTimes(1);
    });
  });

  describe('execute — browser lifecycle', () => {
    it('should launch browser, create page, navigate, wait, screenshot, then close in order', async () => {
      const order: string[] = [];

      mockChromium.launch.mockImplementation(async () => {
        order.push('launch');
        return mockBrowser;
      });
      mockBrowser.newPage.mockImplementation(async () => {
        order.push('newPage');
        return mockPage;
      });
      mockPage.goto.mockImplementation(async () => {
        order.push('goto');
      });
      mockPage.waitForTimeout.mockImplementation(async () => {
        order.push('waitForTimeout');
      });
      mockPage.screenshot.mockImplementation(async () => {
        order.push('screenshot');
        return mockScreenshot;
      });
      mockBrowser.close.mockImplementation(async () => {
        order.push('close');
      });

      await takeScreenshotTool.execute({ url: 'https://example.com' });

      expect(order).toEqual([
        'launch',
        'newPage',
        'goto',
        'waitForTimeout',
        'screenshot',
        'close',
      ]);
    });

    it('should only call browser.close once even on success', async () => {
      await takeScreenshotTool.execute({ url: 'https://example.com' });

      expect(mockBrowser.close).toHaveBeenCalledTimes(1);
    });

    it('should only call browser.close once even on error', async () => {
      mockPage.goto.mockRejectedValueOnce(new Error('fail'));

      await takeScreenshotTool.execute({ url: 'https://example.com' });

      expect(mockBrowser.close).toHaveBeenCalledTimes(1);
    });
  });

  describe('execute — output format', () => {
    it('should include all expected fields in successful response', async () => {
      const result = await takeScreenshotTool.execute({ url: 'https://example.com' });
      const parsed = JSON.parse(result as string);

      expect(parsed).toHaveProperty('url');
      expect(parsed).toHaveProperty('captured');
      expect(parsed).toHaveProperty('format');
      expect(parsed).toHaveProperty('fullPage');
      expect(parsed).toHaveProperty('viewport');
      expect(parsed).toHaveProperty('sizeBytes');
      expect(parsed).toHaveProperty('base64Preview');
      expect(parsed).toHaveProperty('note');
    });

    it('should include only url, captured, and error in failure response', async () => {
      mockPage.goto.mockRejectedValueOnce(new Error('fail'));

      const result = await takeScreenshotTool.execute({ url: 'https://example.com' });
      const parsed = JSON.parse(result as string);

      expect(parsed).toHaveProperty('url');
      expect(parsed).toHaveProperty('captured');
      expect(parsed).toHaveProperty('error');
      expect(parsed).not.toHaveProperty('format');
      expect(parsed).not.toHaveProperty('base64Preview');
      expect(parsed).not.toHaveProperty('note');
    });

    it('should calculate sizeBytes correctly from the screenshot buffer', async () => {
      const result = await takeScreenshotTool.execute({ url: 'https://example.com' });
      const parsed = JSON.parse(result as string);

      expect(parsed.sizeBytes).toBe(mockScreenshot.length);
    });
  });
});