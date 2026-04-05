import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkMobileFriendlyTool } from './check-mobile-friendly.js';

// --- Mocks ---
const mockViewportMetaGetAttribute = vi.fn();
const mockPageEvaluate = vi.fn();
const mockPageScreenshot = vi.fn();
const mockPageGoto = vi.fn();
const mockPageWaitForTimeout = vi.fn();
const mockPageClose = vi.fn();
const mockNewPage = vi.fn();
const mockBrowserClose = vi.fn();
const mockBrowserLaunch = vi.fn();

vi.mock('playwright', () => ({
  chromium: {
    launch: mockBrowserLaunch,
  },
}));

// Helper to generate a base64 string of a specific length
const generateBase64String = (length: number) => {
  const base64CharLength = Math.ceil(length / 2) * 2; // Ensure no padding issues for simplistic mock
  return Buffer.alloc(base64CharLength, 'a').toString('base64').slice(0, length);
}

beforeEach(() => {
  vi.clearAllMocks();
  
  // Default mock implementations
  mockBrowserLaunch.mockResolvedValue({
    newPage: mockNewPage,
    close: mockBrowserClose,
  });

  mockNewPage.mockResolvedValue({
    goto: mockPageGoto,
    waitForTimeout: mockPageWaitForTimeout,
    locator: () => ({
      getAttribute: mockViewportMetaGetAttribute,
    }),
    evaluate: mockPageEvaluate,
    screenshot: mockPageScreenshot,
    close: mockPageClose,
  });

  mockPageGoto.mockResolvedValue({});
  mockPageWaitForTimeout.mockResolvedValue({});
  mockPageClose.mockResolvedValue({});
  mockBrowserClose.mockResolvedValue({});
});

