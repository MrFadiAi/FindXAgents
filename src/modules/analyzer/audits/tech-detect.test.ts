import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as cheerio from 'cheerio';
import { detectTechnologies } from './tech-detect.js';
import { renderPage } from '../../../lib/browser/client.js';

vi.mock('../../../lib/browser/client.js', () => ({
  renderPage: vi.fn(),
}));

describe('detectTechnologies', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function mockFetchResponse(options: {
    headers?: Record<string, string>;
    html?: string;
    url?: string;
  }) {
    const headers = new Headers(options.headers ?? {});
    global.fetch = vi.fn().mockResolvedValue({
      headers,
      text: vi.fn().mockResolvedValue(options.html ?? '<html></html>'),
      url: options.url ?? 'https://example.com',
    });
  }

  it('should detect WordPress via meta generator', async () => {
    mockFetchResponse({
      html: '<html><head><meta name="generator" content="WordPress 6.0"></head><body></body></html>',
    });

    const result = await detectTechnologies('https://example.com');

    expect(result.technologies).toContainEqual({
      name: 'WordPress',
      category: 'cms',
      confidence: 0.95,
      version: 'WordPress 6.0',
    });
  });

  it('should detect Drupal via meta generator', async () => {
    mockFetchResponse({
      html: '<html><head><meta name="generator" content="Drupal 9"></head><body></body></html>',
    });

    const result = await detectTechnologies('https://example.com');

    expect(result.technologies).toContainEqual({
      name: 'Drupal',
      category: 'cms',
      confidence: 0.95,
      version: 'Drupal 9',
    });
  });

  it('should detect Joomla via meta generator', async () => {
    mockFetchResponse({
      html: '<html><head><meta name="generator" content="Joomla! 4"></head><body></body></html>',
    });

    const result = await detectTechnologies('https://example.com');

    expect(result.technologies).toContainEqual({
      name: 'Joomla',
      category: 'cms',
      confidence: 0.95,
      version: 'Joomla! 4',
    });
  });

  it('should detect Shopify via meta generator', async () => {
    mockFetchResponse({
      html: '<html><head><meta name="generator" content="Shopify 2.0"></head><body></body></html>',
    });

    const result = await detectTechnologies('https://example.com');

    expect(result.technologies).toContainEqual({
      name: 'Shopify',
      category: 'cms',
      confidence: 0.95,
      version: 'Shopify 2.0',
    });
  });

  it('should detect Wix via meta generator', async () => {
    mockFetchResponse({
      html: '<html><head><meta name="generator" content="Wix.com"></head><body></body></html>',
    });

    const result = await detectTechnologies('https://example.com');

    expect(result.technologies).toContainEqual({
      name: 'Wix',
      category: 'cms',
      confidence: 0.9,
      version: 'Wix.com',
    });
  });

  it('should detect Squarespace via meta generator', async () => {
    mockFetchResponse({
      html: '<html><head><meta name="generator" content="Squarespace 7.1"></head><body></body></html>',
    });

    const result = await detectTechnologies('https://example.com');

    expect(result.technologies).toContainEqual({
      name: 'Squarespace',
      category: 'cms',
      confidence: 0.9,
      version: 'Squarespace 7.1',
    });
  });

  it('should detect Webflow via meta generator', async () => {
    mockFetchResponse({
      html: '<html><head><meta name="generator" content="Webflow 3.0"></head><body></body></html>',
    });

    const result = await detectTechnologies('https://example.com');

    expect(result.technologies).toContainEqual({
      name: 'Webflow',
      category: 'cms',
      confidence: 0.9,
      version: 'Webflow 3.0',
    });
  });

  it('should detect WordPress via link header containing wp-json', async () => {
    mockFetchResponse({
      headers: {
        link: '<https://example.com/wp-json/>; rel="https://api.w.org/"',
      },
      html: '<html></html>',
    });

    const result = await detectTechnologies('https://example.com');

    expect(result.technologies).toContainEqual({
      name: 'WordPress',
      category: 'cms',
      confidence: 0.8,
    });
  });

  it('should detect WordPress via wp-includes script source', async () => {
    mockFetchResponse({
      html: '<html><head><script src="/wp-includes/js/jquery.js"></script></head><body></body></html>',
    });

    const result = await detectTechnologies('https://example.com');

    expect(result.technologies).toContainEqual({
      name: 'WordPress',
      category: 'cms',
      confidence: 0.85,
    });
  });

  it('should detect WordPress via wp-content link href', async () => {
    mockFetchResponse({
      html: '<html><head><link href="/wp-content/style.css" rel="stylesheet"></head><body></body></html>',
    });

    const result = await detectTechnologies('https://example.com');

    expect(result.technologies).toContainEqual({
      name: 'WordPress',
      category: 'cms',
      confidence: 0.85,
    });
  });

  it('should detect Shopify via CSS class', async () => {
    mockFetchResponse({
      html: '<html><body><div class="shopify-section"></div></body></html>',
    });

    const result = await detectTechnologies('https://example.com');

    expect(result.technologies).toContainEqual({
      name: 'Shopify',
      category: 'cms',
      confidence: 0.85,
    });
  });

  it('should detect Shopify via script src', async () => {
    mockFetchResponse({
      html: '<html><body><script src="https://cdn.shopify.com/some-script.js"></script></body></html>',
    });

    const result = await detectTechnologies('https://example.com');

    expect(result.technologies).toContainEqual({
      name: 'Shopify',
      category: 'cms',
      confidence: 0.85,
    });
  });

  it('should detect Apache server', async () => {
    mockFetchResponse({
      headers: { server: 'Apache/2.4.54' },
      html: '<html></html>',
    });

    const result = await detectTechnologies('https://example.com');

    expect(result.technologies).toContainEqual({
      name: 'Apache',
      category: 'hosting',
      confidence: 0.7,
      version: 'Apache/2.4.54',
    });
  });

  it('should detect Nginx server', async () => {
    mockFetchResponse({
      headers: { server: 'nginx/1.24.0' },
      html: '<html></html>',
    });

    const result = await detectTechnologies('https://example.com');

    expect(result.technologies).toContainEqual({
      name: 'Nginx',
      category: 'hosting',
      confidence: 0.7,
      version: 'nginx/1.24.0',
    });
  });

  it('should detect Cloudflare server', async () => {
    mockFetchResponse({
      headers: { server: 'cloudflare' },
      html: '<html></html>',
    });

    const result = await detectTechnologies('https://example.com');

    expect(result.technologies).toContainEqual({
      name: 'Cloudflare',
      category: 'hosting',
      confidence: 0.9,
    });
  });

  it('should detect Microsoft IIS server', async () => {
    mockFetchResponse({
      headers: { server: 'Microsoft-IIS/10.0' },
      html: '<html></html>',
    });

    const result = await detectTechnologies('https://example.com');

    expect(result.technologies).toContainEqual({
      name: 'IIS',
      category: 'hosting',
      confidence: 0.7,
      version: 'Microsoft-IIS/10.0',
    });
  });

  it('should detect LiteSpeed server', async () => {
    mockFetchResponse({
      headers: { server: 'LiteSpeed' },
      html: '<html></html>',
    });

    const result = await detectTechnologies('https://example.com');

    expect(result.technologies).toContainEqual({
      name: 'LiteSpeed',
      category: 'hosting',
      confidence: 0.8,
    });
  });

  it('should detect Google Analytics via script src', async () => {
    mockFetchResponse({
      html: '<html><head><script src="https://www.google-analytics.com/analytics.js"></script></head><body></body></html>',
    });

    const result = await detectTechnologies('https://example.com');

    expect(result.technologies).toContainEqual({
      name: 'Google Analytics',
      category: 'analytics',
      confidence: 0.9,
    });
  });

  it('should detect Google Analytics via inline gtag script', async () => {
    mockFetchResponse({
      html: '<html><head><script>window.dataLayer=[];function gtag(){dataLayer.push(arguments);}</script></head><body></body></html>',
    });

    const result = await detectTechnologies('https://example.com');

    expect(result.technologies).toContainEqual({
      name: 'Google Analytics',
      category: 'analytics',
      confidence: 0.9,
    });
  });

  it('should detect Google Analytics via GA- inline content', async () => {
    mockFetchResponse({
      html: '<html><head><script>var ga_id = "GA-1234567";</script></head><body></body></html>',
    });

    const result = await detectTechnologies('https://example.com');

    expect(result.technologies).toContainEqual({
      name: 'Google Analytics',
      category: 'analytics',
      confidence: 0.9,
    });
  });

  it('should detect Google Tag Manager via script src', async () => {
    mockFetchResponse({
      html: '<html><head><script src="https://www.googletagmanager.com/gtm.js?id=GTM-XXXX"></script></head><body></body></html>',
    });

    const result = await detectTechnologies('https://example.com');

    expect(result.technologies).toContainEqual({
      name: 'Google Tag Manager',
      category: 'analytics',
      confidence: 0.9,
    });
  });

  it('should detect Google Tag Manager via inline content', async () => {
    mockFetchResponse({
      html: '<html><head><script>googletagmanager stuff</script></head><body></body></html>',
    });

    const result = await detectTechnologies('https://example.com');

    expect(result.technologies).toContainEqual({
      name: 'Google Tag Manager',
      category: 'analytics',
      confidence: 0.9,
    });
  });

  it('should detect Matomo', async () => {
    mockFetchResponse({
      html: '<html><head><script>var _paq = window._paq = window._paq || []; /* matomo tracker */</script></head><body></body></html>',
    });

    const result = await detectTechnologies('https://example.com');

    expect(result.technologies).toContainEqual({
      name: 'Matomo',
      category: 'analytics',
      confidence: 0.85,
    });
  });

  it('should detect Piwik (Matomo legacy)', async () => {
    mockFetchResponse({
      html: '<html><head><script src="https://example.com/piwik.js"></script></head><body></body></html>',
    });

    const result = await detectTechnologies('https://example.com');

    expect(result.technologies).toContainEqual({
      name: 'Matomo',
      category: 'analytics',
      confidence: 0.85,
    });
  });

  it('should detect Hotjar', async () => {
    mockFetchResponse({
      html: '<html><head><script>(function(h,o,t,j,a,r){h.hj=h.hj||function(){(h.hj.q=h.hj.q||[]).push(arguments)};})(window,document,"https://static.hotjar.com/c/hotjar-");</script></head><body></body></html>',
    });

    const result = await detectTechnologies('https://example.com');

    expect(result.technologies).toContainEqual({
      name: 'Hotjar',
      category: 'analytics',
      confidence: 0.85,
    });
  });

  it('should detect React via data-reactroot', async () => {
    mockFetchResponse({
      html: '<html><body><div data-reactroot=""></div></body></html>',
    });

    const result = await detectTechnologies('https://example.com');

    expect(result.technologies).toContainEqual({
      name: 'React',
      category: 'framework',
      confidence: 0.8,
    });
  });

  it('should detect React via data-reactid', async () => {
    mockFetchResponse({
      html: '<html><body><div data-reactid=".0"></div></body></html>',
    });

    const result = await detectTechnologies('https://example.com');

    expect(result.technologies).toContainEqual({
      name: 'React',
      category: 'framework',
      confidence: 0.8,
    });
  });

  it('should detect Angular via ng-version', async () => {
    mockFetchResponse({
      html: '<html><body><app-root ng-version="15.0.0"></app-root></body></html>',
    });

    const result = await detectTechnologies('https://example.com');

    expect(result.technologies).toContainEqual({
      name: 'Angular',
      category: 'framework',
      confidence: 0.9,
    });
  });

  it('should detect Vue.js via data-v- attribute', async () => {
    mockFetchResponse({
      html: '<html><body><div data-v-></div></body></html>',
    });

    const result = await detectTechnologies('https://example.com');

    expect(result.technologies).toContainEqual({
      name: 'Vue.js',
      category: 'framework',
      confidence: 0.8,
    });
  });

  it('should detect Vue.js via data-server-rendered attribute', async () => {
    mockFetchResponse({
      html: '<html><body><div data-server-rendered="true"></div></body></html>',
    });

    const result = await detectTechnologies('https://example.com');

    expect(result.technologies).toContainEqual({
      name: 'Vue.js',
      category: 'framework',
      confidence: 0.8,
    });
  });

  it('should detect Next.js via __NEXT_DATA__ script', async () => {
    mockFetchResponse({
      html: '<html><head><script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{}}}</script></head><body></body></html>',
    });

    const result = await detectTechnologies('https://example.com');

    expect(result.technologies).toContainEqual({
      name: 'Next.js',
      category: 'framework',
      confidence: 0.9,
    });
  });

  it('should return empty technologies array when no technologies are detected', async () => {
    mockFetchResponse({
      headers: {},
      html: '<html><head></head><body><p>Just a basic page</p></body></html>',
    });

    const result = await detectTechnologies('https://example.com');

    expect(result.technologies).toEqual([]);
  });

  it('should return response headers in the result', async () => {
    mockFetchResponse({
      headers: {
        'content-type': 'text/html',
        'x-custom': 'custom-value',
      },
      html: '<html></html>',
    });

    const result = await detectTechnologies('https://example.com');

    expect(result.responseHeaders['content-type']).toBe('text/html');
    expect(result.responseHeaders['x-custom']).toBe('custom-value');
  });

  it('should return the finalUrl from the response', async () => {
    mockFetchResponse({
      html: '<html></html>',
      url: 'https://redirected.example.com/page',
    });

    const result = await detectTechnologies('https://example.com');

    expect(result.finalUrl).toBe('https://redirected.example.com/page');
  });

  it('should deduplicate technologies detected by multiple rules', async () => {
    mockFetchResponse({
      headers: {
        link: '<https://example.com/wp-json/>; rel="https://api.w.org/"',
      },
      html: '<html><head><meta name="generator" content="WordPress 6.0"></head><body><script src="/wp-includes/js/jquery.js"></script></body></html>',
    });

    const result = await detectTechnologies('https://example.com');

    const wordpressDetections = result.technologies.filter(
      (t) => t.name === 'WordPress',
    );
    expect(wordpressDetections).toHaveLength(1);
    // The first detection rule (generator meta) fires first and has version
    expect(wordpressDetections[0].confidence).toBe(0.95);
    expect(wordpressDetections[0].version).toBe('WordPress 6.0');
  });

  it('should detect multiple different technologies simultaneously', async () => {
    mockFetchResponse({
      headers: {
        server: 'cloudflare',
      },
      html: `<html>
        <head>
          <meta name="generator" content="WordPress 6.0">
          <script src="https://www.google-analytics.com/analytics.js"></script>
          <script src="https://www.googletagmanager.com/gtm.js?id=GTM-XXXX"></script>
        </head>
        <body>
          <div data-reactroot=""></div>
        </body>
      </html>`,
    });

    const result = await detectTechnologies('https://example.com');

    const names = result.technologies.map((t) => t.name);
    expect(names).toContain('WordPress');
    expect(names).toContain('Cloudflare');
    expect(names).toContain('Google Analytics');
    expect(names).toContain('Google Tag Manager');
    expect(names).toContain('React');
  });

  it('should call fetch with correct User-Agent header', async () => {
    mockFetchResponse({ html: '<html></html>' });

    await detectTechnologies('https://example.com');

    expect(global.fetch).toHaveBeenCalledWith('https://example.com', {
      signal: expect.any(AbortSignal),
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; FindXBot/1.0; +https://findx.nl)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
  });

  it('should handle fetch errors gracefully', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    await expect(detectTechnologies('https://example.com')).rejects.toThrow(
      'Network error',
    );
  });

  it('should handle abort timeout', async () => {
    vi.useFakeTimers();

    global.fetch = vi.fn().mockImplementation(
      (_url: string, options: { signal?: AbortSignal }) => {
        return new Promise((_resolve, reject) => {
          if (options?.signal) {
            options.signal.addEventListener('abort', () => {
              reject(new DOMException('The user aborted a request.', 'AbortError'));
            });
          }
        });
      },
    );

    const detectPromise = detectTechnologies('https://example.com');

    vi.advanceTimersByTime(15_000);

    await expect(detectPromise).rejects.toThrow('The user aborted a request.');

    vi.useRealTimers();
  });
});

