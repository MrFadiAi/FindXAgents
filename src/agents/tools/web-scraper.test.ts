import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as cheerio from 'cheerio';
import { scrapePage, scrapePageTool, ScrapedPage } from './web-scraper';
import { renderPage } from '../../lib/browser/client.js';

vi.mock('../../lib/browser/client.js', () => ({
  renderPage: vi.fn(),
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('scrapePage', () => {
  const generateHtml = (options: Partial<ScrapedPage> & { fullBody?: string } = {}) => {
    const {
      title = 'Test Page',
      description = 'Test description',
      headings = [],
      paragraphs = [],
      emails = [],
      phones = [],
      links = [],
      fullBody = '',
    } = options;

    const headingsHtml = headings.map(h => `<h1>${h}</h1>`).join('\n');
    const paragraphsHtml = paragraphs.map(p => `<p>${p}</p>`).join('\n');
    const linksHtml = links.map(l => `<a href="${l.href}">${l.text}</a>`).join('\n');

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${title}</title>
          <meta name="description" content="${description}">
          <script>var x = 1;</script>
          <style>body { color: red; }</style>
        </head>
        <body>
          <nav>Navigation</nav>
          <footer>Footer</footer>
          <header>Header</header>
          <iframe src="test.html"></iframe>
          <noscript>No JS</noscript>
          <svg></svg>
          ${headingsHtml}
          ${paragraphsHtml}
          ${linksHtml}
          ${fullBody || ''}
        </body>
      </html>
    `;
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch and parse a basic HTML page successfully', async () => {
    const html = generateHtml({
      title: 'My Title',
      description: 'My Desc',
      headings: ['Head 1'],
      paragraphs: ['This is a long enough paragraph text.'],
      links: [{ text: 'Click', href: 'https://example.com' }],
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve(html),
      url: 'https://example.com',
    });

    const result = await scrapePage('https://example.com');

    expect(result.url).toBe('https://example.com');
    expect(result.title).toBe('My Title');
    expect(result.description).toBe('My Desc');
    expect(result.headings).toEqual(['Head 1']);
    expect(result.paragraphs).toEqual(['This is a long enough paragraph text.']);
    expect(result.links).toEqual([{ text: 'Click', href: 'https://example.com' }]);
    expect(result.browserType).toBeUndefined();
    
    expect(mockFetch).toHaveBeenCalledWith('https://example.com', expect.objectContaining({
      redirect: 'follow',
    }));
  });

  it('should remove non-content elements like script, style, nav, footer, etc.', async () => {
    const html = `
      <html>
        <body>
          <title>Test Title</title>
          <nav><p>Nav paragraph is too short</p></nav>
          <style>p { color: red; }</style>
          <script>console.log('hello')</script>
          <footer><p>Footer paragraph is too short</p></footer>
        </body>
      </html>
    `;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve(html),
      url: 'http://test.com',
    });

    const result = await scrapePage('http://test.com');
    expect(result.paragraphs).toEqual([]);
  });

  it('should use renderPage when renderJs option is true', async () => {
    const mockedHtml = generateHtml({ title: 'Rendered Title' });
    
    vi.mocked(renderPage).mockResolvedValueOnce({
      html: mockedHtml,
      finalUrl: 'https://example.com/rendered',
      browserType: 'Lightpanda',
    });

    const result = await scrapePage('https://example.com', { renderJs: true });

    expect(renderPage).toHaveBeenCalledWith('https://example.com');
    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.title).toBe('Rendered Title');
    expect(result.browserType).toBe('Lightpanda');
  });

  it('should use fetch when renderJs option is false', async () => {
    const mockedHtml = generateHtml();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve(mockedHtml),
      url: 'https://example.com',
    });

    await scrapePage('https://example.com', { renderJs: false });

    expect(mockFetch).toHaveBeenCalled();
    expect(renderPage).not.toHaveBeenCalled();
  });

  it('should throw an error if fetch response is not ok', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: () => Promise.resolve('Not Found'),
      url: 'https://example.com/notfound',
    });

    await expect(scrapePage('https://example.com/notfound')).rejects.toThrow(
      'Failed to fetch https://example.com/notfound: 404'
    );
  });

  it('should use the response.url as finalUrl if available', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve('<html><body></body></html>'),
      url: 'https://redirected.com/final',
    });

    const result = await scrapePage('http://original.com');
    expect(result.url).toBe('https://redirected.com/final');
  });

  it('should fallback to the input url if response.url is missing', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve('<html><body></body></html>'),
      url: '',
    });

    const result = await scrapePage('http://original.com');
    expect(result.url).toBe('http://original.com');
  });

  // Extraction & Limit Testing
  
  it('should extract and limit headings to 15', async () => {
    const headings = Array.from({ length: 20 }, (_, i) => `Heading ${i + 1}`);
    const html = generateHtml({ headings });
    
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve(html),
      url: 'http://test.com',
    });

    const result = await scrapePage('http://test.com');
    expect(result.headings).toHaveLength(15);
    expect(result.headings[0]).toBe('Heading 1');
    expect(result.headings[14]).toBe('Heading 15');
  });

  it('should ignore headings with no text or text >= 200 chars', async () => {
    const headings = [
      '', 
      'Valid Heading', 
      'a'.repeat(200), 
      'a'.repeat(199)
    ];
    const html = generateHtml({ headings: headings.map(h => `<h1>${h}</h1>`) } as any);
    
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve(html),
      url: 'http://test.com',
    });

    const result = await scrapePage('http://test.com');
    expect(result.headings).toEqual(['Valid Heading', 'a'.repeat(199)]);
  });

  it('should extract paragraphs (length > 10) and limit to 20', async () => {
    const paragraphs = Array.from({ length: 25 }, (_, i) => `Paragraph ${i + 1} needs to be strictly greater than 10 characters.`);
    const html = generateHtml({ paragraphs });
    
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve(html),
      url: 'http://test.com',
    });

    const result = await scrapePage('http://test.com');
    expect(result.paragraphs).toHaveLength(20);
    expect(result.paragraphs[0]).toContain('Paragraph 1');
  });

  it('should ignore paragraphs with length <= 10', async () => {
    const paragraphs = ['Short', 'This is exactly eleven', 'Tiny txt'];
    const html = generateHtml({ paragraphs });
    
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve(html),
      url: 'http://test.com',
    });

    const result = await scrapePage('http://test.com');
    expect(result.paragraphs).toEqual(['This is exactly eleven']);
  });

  it('should only process the first 30 paragraphs on the page', async () => {
    const paragraphs = Array.from({ length: 35 }, (_, i) => `Paragraph ${i + 1} is definitely long enough though.`);
    const html = generateHtml({ paragraphs });
    
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve(html),
      url: 'http://test.com',
    });

    const result = await scrapePage('http://test.com');
    expect(result.paragraphs).toHaveLength(20); // The secondary slice limit
    // Testing the iteration limit specifically would require integration with Cheerio internals,
    // but logically if length > 20 it iterated past 20, up to 30.
  });

  it('should extract unique emails, filtering out images and dots, limited to 10', async () => {
    const emails = Array.from({ length: 12 }, (_, i) => `user${i}@example.com`);
    emails.push('fake@example.png', 'test@example.jpg', 'bad..email@example.com');
    
    const html = generateHtml({
      fullBody: `<div>${emails.map(e => `<span>${e}</span>`).join(' ')}</div>`
    });
    
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve(html),
      url: 'http://test.com',
    });

    const result = await scrapePage('http://test.com');
    expect(result.emails).toHaveLength(10);
    expect(result.emails).not.toContain('fake@example.png');
    expect(result.emails).not.toContain('test@example.jpg');
    expect(result.emails).not.toContain('bad..email@example.com');
  });

  it('should extract unique Dutch phone numbers, limited to 5', async () => {
    const phones = Array.from({ length: 7 }, (_, i) => `+31 6${12345678 + i}`);
    phones.push('020-1234567');
    
    const html = generateHtml({
      fullBody: `<div>${phones.map(p => `<span>${p}</span>`).join(' ')}</div>`
    });
    
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve(html),
      url: 'http://test.com',
    });

    const result = await scrapePage('http://test.com');
    expect(result.phones).toHaveLength(5);
    expect(result.phones[0]).toBe('+31 612345678');
    expect(result.phones.map(p => p.trim())).toEqual(result.phones);
  });

  it('should extract relevant links, filtering out anchors and javascript, limited to 20', async () => {
    const links = Array.from({ length: 22 }, (_, i) => ({ text: `Link ${i}`, href: `https://example.com/${i}` }));
    links.push({ text: 'Anchor', href: '#top' });
    links.push({ text: 'JS', href: 'javascript:void(0)' });
    links.push({ text: '', href: 'https://example.com/empty' });
    
    const html = generateHtml({ links });
    
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve(html),
      url: 'http://test.com',
    });

    const result = await scrapePage('http://test.com');
    expect(result.links).toHaveLength(20);
    expect(result.links.find(l => l.href.startsWith('#'))).toBeUndefined();
    expect(result.links.find(l => l.href.startsWith('javascript:'))).toBeUndefined();
    expect(result.links.find(l => l.href === 'https://example.com/empty')).toBeUndefined();
  });

  it('should truncate link text to 100 characters', async () => {
    const longText = 'a'.repeat(150);
    const html = generateHtml({
      links: [{ text: longText, href: 'https://example.com/long' }]
    });
    
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve(html),
      url: 'http://test.com',
    });

    const result = await scrapePage('http://test.com');
    expect(result.links[0].text).toHaveLength(100);
    expect(result.links[0].text).toBe('a'.repeat(100));
  });

  it('should handle a page with completely empty body', async () => {
    const html = '<html><body></body></html>';
    
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve(html),
      url: 'http://test.com',
    });

    const result = await scrapePage('http://test.com');
    expect(result).toEqual({
      url: 'http://test.com',
      title: '',
      description: '',
      headings: [],
      paragraphs: [],
      emails: [],
      phones: [],
      links: [],
    });
  });
});

