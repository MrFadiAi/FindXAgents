// Content freshness checker — detects dates, stale content, blog activity, missing content types
import * as cheerio from "cheerio";
import type { Tool } from "../core/types.js";

interface ContentFreshness {
  type: string;
  date: string | null;
  text: string;
}

export const checkContentFreshnessTool: Tool = {
  name: "check_content_freshness",
  description:
    "Analyze content freshness of a webpage. Detects publication dates, last-modified info, blog/news activity, stale content indicators, and missing content types (blog, FAQ, testimonials). Returns freshness score.",
  input_schema: {
    type: "object",
    properties: {
      url: { type: "string", description: "The webpage URL to check content freshness" },
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

      const lastModified = response.headers.get("last-modified");
      const freshnessItems: ContentFreshness[] = [];
      const detectedDates: string[] = [];

      // 1. Detect dates in content
      const datePatterns = [
        /\b(\d{1,2}\s+(?:januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december|january|february|march|may|june|july|august|october|december)\s+\d{4})\b/i,
        /\b(\d{4}-\d{2}-\d{2})\b/,
        /\b(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\b/,
      ];

      // Check time elements and datetime attributes
      $("time[datetime], [datetime]").each((_, el) => {
        const dt = $(el).attr("datetime");
        if (dt) detectedDates.push(dt);
      });

      // Check article dates
      $("article time, .post-date, .entry-date, .published, .date, .pubdate").each((_, el) => {
        const text = $(el).text().trim();
        if (text) freshnessItems.push({ type: "article-date", date: text, text });
      });

      // Check copyright years
      const copyrightMatch = html.match(/(?:©|copyright|&copy;)\s*(\d{4})/i);
      const copyrightYear = copyrightMatch ? parseInt(copyrightMatch[1], 10) : null;

      // 2. Content section detection
      const contentSections = {
        hasBlog: false,
        hasNews: false,
        hasFaq: false,
        hasTestimonials: false,
        hasCaseStudies: false,
        hasPortfolio: false,
        hasPricing: false,
        hasAboutPage: false,
      };

      const links = $("a[href]");
      links.each((_, el) => {
        const href = ($(el).attr("href") || "").toLowerCase();
        const text = $(el).text().trim().toLowerCase();
        if (/blog|nieuws|artikelen|articles|posts/.test(href) || /blog|nieuws/.test(text)) contentSections.hasBlog = true;
        if (/news|updates|actualiteiten/.test(href) || /news|updates/.test(text)) contentSections.hasNews = true;
        if (/faq|veelgestelde|questions|help/.test(href)) contentSections.hasFaq = true;
        if (/testimonial|review|ervaring|klant|klantverhaal/.test(href)) contentSections.hasTestimonials = true;
        if (/case-study|cases|portfolio|projecten/.test(href)) contentSections.hasCaseStudies = true;
        if (/portfolio|werk|projecten|gallery/.test(href)) contentSections.hasPortfolio = true;
        if (/pricing|prijzen|tarieven|kosten|packages/.test(href)) contentSections.hasPricing = true;
        if (/about|over-ons|over-ons|wie-zijn-wij|ons-team/.test(href)) contentSections.hasAboutPage = true;
      });

      // Also check headings for FAQ
      if (/:header/i.test(html) && /faq|veelgestelde|questions/i.test(html)) {
        contentSections.hasFaq = true;
      }

      // 3. Word count
      const bodyText = $("main, article, .content, #content, .main, body").first().text() || $("body").text();
      const wordCount = bodyText.split(/\s+/).filter((w) => w.length > 0).length;

      // 4. Stale indicators
      const staleIndicators: string[] = [];
      const currentYear = new Date().getFullYear();
      if (copyrightYear && copyrightYear < currentYear - 1) {
        staleIndicators.push(`Copyright year is ${copyrightYear} (${currentYear - copyrightYear} years old)`);
      }
      if (lastModified) {
        const modDate = new Date(lastModified);
        const daysSinceMod = (Date.now() - modDate.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceMod > 365) {
          staleIndicators.push(`Last modified ${Math.round(daysSinceMod)} days ago`);
        }
      }
      if (wordCount < 300) {
        staleIndicators.push(`Very little content (${wordCount} words)`);
      }
      if (!contentSections.hasBlog && !contentSections.hasNews) {
        staleIndicators.push("No blog or news section found");
      }

      // 5. Freshness score
      let freshnessScore = 50;
      if (copyrightYear === currentYear) freshnessScore += 10;
      else if (copyrightYear === currentYear - 1) freshnessScore += 5;
      if (contentSections.hasBlog) freshnessScore += 10;
      if (contentSections.hasFaq) freshnessScore += 5;
      if (contentSections.hasTestimonials) freshnessScore += 5;
      if (contentSections.hasPricing) freshnessScore += 5;
      if (wordCount > 1000) freshnessScore += 10;
      else if (wordCount > 500) freshnessScore += 5;
      if (detectedDates.length > 0) freshnessScore += 5;
      freshnessScore -= staleIndicators.length * 5;
      freshnessScore = Math.max(0, Math.min(100, freshnessScore));

      return JSON.stringify({
        url,
        freshnessScore,
        wordCount,
        lastModifiedHeader: lastModified || null,
        copyrightYear: copyrightYear || null,
        detectedDates: detectedDates.slice(0, 10),
        freshnessItems: freshnessItems.slice(0, 10),
        contentSections,
        missingContent: Object.entries(contentSections)
          .filter(([_, v]) => !v)
          .map(([k]) => k.replace("has", "").toLowerCase()),
        staleIndicators,
        recommendation:
          staleIndicators.length > 3
            ? "Content appears stale — update copyright, add blog/news section, refresh content"
            : !contentSections.hasBlog
              ? "Add a blog or news section for regular content updates"
              : freshnessScore >= 70
                ? "Content freshness looks good"
                : "Some content improvements recommended",
      });
    } catch (err) {
      return JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
    }
  },
};
