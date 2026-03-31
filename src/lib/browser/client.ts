// Browser client abstraction — tries Lightpanda (CDP) first, falls back to Playwright Chromium.
// Lightpanda is 9x lighter on RAM and 11x faster startup than full Chrome.
// Only used for JS rendering (scrape_page, tech_detect). Lighthouse and screenshots use Chromium directly.

import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

const LIGHTPANDA_URL = process.env.LIGHTPANDA_URL || "http://localhost:9222";

// Cached availability check — check once, then remember
let lightpandaAvailable: boolean | null = null;
let lightpandaCheckedAt = 0;
const CHECK_INTERVAL = 60_000; // Re-check every 60s if unavailable

async function isLightpandaAvailable(): Promise<boolean> {
  // Use cached result if recent
  if (lightpandaAvailable === true) return true;
  if (lightpandaAvailable === false && Date.now() - lightpandaCheckedAt < CHECK_INTERVAL) {
    return false;
  }

  try {
    const browser = await chromium.connectOverCDP(LIGHTPANDA_URL, { timeout: 3_000 });
    await browser.close();
    lightpandaAvailable = true;
    return true;
  } catch {
    lightpandaAvailable = false;
    lightpandaCheckedAt = Date.now();
    return false;
  }
}

/** Connect to Lightpanda via CDP, returns null if unavailable */
async function connectLightpanda(): Promise<Browser | null> {
  if (!(await isLightpandaAvailable())) return null;
  try {
    return await chromium.connectOverCDP(LIGHTPANDA_URL, { timeout: 5_000 });
  } catch {
    lightpandaAvailable = false;
    lightpandaCheckedAt = Date.now();
    return null;
  }
}

export interface RenderedPage {
  html: string;
  finalUrl: string;
  browserType: "lightpanda" | "chromium";
}

export interface BrowserHandle {
  page: Page;
  context: BrowserContext;
  browserType: "lightpanda" | "chromium";
  close: () => Promise<void>;
}

/**
 * Render a page with JS execution. Tries Lightpanda first (fast, low RAM),
 * falls back to full Chromium if Lightpanda is unavailable.
 */
export async function renderPage(url: string, timeout = 15_000): Promise<RenderedPage> {
  // Try Lightpanda first
  const lp = await connectLightpanda();
  if (lp) {
    try {
      const ctx = await lp.newContext({ locale: "nl-NL" });
      const page = await ctx.newPage();
      const response = await page.goto(url, { waitUntil: "networkidle", timeout });
      const html = await page.content();
      const finalUrl = page.url();
      await page.close();
      await ctx.close();
      // Don't close lp — it's a shared long-running process
      return { html, finalUrl, browserType: "lightpanda" };
    } catch {
      // Lightpanda failed, fall through to Chromium
    }
  }

  // Fallback: full Chromium via Playwright
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({ locale: "nl-NL" });
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: "networkidle", timeout });
    const html = await page.content();
    const finalUrl = page.url();
    await page.close();
    await ctx.close();
    return { html, finalUrl, browserType: "chromium" };
  } finally {
    await browser.close();
  }
}

/**
 * Get a reusable browser page handle. Caller must call close() when done.
 * Tries Lightpanda first, falls back to Chromium.
 */
export async function getBrowserHandle(): Promise<BrowserHandle> {
  const lp = await connectLightpanda();
  if (lp) {
    const ctx = await lp.newContext({ locale: "nl-NL" });
    const page = await ctx.newPage();
    return {
      page,
      context: ctx,
      browserType: "lightpanda",
      close: async () => {
        await page.close().catch(() => {});
        await ctx.close().catch(() => {});
        // Don't close lp — shared process
      },
    };
  }

  // Fallback: full Chromium
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ locale: "nl-NL" });
  const page = await ctx.newPage();
  return {
    page,
    context: ctx,
    browserType: "chromium",
    close: async () => {
      await page.close().catch(() => {});
      await ctx.close().catch(() => {});
      await browser.close().catch(() => {});
    },
  };
}

/**
 * Quick health check — is Lightpanda reachable?
 */
export async function getLightpandaStatus(): Promise<{
  available: boolean;
  url: string;
  checkedAt: Date;
}> {
  const available = await isLightpandaAvailable();
  return { available, url: LIGHTPANDA_URL, checkedAt: new Date() };
}