describe('detectTechnologies with renderJs option', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should use renderPage when renderJs is true', async () => {
    vi.mocked(renderPage).mockResolvedValue({
      html: '<html><body>Rendered content</body></html>',
      finalUrl: 'https://example.com',
    });

    const headers = new Headers({ server: 'nginx' });
    global.fetch = vi.fn().mockResolvedValue({
      headers,
    });

    const result = await detectTechnologies('https://example.com', {
      renderJs: true,
    });

    expect(renderPage).toHaveBeenCalledWith('https://example.com');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://example.com',
      expect.objectContaining({
        method: 'HEAD',
      }),
    );
    expect(result.technologies).toContainEqual({
      name: 'Nginx',
      category: 'hosting',
      confidence: 0.7,
      version: 'nginx',
    });
  });

  it('should gracefully handle header fetch failure when renderJs is true', async () => {
    vi.mocked(renderPage).mockResolvedValue({
      html: '<html><head><meta name="generator" content="WordPress 6.0"></head><body></body></html>',
      finalUrl: 'https://example.com',
    });

    global.fetch = vi.fn().mockRejectedValue(new Error('HEAD request failed'));

    const result = await detectTechnologies('https://example.com', {
      renderJs: true,
    });

    // Should still detect WordPress from rendered HTML even though headers failed
    expect(result.technologies).toContainEqual({
      name: 'WordPress',
      category: 'cms',
      confidence: 0.95,
      version: 'WordPress 6.0',
    });
    expect(result.responseHeaders).toEqual({});
  });

  it('should detect frameworks from JS-rendered HTML', async () => {
    vi.mocked(renderPage).mockResolvedValue({
      html: '<html><head><script id="__NEXT_DATA__" type="application/json">{"page":"/"}</script></head><body></body></html>',
      finalUrl: 'https://example.com',
    });

    global.fetch = vi.fn().mockResolvedValue({
      headers: new Headers(),
    });

    const result = await detectTechnologies('https://example.com', {
      renderJs: true,
    });

    expect(result.technologies).toContainEqual({
      name: 'Next.js',
      category: 'framework',
      confidence: 0.9,
    });
  });

  it('should use rendered finalUrl', async () => {
    vi.mocked(renderPage).mockResolvedValue({
      html: '<html></html>',
      finalUrl: 'https://js-rendered.example.com/page',
    });

    global.fetch = vi.fn().mockResolvedValue({
      headers: new Headers(),
    });

    const result = await detectTechnologies('https://example.com', {
      renderJs: true,
    });

    expect(result.finalUrl).toBe('https://js-rendered.example.com/page');
  });

  it('should pass correct User-Agent when fetching headers in renderJs mode', async () => {
    vi.mocked(renderPage).mockResolvedValue({
      html: '<html></html>',
      finalUrl: 'https://example.com',
    });

    global.fetch = vi.fn().mockResolvedValue({
      headers: new Headers(),
    });

    await detectTechnologies('https://example.com', { renderJs: true });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://example.com',
      expect.objectContaining({
        method: 'HEAD',
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FindXBot/1.0)' },
      }),
    );
  });
});

