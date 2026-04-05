import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { extractSocialTool } from './extract-social.js';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('extractSocialTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should have correct tool metadata', () => {
    expect(extractSocialTool.name).toBe('extract_social_links');
    expect(extractSocialTool.input_schema.required).toContain('url');
    expect(extractSocialTool.input_schema.properties.url.type).toBe('string');
  });

  it('should extract LinkedIn company page', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => `
        <html>
          <a href="https://www.linkedin.com/company/acme-corp">LinkedIn</a>
          <a href="https://linkedin.com/in/john-doe">Profile</a>
        </html>
      `,
    });

    const result = await extractSocialTool.execute({ url: 'https://example.com' });
    const parsed = JSON.parse(result as string);

    expect(parsed.socials).toHaveLength(1);
    expect(parsed.socials[0].platform).toBe('LinkedIn');
    expect(parsed.socials[0].handle).toBe('acme-corp');
    expect(parsed.socials[0].url).toContain('linkedin.com/company/acme-corp');
    expect(parsed.count).toBe(1);
    expect(parsed.platforms).toContain('LinkedIn');
  });

  it('should extract LinkedIn personal profile', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => `<html><a href="https://linkedin.com/in/jane-smith">Profile</a></html>`,
    });

    const result = await extractSocialTool.execute({ url: 'https://example.com' });
    const parsed = JSON.parse(result as string);

    expect(parsed.socials[0].platform).toBe('LinkedIn');
    expect(parsed.socials[0].handle).toBe('jane-smith');
  });

  it('should extract Facebook profile', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => `<html><a href="https://www.facebook.com/AcmeInc">FB</a></html>`,
    });

    const result = await extractSocialTool.execute({ url: 'https://example.com' });
    const parsed = JSON.parse(result as string);

    expect(parsed.socials[0].platform).toBe('Facebook');
    expect(parsed.socials[0].handle).toBe('AcmeInc');
  });

  it('should extract Facebook from fb.com short URL', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => `<html><a href="https://fb.com/AcmeInc">FB</a></html>`,
    });

    const result = await extractSocialTool.execute({ url: 'https://example.com' });
    const parsed = JSON.parse(result as string);

    expect(parsed.socials[0].platform).toBe('Facebook');
    expect(parsed.socials[0].handle).toBe('AcmeInc');
  });

  it('should extract Instagram profile', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => `<html><a href="https://instagram.com/acme.official">IG</a></html>`,
    });

    const result = await extractSocialTool.execute({ url: 'https://example.com' });
    const parsed = JSON.parse(result as string);

    expect(parsed.socials[0].platform).toBe('Instagram');
    expect(parsed.socials[0].handle).toBe('acme.official');
  });

  it('should extract X (Twitter) profile from twitter.com', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => `<html><a href="https://twitter.com/acmeinc">Twitter</a></html>`,
    });

    const result = await extractSocialTool.execute({ url: 'https://example.com' });
    const parsed = JSON.parse(result as string);

    expect(parsed.socials[0].platform).toBe('X (Twitter)');
    expect(parsed.socials[0].handle).toBe('acmeinc');
  });

  it('should extract X (Twitter) profile from x.com', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => `<html><a href="https://x.com/acmeinc">X</a></html>`,
    });

    const result = await extractSocialTool.execute({ url: 'https://example.com' });
    const parsed = JSON.parse(result as string);

    expect(parsed.socials[0].platform).toBe('X (Twitter)');
    expect(parsed.socials[0].handle).toBe('acmeinc');
  });

  it('should extract YouTube channel with @ handle', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => `<html><a href="https://youtube.com/@AcmeChannel">YT</a></html>`,
    });

    const result = await extractSocialTool.execute({ url: 'https://example.com' });
    const parsed = JSON.parse(result as string);

    expect(parsed.socials[0].platform).toBe('YouTube');
    expect(parsed.socials[0].handle).toBe('AcmeChannel');
  });

  it('should extract YouTube channel with channel/ prefix', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => `<html><a href="https://youtube.com/channel/UC123456">YT</a></html>`,
    });

    const result = await extractSocialTool.execute({ url: 'https://example.com' });
    const parsed = JSON.parse(result as string);

    expect(parsed.socials[0].platform).toBe('YouTube');
    expect(parsed.socials[0].handle).toBe('UC123456');
  });

  it('should extract YouTube channel with c/ prefix', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => `<html><a href="https://youtube.com/c/AcmeVideos">YT</a></html>`,
    });

    const result = await extractSocialTool.execute({ url: 'https://example.com' });
    const parsed = JSON.parse(result as string);

    expect(parsed.socials[0].platform).toBe('YouTube');
    expect(parsed.socials[0].handle).toBe('AcmeVideos');
  });

  it('should extract TikTok profile', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => `<html><a href="https://tiktok.com/@acme.tiktok">TT</a></html>`,
    });

    const result = await extractSocialTool.execute({ url: 'https://example.com' });
    const parsed = JSON.parse(result as string);

    expect(parsed.socials[0].platform).toBe('TikTok');
    expect(parsed.socials[0].handle).toBe('acme.tiktok');
  });

  it('should extract WhatsApp link via wa.me', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => `<html><a href="https://wa.me/1234567890">WhatsApp</a></html>`,
    });

    const result = await extractSocialTool.execute({ url: 'https://example.com' });
    const parsed = JSON.parse(result as string);

    expect(parsed.socials[0].platform).toBe('WhatsApp');
    expect(parsed.socials[0].handle).toBe('1234567890');
  });

  it('should extract WhatsApp link via whatsapp.com', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => `<html><a href="https://whatsapp.com/channel/xyz">WhatsApp</a></html>`,
    });

    const result = await extractSocialTool.execute({ url: 'https://example.com' });
    const parsed = JSON.parse(result as string);

    expect(parsed.socials[0].platform).toBe('WhatsApp');
  });

  it('should extract Google Maps link', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => `<html><a href="https://google.com/maps/place/?q=Acme">Maps</a></html>`,
    });

    const result = await extractSocialTool.execute({ url: 'https://example.com' });
    const parsed = JSON.parse(result as string);

    expect(parsed.socials[0].platform).toBe('Google Maps');
    expect(parsed.socials[0].handle).toBe('Google Maps listing');
  });

  it('should extract Google Maps link from g.page', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => `<html><a href="https://g.page/AcmeBusiness">Maps</a></html>`,
    });

    const result = await extractSocialTool.execute({ url: 'https://example.com' });
    const parsed = JSON.parse(result as string);

    expect(parsed.socials[0].platform).toBe('Google Maps');
  });

  it('should extract Google Maps link from maps.google', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => `<html><a href="https://maps.google.com/?q=Acme">Maps</a></html>`,
    });

    const result = await extractSocialTool.execute({ url: 'https://example.com' });
    const parsed = JSON.parse(result as string);

    expect(parsed.socials[0].platform).toBe('Google Maps');
  });

  it('should extract multiple social platforms from a single page', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => `
        <html>
          <a href="https://linkedin.com/company/acme">LinkedIn</a>
          <a href="https://facebook.com/acme">FB</a>
          <a href="https://instagram.com/acme">IG</a>
          <a href="https://twitter.com/acme">Twitter</a>
          <a href="https://youtube.com/@acme">YT</a>
          <a href="https://tiktok.com/@acme">TT</a>
        </html>
      `,
    });

    const result = await extractSocialTool.execute({ url: 'https://example.com' });
    const parsed = JSON.parse(result as string);

    expect(parsed.count).toBe(6);
    expect(parsed.platforms).toEqual(
      expect.arrayContaining(['LinkedIn', 'Facebook', 'Instagram', 'X (Twitter)', 'YouTube', 'TikTok'])
    );
  });

  it('should deduplicate social links by platform keeping first found', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => `
        <html>
          <a href="https://linkedin.com/company/acme-main">Main</a>
          <a href="https://linkedin.com/company/acme-secondary">Secondary</a>
          <a href="https://linkedin.com/in/john-doe">Profile</a>
        </html>
      `,
    });

    const result = await extractSocialTool.execute({ url: 'https://example.com' });
    const parsed = JSON.parse(result as string);

    expect(parsed.socials).toHaveLength(1);
    expect(parsed.socials[0].handle).toBe('acme-main');
  });

  it('should not duplicate same platform+handle combination from different URL patterns', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => `
        <html>
          <a href="https://twitter.com/acme">Twitter</a>
          <a href="https://x.com/acme">X</a>
        </html>
      `,
    });

    const result = await extractSocialTool.execute({ url: 'https://example.com' });
    const parsed = JSON.parse(result as string);

    const twitterSocials = parsed.socials.filter((s: any) => s.platform === 'X (Twitter)');
    expect(twitterSocials).toHaveLength(1);
  });

  it('should exclude share/intent URLs', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => `
        <html>
          <a href="https://twitter.com/intent/tweet?text=hello">Share</a>
          <a href="https://facebook.com/sharer/sharer.php?u=example">Share</a>
          <a href="https://twitter.com/acme">Real</a>
        </html>
      `,
    });

    const result = await extractSocialTool.execute({ url: 'https://example.com' });
    const parsed = JSON.parse(result as string);

    expect(parsed.socials).toHaveLength(1);
    expect(parsed.socials[0].handle).toBe('acme');
  });

  it('should exclude plugin URLs', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => `
        <html>
          <a href="https://facebook.com/plugins/like.php">Plugin</a>
        </html>
      `,
    });

    const result = await extractSocialTool.execute({ url: 'https://example.com' });
    const parsed = JSON.parse(result as string);

    expect(parsed.socials).toHaveLength(0);
    expect(parsed.count).toBe(0);
  });

  it('should exclude CDN and static asset URLs', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => `
        <html>
          <a href="https://cdn.example.com/script.js">CDN</a>
          <a href="https://api.example.com/data">API</a>
          <a href="https://assets.example.com/logo.png">Assets</a>
          <a href="https://static.example.com/style.css">Static</a>
        </html>
      `,
    });

    const result = await extractSocialTool.execute({ url: 'https://example.com' });
    const parsed = JSON.parse(result as string);

    expect(parsed.socials).toHaveLength(0);
  });

  it('should exclude cloud service URLs', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => `
        <html>
          <a href="https://storage.googleapis.com/bucket/file">GCS</a>
          <a href="https://d123.cloudfront.net/image.png">CF</a>
          <a href="https://bucket.s3.amazonaws.com/file">S3</a>
        </html>
      `,
    });

    const result = await extractSocialTool.execute({ url: 'https://example.com' });
    const parsed = JSON.parse(result as string);

    expect(parsed.socials).toHaveLength(0);
  });

  it('should exclude static file extensions', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => `
        <html>
          <a href="https://example.com/style.css">CSS</a>
          <a href="https://example.com/script.js">JS</a>
          <a href="https://example.com/image.png">PNG</a>
          <a href="https://example.com/photo.jpg">JPG</a>
          <a href="https://example.com/logo.svg">SVG</a>
        </html>
      `,
    });

    const result = await extractSocialTool.execute({ url: 'https://example.com' });
    const parsed = JSON.parse(result as string);

    expect(parsed.socials).toHaveLength(0);
  });

  it('should clean trailing punctuation from URLs', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => `
        <html>
          <a href="https://linkedin.com/company/acme");">LinkedIn</a>
          <a href="https://twitter.com/acme',">Twitter</a>
        </html>
      `,
    });

    const result = await extractSocialTool.execute({ url: 'https://example.com' });
    const parsed = JSON.parse(result as string);

    expect(parsed.socials).toHaveLength(2);
    expect(parsed.socials[0].url).not.toMatch(/['"\\);,]+$/);
    expect(parsed.socials[1].url).not.toMatch(/['"\\);,]+$/);
  });

  it('should handle non-OK HTTP response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => '',
    });

    const result = await extractSocialTool.execute({ url: 'https://example.com' });
    const parsed = JSON.parse(result as string);

    expect(parsed.error).toBe('Failed to fetch page: 404');
    expect(parsed.socials).toEqual([]);
  });

  it('should handle 500 HTTP response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => '',
    });

    const result = await extractSocialTool.execute({ url: 'https://example.com' });
    const parsed = JSON.parse(result as string);

    expect(parsed.error).toBe('Failed to fetch page: 500');
    expect(parsed.socials).toEqual([]);
  });

  it('should handle network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error: DNS lookup failed'));

    const result = await extractSocialTool.execute({ url: 'https://nonexistent.example.com' });
    const parsed = JSON.parse(result as string);

    expect(parsed.error).toBe('Failed to extract social links: Network error: DNS lookup failed');
    expect(parsed.socials).toEqual([]);
    expect(parsed.count).toBe(0);
  });

  it('should handle timeout error', async () => {
    mockFetch.mockRejectedValueOnce(new DOMException('The operation was aborted', 'AbortError'));

    const result = await extractSocialTool.execute({ url: 'https://slow.example.com' });
    const parsed = JSON.parse(result as string);

    expect(parsed.error).toContain('Failed to extract social links');
    expect(parsed.socials).toEqual([]);
  });

  it('should handle non-Error thrown in catch block', async () => {
    mockFetch.mockRejectedValueOnce('string error');

    const result = await extractSocialTool.execute({ url: 'https://example.com' });
    const parsed = JSON.parse(result as string);

    expect(parsed.error).toBe('Failed to extract social links: string error');
    expect(parsed.socials).toEqual([]);
  });

  it('should handle HTML with no social links', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => `<html><body><p>No social links here</p></body></html>`,
    });

    const result = await extractSocialTool.execute({ url: 'https://example.com' });
    const parsed = JSON.parse(result as string);

    expect(parsed.socials).toEqual([]);
    expect(parsed.count).toBe(0);
    expect(parsed.platforms).toEqual([]);
  });

  it('should handle empty HTML', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => '',
    });

    const result = await extractSocialTool.execute({ url: 'https://example.com' });
    const parsed = JSON.parse(result as string);

    expect(parsed.socials).toEqual([]);
    expect(parsed.count).toBe(0);
  });

  it('should include the source URL in the response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => `<html></html>`,
    });

    const result = await extractSocialTool.execute({ url: 'https://example.com/about' });
    const parsed = JSON.parse(result as string);

    expect(parsed.url).toBe('https://example.com/about');
  });

  it('should send request with correct User-Agent header', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => '<html></html>',
    });

    await extractSocialTool.execute({ url: 'https://example.com' });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com',
      expect.objectContaining({
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      })
    );
  });

  it('should set a timeout signal of 15000ms', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => '<html></html>',
    });

    await extractSocialTool.execute({ url: 'https://example.com' });

    const callArgs = mockFetch.mock.calls[0][1];
    expect(callArgs.signal).toBeDefined();
  });

  it('should return valid JSON string', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => '<html></html>',
    });

    const result = await extractSocialTool.execute({ url: 'https://example.com' });

    expect(() => JSON.parse(result as string)).not.toThrow();
  });

  it('should extract social links from complex real-world HTML', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <link rel="stylesheet" href="https://cdn.example.com/styles.css">
          <script src="https://api.example.com/analytics.js"></script>
        </head>
        <body>
          <header>
            <nav>
              <a href="/">Home</a>
              <a href="https://linkedin.com/company/acme-corp">Connect on LinkedIn</a>
              <a href="https://twitter.com/intent/follow?user=acme">Follow us</a>
            </nav>
          </header>
          <footer>
            <div class="social-links">
              <a href="https://facebook.com/acmecorp" class="social-icon fb">Facebook</a>
              <a href="https://instagram.com/acmecorp" class="social-icon ig">Instagram</a>
              <a href="https://youtube.com/@AcmeCorpOfficial" class="social-icon yt">YouTube</a>
              <a href="https://wa.me/15551234567" class="social-icon wa">WhatsApp</a>
              <a href="https://tiktok.com/@acme" class="social-icon tt">TikTok</a>
            </div>
            <a href="https://maps.google.com/?q=Acme+Corp+HQ">Find us</a>
            <img src="https://assets.example.com/logo.svg" alt="Logo">
          </footer>
        </body>
        </html>
      `,
    });

    const result = await extractSocialTool.execute({ url: 'https://acme.com' });
    const parsed = JSON.parse(result as string);

    expect(parsed.url).toBe('https://acme.com');
    expect(parsed.socials).toHaveLength(7);
    expect(parsed.count).toBe(7);
    expect(parsed.platforms).toEqual(
      expect.arrayContaining([
        'LinkedIn',
        'Facebook',
        'Instagram',
        'YouTube',
        'WhatsApp',
        'TikTok',
        'Google Maps',
      ])
    );
  });

  it('should handle URLs with query parameters and fragments', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => `
        <html>
          <a href="https://linkedin.com/company/acme?trk=footer">LinkedIn</a>
          <a href="https://facebook.com/acme#about">FB</a>
        </html>
      `,
    });

    const result = await extractSocialTool.execute({ url: 'https://example.com' });
    const parsed = JSON.parse(result as string);

    expect(parsed.socials).toHaveLength(2);
  });

  it('should handle http protocol URLs in HTML', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => `<html><a href="http://twitter.com/acme">Twitter</a></html>`,
    });

    const result = await extractSocialTool.execute({ url: 'https://example.com' });
    const parsed = JSON.parse(result as string);

    expect(parsed.socials).toHaveLength(1);
    expect(parsed.socials[0].platform).toBe('X (Twitter)');
  });

  it('should handle case-insensitive URL matching', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => `
        <html>
          <a href="https://LinkedIn.com/Company/ACME-Corp">LinkedIn</a>
          <a href="https://FACEBOOK.COM/AcmeInc">FB</a>
          <a href="https://INSTAGRAM.COM/Acme">IG</a>
        </html>
      `,
    });

    const result = await extractSocialTool.execute({ url: 'https://example.com' });
    const parsed = JSON.parse(result as string);

    expect(parsed.socials).toHaveLength(3);
    expect(parsed.socials[0].handle).toBe('ACME-Corp');
    expect(parsed.socials[1].handle).toBe('AcmeInc');
    expect(parsed.socials[2].handle).toBe('Acme');
  });

  it('should extract URLs from various HTML attributes and content', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => `
        <html>
          <meta property="og:url" content="https://linkedin.com/company/acme">
          <script>var social = "https://twitter.com/acme";</script>
          <div data-social="https://instagram.com/acme">Follow us</div>
          Some text with URL https://facebook.com/acme in paragraph
        </html>
      `,
    });

    const result = await extractSocialTool.execute({ url: 'https://example.com' });
    const parsed = JSON.parse(result as string);

    expect(parsed.count).toBeGreaterThanOrEqual(3);
  });

  it('should handle Facebook handle with dots', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => `<html><a href="https://facebook.com/acme.inc.official">FB</a></html>`,
    });

    const result = await extractSocialTool.execute({ url: 'https://example.com' });
    const parsed = JSON.parse(result as string);

    expect(parsed.socials[0].platform).toBe('Facebook');
    expect(parsed.socials[0].handle).toBe('acme.inc.official');
  });

  it('should handle Instagram handle with underscores and dots', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => `<html><a href="https://instagram.com/acme_official.page">IG</a></html>`,
    });

    const result = await extractSocialTool.execute({ url: 'https://example.com' });
    const parsed = JSON.parse(result as string);

    expect(parsed.socials[0].handle).toBe('acme_official.page');
  });

  it('should handle YouTube bare channel name', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => `<html><a href="https://youtube.com/AcmeChannel">YT</a></html>`,
    });

    const result = await extractSocialTool.execute({ url: 'https://example.com' });
    const parsed = JSON.parse(result as string);

    expect(parsed.socials[0].platform).toBe('YouTube');
    expect(parsed.socials[0].handle).toBe('AcmeChannel');
  });

  it('should handle TikTok handle with underscores and dots', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => `<html><a href="https://tiktok.com/@acme_official.page">TT</a></html>`,
    });

    const result = await extractSocialTool.execute({ url: 'https://example.com' });
    const parsed = JSON.parse(result as string);

    expect(parsed.socials[0].handle).toBe('acme_official.page');
  });

  it('should handle LinkedIn handle with underscores and hyphens', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => `<html><a href="https://linkedin.com/company/acme_corp-tech">LinkedIn</a></html>`,
    });

    const result = await extractSocialTool.execute({ url: 'https://example.com' });
    const parsed = JSON.parse(result as string);

    expect(parsed.socials[0].handle).toBe('acme_corp-tech');
  });

  it('should exclude share query parameter URLs', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => `
        <html>
          <a href="https://facebook.com/sharer.php?u=example">Share</a>
          <a href="https://twitter.com/share?text=hello">Share</a>
        </html>
      `,
    });

    const result = await extractSocialTool.execute({ url: 'https://example.com' });
    const parsed = JSON.parse(result as string);

    expect(parsed.socials).toHaveLength(0);
  });

  it('should handle page with only non-social URLs', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => `
        <html>
          <a href="https://example.com/about">About</a>
          <a href="https://example.com/contact">Contact</a>
          <a href="https://cdn.example.com/logo.png">Logo</a>
        </html>
      `,
    });

    const result = await extractSocialTool.execute({ url: 'https://example.com' });
    const parsed = JSON.parse(result as string);

    expect(parsed.socials).toHaveLength(0);
    expect(parsed.count).toBe(0);
    expect(parsed.platforms).toEqual([]);
  });
});