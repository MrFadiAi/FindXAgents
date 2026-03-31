// General-purpose web page scraper — extracts text content, contact info, metadata
// Uses fetch + Cheerio by default. When renderJs=true, uses Lightpanda/Chromium for JS rendering.

import * as cheerio from "cheerio";
import type { Tool } from "../core/types.js";
import { renderPage } from "../../lib/browser/client.js";

export interface ScrapedPage {
  url: string;
  title: string;
  description: string;
  headings: string[];
  paragraphs: string[];
  emails: string[];
  phones: string[];
  links: Array<{ text: string; href: string }>;
}

export async function scrapePage(url: string, options?: { renderJs?: boolean }): Promise<ScrapedPage & { browserType?: string }> {
  let html: string;
  let finalUrl: string;
  let browserType: string | undefined;

  if (options?.renderJs) {
    // Use Lightpanda (fast, low RAM) or fall back to Chromium for JS rendering
    const rendered = await renderPage(url);
    html = rendered.html;
    finalUrl = rendered.finalUrl;
    browserType = rendered.browserType;
  } else {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "nl-NL,nl;q=0.9,en;q=0.8",
      },
      signal: AbortSignal.timeout(15000),
      redirect: "follow",
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status}`);
    }

    html = await response.text();
    finalUrl = response.url || url;
  }

  const $ = cheerio.load(html);

  // Remove non-content elements
  $("script, style, nav, footer, header, iframe, noscript, svg").remove();

  const title = $("title").first().text().trim();
  const description = $('meta[name="description"]').attr("content") || "";

  // Extract headings
  const headings: string[] = [];
  $("h1, h2, h3").each((_, el) => {
    const text = $(el).text().trim();
    if (text && text.length < 200) headings.push(text);
  });

  // Extract paragraphs (first 30)
  const paragraphs: string[] = [];
  $("p").each((i, el) => {
    if (i >= 30) return false;
    const text = $(el).text().trim();
    if (text && text.length > 10) paragraphs.push(text);
  });

  // Extract all text for email/phone regex
  const fullText = $.html() || "";

  // Find email addresses
  const emailRegex = /[\w.-]+@[\w.-]+\.\w{2,}/g;
  const emails = [...new Set(fullText.match(emailRegex) || [])].filter(
    (e) => !e.endsWith(".png") && !e.endsWith(".jpg") && !e.includes(".."),
  );

  // Find Dutch phone numbers
  const phoneRegex = /(?:\+31|0)(?:[\s-]?\d){9}/g;
  const phones = [...new Set((fullText.match(phoneRegex) || []) as string[])].map((p) =>
    p.trim(),
  );

  // Extract relevant links
  const links: Array<{ text: string; href: string }> = [];
  $("a[href]").each((_, el) => {
    const text = $(el).text().trim();
    const href = $(el).attr("href") || "";
    if (text && href && !href.startsWith("#") && !href.startsWith("javascript:")) {
      links.push({ text: text.slice(0, 100), href });
    }
  });

  return {
    url: finalUrl,
    title,
    description,
    headings: headings.slice(0, 15),
    paragraphs: paragraphs.slice(0, 20),
    emails: emails.slice(0, 10),
    phones: phones.slice(0, 5),
    links: links.slice(0, 20),
    ...(browserType ? { browserType } : {}),
  };
}

export const scrapePageTool: Tool = {
  name: "scrape_page",
  description:
    "Fetch and extract content from a web page. Returns the page title, description, headings, text paragraphs, email addresses, phone numbers, and links. Set renderJs=true for JavaScript-heavy sites that need browser rendering.",
  input_schema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "The URL to scrape",
      },
      renderJs: {
        type: "boolean",
        description: "Set to true for JS-heavy sites (uses headless browser, slower but renders JavaScript). Default: false (fast fetch + parse).",
      },
    },
    required: ["url"],
  },
  async execute(input) {
    const url = input.url as string;
    const renderJs = input.renderJs as boolean | undefined;
    const result = await scrapePage(url, { renderJs });
    return JSON.stringify(result);
  },
};
