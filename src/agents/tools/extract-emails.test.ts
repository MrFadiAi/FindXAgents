import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { extractEmailsTool } from './extract-emails.js';

describe('extractEmailsTool', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    global.fetch = originalFetch;
  });

  it('should have correct tool metadata', () => {
    expect(extractEmailsTool.name).toBe('extract_emails');
    expect(extractEmailsTool.input_schema.required).toEqual(['url']);
    expect(extractEmailsTool.input_schema.properties.url.type).toBe('string');
  });

  it('should extract standard emails from HTML', async () => {
    const html = `
      <html>
        <body>
          <p>Contact us at support@bakery.nl or sales@bakery.nl</p>
        </body>
      </html>
    `;
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      text: async () => html,
    });
    const result = await extractEmailsTool.execute({ url: 'https://bakery.nl' });
    const parsed = JSON.parse(result as string);
    expect(parsed.emails).toEqual(expect.arrayContaining(['support@bakery.nl', 'sales@bakery.nl']));
    expect(parsed.count).toBe(2);
  });

  it('should sort priority prefix emails first', async () => {
    const html = `
      <html>
        <body>
          <p>user@startup.io</p>
          <p>Also reach us at info@startup.io</p>
        </body>
      </html>
    `;
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      text: async () => html,
    });
    const result = await extractEmailsTool.execute({ url: 'https://startup.io' });
    const parsed = JSON.parse(result as string);
    // info@ has priority, should come before user@
    expect(parsed.emails[0]).toBe('info@startup.io');
    expect(parsed.emails).toContain('user@startup.io');
  });

  it('should sort hallo@ and welkom@ as priority prefixes', async () => {
    const html = `
      <html>
        <body>
          <p>user@bedrijf.nl</p>
          <p>Also reach us at hallo@bedrijf.nl and welkom@bedrijf.nl</p>
        </body>
      </html>
    `;
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      text: async () => html,
    });
    const result = await extractEmailsTool.execute({ url: 'https://bedrijf.nl' });
    const parsed = JSON.parse(result as string);
    // hallo@ and welkom@ are priority prefixes
    const priorityEmails = parsed.emails.slice(0, 2);
    expect(priorityEmails).toEqual(expect.arrayContaining(['hallo@bedrijf.nl', 'welkom@bedrijf.nl']));
    expect(parsed.emails[parsed.emails.length - 1]).toBe('user@bedrijf.nl');
  });

  it('should filter out excluded domains', async () => {
    const html = `
      <html>
        <body>
          <p>Contact: info@myshop.nl</p>
          <p>Analytics: tracking@example.com</p>
          <p>Dev: dev@test.com</p>
        </body>
      </html>
    `;
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      text: async () => html,
    });
    const result = await extractEmailsTool.execute({ url: 'https://myshop.nl' });
    const parsed = JSON.parse(result as string);
    expect(parsed.emails).toEqual(['info@myshop.nl']);
    expect(parsed.emails).not.toContain('tracking@example.com');
    expect(parsed.emails).not.toContain('dev@test.com');
  });

  it('should filter out image-like extensions', async () => {
    const html = `
      <html>
        <body>
          <p>Contact: info@myfirm.de</p>
          <img src="icon@2x.png" alt="icon" />
          <img src="logo@homepage.jpg" alt="logo" />
        </body>
      </html>
    `;
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      text: async () => html,
    });
    const result = await extractEmailsTool.execute({ url: 'https://myfirm.de' });
    const parsed = JSON.parse(result as string);
    // icon@2x.png and logo@homepage.jpg should be filtered out by EXCLUDED_TLDS
    expect(parsed.emails).toEqual(['info@myfirm.de']);
  });

  it('should extract emails from mailto: links', async () => {
    const html = `
      <html>
        <body>
          <a href="mailto:hello@cafe.nl">Email us</a>
          <a href="mailto:sales@cafe.nl">Sales</a>
        </body>
      </html>
    `;
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      text: async () => html,
    });
    const result = await extractEmailsTool.execute({ url: 'https://cafe.nl' });
    const parsed = JSON.parse(result as string);
    expect(parsed.emails).toEqual(expect.arrayContaining(['hello@cafe.nl', 'sales@cafe.nl']));
  });

  it('should deduplicate emails', async () => {
    const html = `
      <html>
        <body>
          <p>info@shop.nl</p>
          <a href="mailto:info@shop.nl">Email</a>
          <p>info@shop.nl</p>
        </body>
      </html>
    `;
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      text: async () => html,
    });
    const result = await extractEmailsTool.execute({ url: 'https://shop.nl' });
    const parsed = JSON.parse(result as string);
    expect(parsed.emails).toEqual(['info@shop.nl']);
    expect(parsed.count).toBe(1);
  });

  it('should convert extracted emails to lowercase', async () => {
    const html = `
      <html>
        <body>
          <p>INFO@Startup.IO</p>
          <p>Sales@STARTUP.io</p>
        </body>
      </html>
    `;
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      text: async () => html,
    });
    const result = await extractEmailsTool.execute({ url: 'https://startup.io' });
    const parsed = JSON.parse(result as string);
    expect(parsed.emails).toEqual(expect.arrayContaining(['info@startup.io', 'sales@startup.io']));
    // All emails should be lowercase
    for (const email of parsed.emails) {
      expect(email).toBe(email.toLowerCase());
    }
  });

  it('should handle fetch failure gracefully', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 404,
    });
    const result = await extractEmailsTool.execute({ url: 'https://notfound.nl' });
    const parsed = JSON.parse(result as string);
    expect(parsed.error).toContain('404');
    expect(parsed.emails).toEqual([]);
  });

  it('should handle network error gracefully', async () => {
    global.fetch = vi.fn().mockRejectedValueOnce(new Error('Network error'));
    const result = await extractEmailsTool.execute({ url: 'https://unreachable.nl' });
    const parsed = JSON.parse(result as string);
    expect(parsed.error).toContain('Network error');
    expect(parsed.emails).toEqual([]);
    expect(parsed.count).toBe(0);
  });

  it('should return url and count in response', async () => {
    const html = `<p>info@business.nl</p>`;
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      text: async () => html,
    });
    const result = await extractEmailsTool.execute({ url: 'https://business.nl' });
    const parsed = JSON.parse(result as string);
    expect(parsed.url).toBe('https://business.nl');
    expect(parsed.count).toBe(1);
  });

  it('should handle empty HTML with no emails', async () => {
    const html = `<html><body><p>No emails here</p></body></html>`;
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      text: async () => html,
    });
    const result = await extractEmailsTool.execute({ url: 'https://noemail.nl' });
    const parsed = JSON.parse(result as string);
    expect(parsed.emails).toEqual([]);
    expect(parsed.count).toBe(0);
  });

  it('should sort priority prefix emails further by priority order', async () => {
    const html = `
      <html>
        <body>
          <p>sales@firma.nl</p>
          <p>info@firma.nl</p>
          <p>contact@firma.nl</p>
          <p>random@firma.nl</p>
        </body>
      </html>
    `;
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      text: async () => html,
    });
    const result = await extractEmailsTool.execute({ url: 'https://firma.nl' });
    const parsed = JSON.parse(result as string);
    // Priority group first (info@, contact@, sales@), then non-priority
    const priorityGroup = parsed.emails.slice(0, 3);
    expect(priorityGroup).toEqual(expect.arrayContaining(['info@firma.nl', 'contact@firma.nl', 'sales@firma.nl']));
    // random@ should be last
    expect(parsed.emails[parsed.emails.length - 1]).toBe('random@firma.nl');
  });
});
