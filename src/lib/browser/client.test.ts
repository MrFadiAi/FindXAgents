import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

// Mock playwright
vi.mock('playwright', () => ({
  chromium: {
    connectOverCDP: vi.fn(),
    launch: vi.fn(),
  },
}));

// Import the mocked functions for typing
const mockedConnectOverCDP = vi.mocked(chromium.connectOverCDP);
const mockedLaunch = vi.mocked(chromium.launch);

// Helper to mock a chainable Playwright browser context/page
const createMockPage = (overrides: Partial<Page> = {}): Partial<Page> => ({
  goto: vi.fn().mockResolvedValue(undefined),
  content: vi.fn().mockResolvedValue('<html><body>Mocked Content</body></html>'),
  url: vi.fn().mockReturnValue('http://mocked-final.url'),
  close: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

const createMockContext = (overrides: Partial<BrowserContext> = {}): Partial<BrowserContext> => ({
  newPage: vi.fn().mockResolvedValue(createMockPage()),
  close: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

const createMockBrowser = (overrides: Partial<Browser> = {}): Partial<Browser> => ({
  newContext: vi.fn().mockResolvedValue(createMockContext()),
  close: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

describe('Browser Client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Dynamically import the module to reset cached module state (like lightpandaAvailable) between describe blocks
  let client: typeof import('./client');

  describe('isLightpandaAvailable (internal caching logic)', () => {
    beforeEach(async () => {
      // Reset module cache for clean internal state
      vi.resetModules();
      client = await import('./client');
    });

    it('should return true and cache the result if Lightpanda connects successfully', async () => {
      mockedConnectOverCDP.mockResolvedValue(createMockBrowser() as Browser);

      // First check
      const result1 = await client.getLightpandaStatus();
      expect(result1.available).toBe(true);
      expect(mockedConnectOverCDP).toHaveBeenCalledTimes(1);

      // Second check - should use cache
      const result2 = await client.getLightpandaStatus();
      expect(result2.available).toBe(true);
      expect(mockedConnectOverCDP).toHaveBeenCalledTimes(1); // Not called again
    });

    it('should return false and cache the result for 60 seconds if Lightpanda fails', async () => {
      mockedConnectOverCDP.mockRejectedValue(new Error('Connection refused'));

      const result1 = await client.getLightpandaStatus();
      expect(result1.available).toBe(false);
      expect(mockedConnectOverCDP).toHaveBeenCalledTimes(1);

      // Second check within 60s - should use cache
      vi.advanceTimersByTime(30_000);
      const result2 = await client.getLightpandaStatus();
      expect(result2.available).toBe(false);
      expect(mockedConnectOverCDP).toHaveBeenCalledTimes(1); // Not called again
    });

    it('should re-check availability after 60 seconds if previously unavailable', async () => {
      mockedConnectOverCDP.mockRejectedValue(new Error('Connection refused'));

      const result1 = await client.getLightpandaStatus();
      expect(result1.available).toBe(false);
      expect(mockedConnectOverCDP).toHaveBeenCalledTimes(1);

      // Advance time past the 60s CHECK_INTERVAL
      vi.advanceTimersByTime(61_000);

      // Mock as available now
      mockedConnectOverCDP.mockResolvedValue(createMockBrowser() as Browser);

      const result2 = await client.getLightpandaStatus();
      expect(result2.available).toBe(true);
      expect(mockedConnectOverCDP).toHaveBeenCalledTimes(2); // Re-checked
    });
  });

  describe('renderPage', () => {
    beforeEach(async () => {
      vi.resetModules();
      client = await import('./client');
    });

    it('should use Lightpanda and return html/finalUrl if available', async () => {
      const mockPage = createMockPage();
      const mockCtx = createMockContext({ newPage: vi.fn().mockResolvedValue(mockPage) });
      const mockBrowser = createMockBrowser({ newContext: vi.fn().mockResolvedValue(mockCtx) });
      
      // Mock the availability check to succeed
      mockedConnectOverCDP.mockResolvedValueOnce(mockBrowser as Browser);
      // Mock the actual connection to succeed
      mockedConnectOverCDP.mockResolvedValueOnce(mockBrowser as Browser);

      const result = await client.renderPage('http://example.com', 10_000);

      expect(result).toEqual({
        html: '<html><body>Mocked Content</body></html>',
        finalUrl: 'http://mocked-final.url',
        browserType: 'lightpanda',
      });

      expect(mockPage.goto).toHaveBeenCalledWith('http://example.com', {
        waitUntil: 'networkidle',
        timeout: 10_000,
      });
      expect(mockPage.close).toHaveBeenCalled();
      expect(mockCtx.close).toHaveBeenCalled();
      // Browser.close was called once by the availability check, not by renderPage
      expect(mockBrowser.close).toHaveBeenCalledTimes(1);
    });

    it('should fallback to Chromium if Lightpanda is unavailable', async () => {
      // Mock availability check to fail
      mockedConnectOverCDP.mockRejectedValueOnce(new Error('Connection refused'));

      const mockChromiumPage = createMockPage();
      const mockChromiumCtx = createMockContext({ newPage: vi.fn().mockResolvedValue(mockChromiumPage) });
      const mockChromiumBrowser = createMockBrowser({ newContext: vi.fn().mockResolvedValue(mockChromiumCtx) });
      
      mockedLaunch.mockResolvedValue(mockChromiumBrowser as Browser);

      const result = await client.renderPage('http://example.com');

      expect(result.browserType).toBe('chromium');
      expect(result.html).toBe('<html><body>Mocked Content</body></html>');
      
      expect(mockedLaunch).toHaveBeenCalledWith({ headless: true });
      expect(mockChromiumPage.goto).toHaveBeenCalledWith('http://example.com', {
        waitUntil: 'networkidle',
        timeout: 15_000, // Default timeout
      });
      expect(mockChromiumPage.close).toHaveBeenCalled();
      expect(mockChromiumCtx.close).toHaveBeenCalled();
      expect(mockChromiumBrowser.close).toHaveBeenCalled();
    });

    it('should fallback to Chromium if Lightpanda is available but page rendering fails', async () => {
      // Mock availability check to succeed
      const mockLpBrowser = createMockBrowser();
      mockedConnectOverCDP.mockResolvedValueOnce(mockLpBrowser as Browser);

      // Mock actual connection to succeed
      mockedConnectOverCDP.mockResolvedValueOnce(mockLpBrowser as Browser);
      
      // Mock rendering to fail on Lightpanda
      const mockLpPage = createMockPage({ goto: vi.fn().mockRejectedValue(new Error('Timeout')) });
      const mockLpCtx = createMockContext({ newPage: vi.fn().mockResolvedValue(mockLpPage) });
      mockLpBrowser.newContext = vi.fn().mockResolvedValue(mockLpCtx);

      // Mock Chromium fallback
      const mockChromiumPage = createMockPage();
      const mockChromiumCtx = createMockContext({ newPage: vi.fn().mockResolvedValue(mockChromiumPage) });
      const mockChromiumBrowser = createMockBrowser({ newContext: vi.fn().mockResolvedValue(mockChromiumCtx) });
      mockedLaunch.mockResolvedValue(mockChromiumBrowser as Browser);

      const result = await client.renderPage('http://example.com');

      expect(result.browserType).toBe('chromium');
      expect(mockedLaunch).toHaveBeenCalled();
      expect(mockChromiumBrowser.close).toHaveBeenCalled();
    });

    it('should throw an error if both Lightpanda and Chromium fail', async () => {
      // Mock Lightpanda unavailable
      mockedConnectOverCDP.mockRejectedValue(new Error('Connection refused'));
      // Mock Chromium failing to launch
      mockedLaunch.mockRejectedValue(new Error('Out of memory'));

      await expect(client.renderPage('http://example.com')).rejects.toThrow('Out of memory');
    });

    it('should force close Chromium browser in the "finally" block even if context/page interaction fails', async () => {
      mockedConnectOverCDP.mockRejectedValue(new Error('Connection refused'));

      const mockChromiumBrowser = createMockBrowser();
      const mockChromiumCtx = createMockContext();
      const mockChromiumPage = createMockPage({ content: vi.fn().mockRejectedValue(new Error('Render Error')) });
      
      mockChromiumBrowser.newContext = vi.fn().mockResolvedValue(mockChromiumCtx);
      mockChromiumCtx.newPage = vi.fn().mockResolvedValue(mockChromiumPage);
      mockedLaunch.mockResolvedValue(mockChromiumBrowser as Browser);

      await expect(client.renderPage('http://example.com')).rejects.toThrow('Render Error');

      // Ensure the browser was still closed during the cleanup phase
      expect(mockChromiumBrowser.close).toHaveBeenCalled();
    });
  });

  describe('getBrowserHandle', () => {
    beforeEach(async () => {
      vi.resetModules();
      client = await import('./client');
    });

    it('should return a Lightpanda handle with a working page if available', async () => {
      const mockPage = createMockPage();
      const mockCtx = createMockContext({ newPage: vi.fn().mockResolvedValue(mockPage) });
      const mockBrowser = createMockBrowser({ newContext: vi.fn().mockResolvedValue(mockCtx) });

      mockedConnectOverCDP.mockResolvedValueOnce(mockBrowser as Browser); // check
      mockedConnectOverCDP.mockResolvedValueOnce(mockBrowser as Browser); // connect

      const handle = await client.getBrowserHandle();

      expect(handle.browserType).toBe('lightpanda');
      expect(handle.page).toBe(mockPage);
      expect(handle.context).toBe(mockCtx);
      
      // Check that custom close functions gracefully catch errors and omit browser close
      await handle.close();
      expect(mockPage.close).toHaveBeenCalled();
      expect(mockCtx.close).toHaveBeenCalled();
      // Browser.close was called once by the availability check, not by handle.close
      expect(mockBrowser.close).toHaveBeenCalledTimes(1);
    });

    it('should return a Chromium handle if Lightpanda is unavailable', async () => {
      mockedConnectOverCDP.mockRejectedValue(new Error('Connection refused'));

      const mockPage = createMockPage();
      const mockCtx = createMockContext({ newPage: vi.fn().mockResolvedValue(mockPage) });
      const mockBrowser = createMockBrowser({ newContext: vi.fn().mockResolvedValue(mockCtx) });

      mockedLaunch.mockResolvedValue(mockBrowser as Browser);

      const handle = await client.getBrowserHandle();

      expect(handle.browserType).toBe('chromium');
      expect(handle.page).toBe(mockPage);
      
      await handle.close();
      expect(mockPage.close).toHaveBeenCalled();
      expect(mockCtx.close).toHaveBeenCalled();
      expect(mockBrowser.close).toHaveBeenCalled(); // Should close full Chromium instance
    });

    it('handle.close() should suppress errors during resource cleanup', async () => {
      const mockPage = createMockPage({ close: vi.fn().mockRejectedValue(new Error('Already closed')) });
      const mockCtx = createMockContext({ close: vi.fn().mockRejectedValue(new Error('Context lost')) });
      const mockBrowser = createMockBrowser({ newContext: vi.fn().mockResolvedValue(mockCtx) });

      mockedConnectOverCDP.mockRejectedValue(new Error('Connection refused'));
      mockedLaunch.mockResolvedValue(mockBrowser as Browser);

      const handle = await client.getBrowserHandle();
      
      // Should not throw even though page and context throw
      await expect(handle.close()).resolves.toBeUndefined();
    });
  });

  describe('getLightpandaStatus', () => {
    beforeEach(async () => {
      vi.resetModules();
      client = await import('./client');
    });

    it('should return the current availability status and URL', async () => {
      mockedConnectOverCDP.mockResolvedValue(createMockBrowser() as Browser);

      const status = await client.getLightpandaStatus();

      expect(status.available).toBe(true);
      expect(status.url).toBe(process.env.LIGHTPANDA_URL || 'http://localhost:9222');
      expect(status.checkedAt).toBeInstanceOf(Date);
    });
  });
});