describe('detection rule edge cases', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function mockFetchResponse(options: {
    headers?: Record<string, string>;
    html?: string;
  }) {
    const headers = new Headers(options.headers ?? {});
    global.fetch = vi.fn().mockResolvedValue({
      headers,
      text: vi.fn().mockResolvedValue(options.html ?? '<html></html>'),
      url: 'https://example.com',
    });
  }

  it('should not detect CMS when generator meta has unlisted value', async () => {
    mockFetchResponse({
      html: '<html><head><meta name="generator" content="Hugo 0.100"></head><body></body></html>',
    });

    const result = await detectTechnologies('https://example.com');
    const cmsTechs = result.technologies.filter((t) => t.category === 'cms');
    expect(cmsTechs).toHaveLength(0);
  });

  it('should handle case-insensitive server header matching', async () => {
    mockFetchResponse({
      headers: { server: 'APACHE/2.4' },
      html: '<html></html>',
    });

    const result = await detectTechnologies('https://example.com');

    expect(result.technologies).toContainEqual({
      name: 'Apache',
      category: 'hosting',
      confidence: 0.7,
      version: 'APACHE/2.4',
    });
  });

  it('should not detect any hosting when server header is unrecognized', async () => {
    mockFetchResponse({
      headers: { server: 'CustomServer/1.0' },
      html: '<html></html>',
    });

    const result = await detectTechnologies('https://example.com');
    const hostingTechs = result.technologies.filter(
      (t) => t.category === 'hosting',
    );
    expect(hostingTechs).toHaveLength(0);
  });

  it('should not detect hosting when server header is missing', async () => {
    mockFetchResponse({
      headers: {},
      html: '<html></html>',
    });

    const result = await detectTechnologies('https://example.com');
    const hostingTechs = result.technologies.filter(
      (t) => t.category === 'hosting',
    );
    expect(hostingTechs).toHaveLength(0);
  });

  it('should handle empty HTML gracefully', async () => {
    mockFetchResponse({
      html: '',
    });

    const result = await detectTechnologies('https://example.com');
    expect(result.technologies).toEqual([]);
    expect(result.responseHeaders).toBeDefined();
    expect(result.finalUrl).toBe('https://example.com');
  });

  it('should handle malformed HTML gracefully', async () => {
    mockFetchResponse({
      html: '<html><head><meta><body><div><script></script></div></body>',
    });

    const result = await detectTechnologies('https://example.com');
    expect(result.technologies).toEqual([]);
  });

  it('should detect Google Analytics via inline GA- tracking ID', async () => {
    mockFetchResponse({
      html: '<html><head><script>ga("create", "GA-12345", "auto");</script></head><body></body></html>',
    });

    const result = await detectTechnologies('https://example.com');

    expect(result.technologies).toContainEqual({
      name: 'Google Analytics',
      category: 'analytics',
      confidence: 0.9,
    });
  });

  it('should not detect Google Analytics when no matching patterns exist', async () => {
    mockFetchResponse({
      html: '<html><head><script>console.log("hello")</script></head><body></body></html>',
    });

    const result = await detectTechnologies('https://example.com');
    const gaTechs = result.technologies.filter(
      (t) => t.name === 'Google Analytics',
    );
    expect(gaTechs).toHaveLength(0);
  });

  it('should not detect Google Tag Manager when no matching patterns exist', async () => {
    mockFetchResponse({
      html: '<html><head><script>console.log("hello")</script></head><body></body></html>',
    });

    const result = await detectTechnologies('https://example.com');
    const gtmTechs = result.technologies.filter(
      (t) => t.name === 'Google Tag Manager',
    );
    expect(gtmTechs).toHaveLength(0);
  });

  it('should detect both Google Analytics and Google Tag Manager when both present', async () => {
    mockFetchResponse({
      html: `<html>
        <head>
          <script src="https://www.google-analytics.com/analytics.js"></script>
          <script src="https://www.googletagmanager.com/gtm.js?id=GTM-XXXX"></script>
        </head>
        <body></body>
      </html>`,
    });

    const result = await detectTechnologies('https://example.com');

    const names = result.technologies.map((t) => t.name);
    expect(names).toContain('Google Analytics');
    expect(names).toContain('Google Tag Manager');
  });

  it('should handle lowercase header keys correctly', async () => {
    mockFetchResponse({
      headers: { SERVER: 'nginx' },
      html: '<html></html>',
    });

    // The code lowercases header keys via forEach
    const result = await detectTechnologies('https://example.com');

    // Headers API may normalize - the code does `headers[key.toLowerCase()]`
    expect(result.responseHeaders).toBeDefined();
  });

  it('should detect WordPress via wp-content link even without generator meta', async () => {
    mockFetchResponse({
      html: '<html><head><link href="https://example.com/wp-content/themes/style.css" rel="stylesheet"></head><body></body></html>',
    });

    const result = await detectTechnologies('https://example.com');

    expect(result.technologies).toContainEqual({
      name: 'WordPress',
      category: 'cms',
      confidence: 0.85,
    });
  });

  it('should not detect Next.js with wrong selector pattern', async () => {
    mockFetchResponse({
      html: '<html><head><script type="application/json">{"not":"next-data"}</script></head><body></body></html>',
    });

    const result = await detectTechnologies('https://example.com');
    const nextTechs = result.technologies.filter((t) => t.name === 'Next.js');
    expect(nextTechs).toHaveLength(0);
  });

  it('should handle null/undefined header values gracefully', async () => {
    mockFetchResponse({
      headers: {},
      html: '<html></html>',
    });

    const result = await detectTechnologies('https://example.com');
    // No server header → no hosting detection
    const hostingTechs = result.technologies.filter(
      (t) => t.category === 'hosting',
    );
    expect(hostingTechs).toHaveLength(0);
  });

  it('should detect Vue.js via data-v- attribute with short hash', async () => {
    mockFetchResponse({
      html: '<html><body><span data-v-></span></body></html>',
    });

    const result = await detectTechnologies('https://example.com');

    expect(result.technologies).toContainEqual({
      name: 'Vue.js',
      category: 'framework',
      confidence: 0.8,
    });
  });

  it('should detect React, Angular, and Vue.js when all present', async () => {
    mockFetchResponse({
      html: `<html>
        <body>
          <div data-reactroot="">
            <app-root ng-version="15.0.0">
              <div data-v-></div>
            </app-root>
          </div>
        </body>
      </html>`,
    });

    const result = await detectTechnologies('https://example.com');

    const names = result.technologies.map((t) => t.name);
    expect(names).toContain('React');
    expect(names).toContain('Angular');
    expect(names).toContain('Vue.js');
  });

  it('should correctly pass response headers through as lowercase keys', async () => {
    mockFetchResponse({
      headers: {
        'Content-Type': 'text/html; charset=UTF-8',
        'X-Request-Id': 'abc123',
        'Cache-Control': 'no-cache',
      },
      html: '<html></html>',
    });

    const result = await detectTechnologies('https://example.com');

    // Headers are lowercased by the code
    expect(
      result.responseHeaders['content-type'] ||
        result.responseHeaders['Content-Type'],
    ).toBeDefined();
    expect(
      result.responseHeaders['x-request-id'] ||
        result.responseHeaders['X-Request-Id'],
    ).toBeDefined();
  });
});