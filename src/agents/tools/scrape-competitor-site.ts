// Competitor website scraper — quick overview of a competitor's site for comparison
import * as cheerio from "cheerio";
import type { Tool } from "../core/types.js";

export const scrapeCompetitorSiteTool: Tool = {
  name: "scrape_competitor_site",
  description:
    "Quick-scan a competitor's website for comparison. Extracts title, meta description, headings, services, contact info, social links, tech stack indicators, and content summary. Returns structured competitor profile.",
  input_schema: {
    type: "object",
    properties: {
      url: { type: "string", description: "The competitor's website URL to scrape" },
    },
    required: ["url"],
  },
  async execute(input: Record<string, unknown>) {
    const url = input.url as string;
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
        signal: AbortSignal.timeout(15000),
        redirect: "follow",
      });
      if (!response.ok) {
        return JSON.stringify({ error: `Failed to fetch: ${response.status}` });
      }
      const html = await response.text();
      const $ = cheerio.load(html);

      // Basic info
      const title = $("title").text().trim();
      const metaDesc = $('meta[name="description"]').attr("content") || "";
      const lang = $("html").attr("lang") || "";

      // Headings
      const headings: { level: number; text: string }[] = [];
      $("h1, h2, h3").each((_, el) => {
        const tag = $(el).prop("tagName")?.toLowerCase() || "";
        const text = $(el).text().trim().slice(0, 100);
        if (text) headings.push({ level: parseInt(tag.replace("h", ""), 10), text });
      });

      // Services / offerings (from headings and lists)
      const services: string[] = [];
      $("h2, h3").each((_, el) => {
        const text = $(el).text().trim();
        if (/service|dienst|offer|solution|behandeling|behandelingen|behandeling|product|wat.*doen|what.*we.*do/i.test(text)) {
          const list = $(el).next("ul, ol");
          if (list.length) {
            list.find("li").each((_, li) => {
              const liText = $(li).text().trim();
              if (liText && liText.length < 100) services.push(liText);
            });
          }
        }
      });

      // Contact info
      const phones: string[] = [];
      const emails: string[] = [];
      $('a[href^="tel:"]').each((_, el) => phones.push($(el).text().trim()));
      $('a[href^="mailto:"]').each((_, el) => emails.push($(el).attr("href")?.replace("mailto:", "") || ""));

      // Address
      let address = "";
      $('*').each((_, el) => {
        const text = $(el).text().trim();
        if (/^\d{4}\s*[A-Z]{2}\s+/.test(text) && text.length < 200 && !address) {
          // Dutch postal code pattern
          address = text.slice(0, 150);
        }
      });

      // Social links
      const socials: Record<string, string> = {};
      $('a[href]').each((_, el) => {
        const href = $(el).attr("href") || "";
        if (/facebook\.com/i.test(href)) socials.facebook = href;
        else if (/instagram\.com/i.test(href)) socials.instagram = href;
        else if (/linkedin\.com/i.test(href)) socials.linkedin = href;
        else if (/twitter\.com|x\.com/i.test(href)) socials.twitter = href;
        else if (/youtube\.com/i.test(href)) socials.youtube = href;
        else if (/tiktok\.com/i.test(href)) socials.tiktok = href;
        else if (/wa\.me|whatsapp/i.test(href)) socials.whatsapp = href;
      });

      // Tech indicators
      const tech: string[] = [];
      if (/wp-content|wp-includes/i.test(html)) tech.push("WordPress");
      if (/shopify|myshopify/i.test(html)) tech.push("Shopify");
      if (/wix\.com|wixpress/i.test(html)) tech.push("Wix");
      if (/squarespace/i.test(html)) tech.push("Squarespace");
      if (/webflow/i.test(html)) tech.push("Webflow");
      if (/_next\/static|__NEXT_DATA__/i.test(html)) tech.push("Next.js");
      if (/react/i.test(html)) tech.push("React");
      if (/vue/i.test(html)) tech.push("Vue");
      if (/google-analytics|gtag/i.test(html)) tech.push("Google Analytics");
      if (/googletagmanager/i.test(html)) tech.push("GTM");
      if (/hotjar/i.test(html)) tech.push("Hotjar");
      if (/clarity\.ms/i.test(html)) tech.push("Clarity");

      // Word count
      const bodyText = $("body").text();
      const wordCount = bodyText.split(/\s+/).filter((w) => w.length > 0).length;

      // CTA detection
      const ctas: string[] = [];
      $("a, button").each((_, el) => {
        const text = $(el).text().trim();
        if (/contact|offerte|afspraak|bel|book|order|buy|subscribe|plan|maak|proefles|gratis/i.test(text) && text.length < 50 && text.length > 3) {
          ctas.push(text);
        }
      });

      return JSON.stringify({
        url,
        title,
        metaDescription: metaDesc.slice(0, 200),
        language: lang,
        headings: headings.slice(0, 20),
        services: [...new Set(services)].slice(0, 15),
        contact: {
          phones: [...new Set(phones)].slice(0, 3),
          emails: [...new Set(emails)].slice(0, 3),
          address: address || null,
        },
        socials,
        technologies: tech,
        wordCount,
        ctas: [...new Set(ctas)].slice(0, 10),
        ssl: url.startsWith("https://"),
      });
    } catch (err) {
      return JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
    }
  },
};