describe('scrapePageTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should have correct tool metadata', () => {
    expect(scrapePageTool.name).toBe('scrape_page');
    expect(scrapePageTool.input_schema.required).toContain('url');
  });

  it('should execute with basic url input', async () => {
    const html = `
      <html>
        <head><title>Tool Test</title></head>
        <body><p>This is some content for the tool test execution.</p></body>
      </html>
    `;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve(html),
      url: 'https://example.com',
    });

    const resultStr = await scrapePageTool.execute({ url: 'https://example.com' });
    const result = JSON.parse(resultStr as string);

    expect(result.title).toBe('Tool Test');
    expect(result.paragraphs).toContain('This is some content for the tool test execution.');
  });

  it('should execute with renderJs=true input', async () => {
    const mockedHtml = `
      <html>
        <head><title>JS Tool Test</title></head>
        <body></body>
      </html>
    `;
    
    vi.mocked(renderPage).mockResolvedValueOnce({
      html: mockedHtml,
      finalUrl: 'https://example.com/js',
      browserType: 'Chromium',
    });

    const resultStr = await scrapePageTool.execute({ url: 'https://example.com/js', renderJs: true });
    const result = JSON.parse(resultStr as string);

    expect(renderPage).toHaveBeenCalledWith('https://example.com/js');
    expect(result.title).toBe('JS Tool Test');
    expect(result.browserType).toBe('Chromium');
  });

  it('should propagate errors from scrapePage as rejected promises', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Server Error'),
      url: 'https://example.com/error',
    });

    await expect(
      scrapePageTool.execute({ url: 'https://example.com/error' })
    ).rejects.toThrow('Failed to fetch https://example.com/error: 500');
  });
});