describe('checkMobileFriendlyTool', () => {
  it('should expose correct tool name, description, and schema', () => {
    expect(checkMobileFriendlyTool.name).toBe('check_mobile_friendly');
    expect(checkMobileFriendlyTool.description).toContain('Check if a website is mobile-friendly');
    expect(checkMobileFriendlyTool.input_schema.required).toEqual(['url']);
    expect(checkMobileFriendlyTool.input_schema.properties.url.type).toBe('string');
  });

  describe('execute', () => {
    it('should return a perfect score of 100 if all checks pass', async () => {
      // Perfect mobile pass
      mockPageScreenshot.mockResolvedValueOnce(Buffer.from('mobile_screenshot_data'));
      mockViewportMetaGetAttribute.mockResolvedValueOnce('width=device-width, initial-scale=1.0');
      mockPageEvaluate
        .mockResolvedValueOnce(false) // horizontalScroll
        .mockResolvedValueOnce(0)     // tinyTextFound
        .mockResolvedValueOnce(0);    // tapTargetIssues
        
      // Desktop pass
      mockPageScreenshot.mockResolvedValueOnce(Buffer.from('desktop_screenshot_data'));

      const result = await checkMobileFriendlyTool.execute({ url: 'https://perfect-responsive.com' });
      const parsed = JSON.parse(result as string);

      expect(parsed.url).toBe('https://perfect-responsive.com');
      expect(parsed.score).toBe(100);
      expect(parsed.viewportMeta).toBe(true);
      expect(parsed.horizontalScroll).toBe(false);
      expect(parsed.tinyTextCount).toBe(0);
      expect(parsed.smallTapTargets).toBe(0);
      expect(parsed.issues).toEqual([]);
      expect(parsed.screenshotMobile).toContain('...'); // truncated
      expect(parsed.screenshotDesktop).toContain('...');
      
      // Assertions on mock calls
      expect(mockBrowserLaunch).toHaveBeenCalledWith({ headless: true });
      expect(mockNewPage).toHaveBeenCalledTimes(2); // Mobile then Desktop
      expect(mockPageGoto).toHaveBeenCalledWith('https://perfect-responsive.com', expect.any(Object));
      expect(mockBrowserClose).toHaveBeenCalledOnce();
    });

    it('should return score 0 and issues if all checks fail', async () => {
      mockPageScreenshot.mockResolvedValueOnce(Buffer.from('mobile_screenshot_data'));
      mockViewportMetaGetAttribute.mockResolvedValueOnce(null); // No viewport meta
      mockPageEvaluate
        .mockResolvedValueOnce(true) // horizontalScroll
        .mockResolvedValueOnce(15)   // tinyTextFound
        .mockResolvedValueOnce(8);   // tapTargetIssues
        
      mockPageScreenshot.mockResolvedValueOnce(Buffer.from('desktop_screenshot_data'));

      const result = await checkMobileFriendlyTool.execute({ url: 'https://not-responsive.com' });
      const parsed = JSON.parse(result as string);

      expect(parsed.score).toBe(0);
      expect(parsed.viewportMeta).toBe(false);
      expect(parsed.horizontalScroll).toBe(true);
      expect(parsed.tinyTextCount).toBe(15);
      expect(parsed.smallTapTargets).toBe(8);
      expect(parsed.issues).toHaveLength(4);
      expect(parsed.issues).toContain('Missing viewport meta tag with width=device-width');
      expect(parsed.issues).toContain('Page has horizontal scrolling on mobile viewport');
      expect(parsed.issues).toContain('Found 15 text elements with font-size below 12px');
      expect(parsed.issues).toContain('Found 8 tap targets smaller than 48x48px');
    });

    it('should handle partial scores (e.g., viewport meta but horizontal scroll)', async () => {
      mockPageScreenshot.mockResolvedValueOnce(Buffer.from('mobile_screenshot_data'));
      mockViewportMetaGetAttribute.mockResolvedValueOnce('width=device-width');
      mockPageEvaluate
        .mockResolvedValueOnce(true) // horizontalScroll
        .mockResolvedValueOnce(0)    // tinyTextFound
        .mockResolvedValueOnce(0);   // tapTargetIssues
        
      mockPageScreenshot.mockResolvedValueOnce(Buffer.from('desktop_screenshot_data'));

      const result = await checkMobileFriendlyTool.execute({ url: 'https://partial.com' });
      const parsed = JSON.parse(result as string);

      // +30 for viewportMeta, +0 for horizontal scroll, +20 for tiny text, +20 for tap targets = 70
      expect(parsed.score).toBe(70);
      expect(parsed.issues).toHaveLength(1);
      expect(parsed.issues[0]).toContain('horizontal scrolling');
    });

    it('should mark viewportMeta as false if getAttribute throws', async () => {
      mockPageScreenshot.mockResolvedValueOnce(Buffer.from('mobile_screenshot_data'));
      mockViewportMetaGetAttribute.mockRejectedValueOnce(new Error('Element not found'));
      mockPageEvaluate
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
        
      mockPageScreenshot.mockResolvedValueOnce(Buffer.from('desktop_screenshot_data'));

      const result = await checkMobileFriendlyTool.execute({ url: 'https://error-meta.com' });
      const parsed = JSON.parse(result as string);

      expect(parsed.viewportMeta).toBe(false);
      expect(parsed.score).toBe(70); // Misses the 30 for viewport meta
    });

    it('should mark viewportMeta as false if content does not include width=device-width', async () => {
      mockPageScreenshot.mockResolvedValueOnce(Buffer.from('mobile_screenshot_data'));
      mockViewportMetaGetAttribute.mockResolvedValueOnce('width=1024');
      mockPageEvaluate.mockResolvedValueOnce(false).mockResolvedValueOnce(0).mockResolvedValueOnce(0);
      mockPageScreenshot.mockResolvedValueOnce(Buffer.from('desktop_screenshot_data'));

      const result = await checkMobileFriendlyTool.execute({ url: 'https://fixed-width.com' });
      const parsed = JSON.parse(result as string);

      expect(parsed.viewportMeta).toBe(false);
      expect(parsed.score).toBe(70);
    });

    it('should configure the mobile page with specific iPhone X user agent and touch settings', async () => {
      mockPageScreenshot.mockResolvedValueOnce(Buffer.from('mobile_screenshot_data'));
      mockViewportMetaGetAttribute.mockResolvedValueOnce('width=device-width');
      mockPageEvaluate.mockResolvedValueOnce(false).mockResolvedValueOnce(0).mockResolvedValueOnce(0);
      mockPageScreenshot.mockResolvedValueOnce(Buffer.from('desktop_screenshot_data'));

      await checkMobileFriendlyTool.execute({ url: 'https://test.com' });

      expect(mockNewPage).toHaveBeenNthCalledWith(1, {
        viewport: { width: 375, height: 812 },
        isMobile: true,
        hasTouch: true,
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
        locale: "nl-NL",
      });
    });

    it('should configure the desktop page with standard viewport and locale', async () => {
      mockPageScreenshot.mockResolvedValueOnce(Buffer.from('mobile_screenshot_data'));
      mockViewportMetaGetAttribute.mockResolvedValueOnce('width=device-width');
      mockPageEvaluate.mockResolvedValueOnce(false).mockResolvedValueOnce(0).mockResolvedValueOnce(0);
      mockPageScreenshot.mockResolvedValueOnce(Buffer.from('desktop_screenshot_data'));

      await checkMobileFriendlyTool.execute({ url: 'https://test.com' });

      expect(mockNewPage).toHaveBeenNthCalledWith(2, {
        viewport: { width: 1280, height: 720 },
        locale: "nl-NL",
      });
    });

    it('should handle browser launch failure gracefully', async () => {
      const launchError = new Error('Failed to launch browser');
      mockBrowserLaunch.mockRejectedValueOnce(launchError);

      const result = await checkMobileFriendlyTool.execute({ url: 'https://fail.com' });
      const parsed = JSON.parse(result as string);

      expect(parsed.score).toBe(0);
      expect(parsed.url).toBe('https://fail.com');
      expect(parsed.error).toBe('Failed to launch browser');
      expect(mockBrowserClose).not.toHaveBeenCalled();
    });

    it('should handle navigation failure gracefully and close browser', async () => {
      const navError = new Error('Navigation timeout');
      mockPageGoto.mockRejectedValueOnce(navError);

      const result = await checkMobileFriendlyTool.execute({ url: 'https://unreachable.com' });
      const parsed = JSON.parse(result as string);

      expect(parsed.score).toBe(0);
      expect(parsed.url).toBe('https://unreachable.com');
      expect(parsed.error).toBe('Navigation timeout');
      
      // Ensure finally block runs and closes browser
      expect(mockBrowserClose).toHaveBeenCalled();
    });

    it('should handle non-Error exceptions in catch block', async () => {
      mockBrowserLaunch.mockRejectedValueOnce('String error instead of Error object');

      const result = await checkMobileFriendlyTool.execute({ url: 'https://weird-error.com' });
      const parsed = JSON.parse(result as string);

      expect(parsed.score).toBe(0);
      expect(parsed.error).toBe('String error instead of Error object');
    });
  });
});