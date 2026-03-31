// Extract social media links from a webpage — scrapes HTML for social profiles.
// No external API needed. Finds LinkedIn, Facebook, Instagram, Twitter/X, YouTube, TikTok, etc.

import type { Tool } from "../core/types.js";

const SOCIAL_PATTERNS: Array<{ platform: string; patterns: RegExp[]; extractHandle: (url: string) => string }> = [
  {
    platform: "LinkedIn",
    patterns: [/linkedin\.com\/company\/([a-zA-Z0-9_-]+)/i, /linkedin\.com\/in\/([a-zA-Z0-9_-]+)/i],
    extractHandle: (url) => {
      const m = url.match(/linkedin\.com\/(company|in)\/([a-zA-Z0-9_-]+)/i);
      return m ? m[2] : url;
    },
  },
  {
    platform: "Facebook",
    patterns: [/facebook\.com\/([a-zA-Z0-9.]+)/i, /fb\.com\/([a-zA-Z0-9.]+)/i],
    extractHandle: (url) => {
      const m = url.match(/(?:facebook|fb)\.com\/([a-zA-Z0-9.]+)/i);
      return m ? m[1] : url;
    },
  },
  {
    platform: "Instagram",
    patterns: [/instagram\.com\/([a-zA-Z0-9_.]+)/i],
    extractHandle: (url) => {
      const m = url.match(/instagram\.com\/([a-zA-Z0-9_.]+)/i);
      return m ? m[1] : url;
    },
  },
  {
    platform: "X (Twitter)",
    patterns: [/twitter\.com\/([a-zA-Z0-9_]+)/i, /x\.com\/([a-zA-Z0-9_]+)/i],
    extractHandle: (url) => {
      const m = url.match(/(?:twitter|x)\.com\/([a-zA-Z0-9_]+)/i);
      return m ? m[1] : url;
    },
  },
  {
    platform: "YouTube",
    patterns: [/youtube\.com\/(c\/|channel\/|@)([a-zA-Z0-9_-]+)/i, /youtube\.com\/([a-zA-Z0-9_-]+)/i],
    extractHandle: (url) => {
      const m = url.match(/youtube\.com\/(?:c\/|channel\/|@)?([a-zA-Z0-9_-]+)/i);
      return m ? m[1] : url;
    },
  },
  {
    platform: "TikTok",
    patterns: [/tiktok\.com\/@([a-zA-Z0-9_.]+)/i],
    extractHandle: (url) => {
      const m = url.match(/tiktok\.com\/@([a-zA-Z0-9_.]+)/i);
      return m ? m[1] : url;
    },
  },
  {
    platform: "WhatsApp",
    patterns: [/wa\.me\/([0-9]+)/i, /whatsapp\.com/i],
    extractHandle: (url) => {
      const m = url.match(/wa\.me\/([0-9]+)/i);
      return m ? m[1] : url;
    },
  },
  {
    platform: "Google Maps",
    patterns: [/google\.com\/maps/i, /g\.page\//i, /maps\.google/i],
    extractHandle: () => "Google Maps listing",
  },
];

const URL_REGEX = /https?:\/\/[^\s"'<>]+/g;

// Exclude common non-social URLs
const EXCLUDE_PATTERNS = [
  /share\?/i, /intent\//i, /sharer/i, /plugins\//i,
  /cdn\./i, /api\./i, /assets\./i, /static\./i,
  /googleapis/i, /cloudfront/i, /amazonaws/i,
  /\.css$/i, /\.js$/i, /\.png$/i, /\.jpg$/i, /\.svg$/i,
];

function isExcluded(url: string): boolean {
  return EXCLUDE_PATTERNS.some((p) => p.test(url));
}

export const extractSocialTool: Tool = {
  name: "extract_social_links",
  description:
    "Extract social media profile links from a webpage. Finds LinkedIn, Facebook, Instagram, X/Twitter, YouTube, TikTok, WhatsApp, and Google Maps profiles. Use this to enrich lead data with social presence.",
  input_schema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "The URL of the webpage to extract social links from",
      },
    },
    required: ["url"],
  },
  async execute(input: Record<string, unknown>) {
    const url = input.url as string;

    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(15000),
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      });

      if (!response.ok) {
        return JSON.stringify({ error: `Failed to fetch page: ${response.status}`, socials: [] });
      }

      const html = await response.text();

      // Extract all URLs from the HTML
      const urls: string[] = [];
      let match: RegExpExecArray | null;
      while ((match = URL_REGEX.exec(html)) !== null) {
        const u = match[0].replace(/['"\\);,]+$/, ""); // Clean trailing punctuation
        if (!isExcluded(u)) urls.push(u);
      }

      // Match URLs against social patterns
      const found: Array<{ platform: string; url: string; handle: string }> = [];
      const seen = new Set<string>();

      for (const u of urls) {
        for (const social of SOCIAL_PATTERNS) {
          for (const pattern of social.patterns) {
            if (pattern.test(u)) {
              const key = `${social.platform}:${social.extractHandle(u)}`;
              if (!seen.has(key)) {
                seen.add(key);
                found.push({
                  platform: social.platform,
                  url: u,
                  handle: social.extractHandle(u),
                });
              }
              break;
            }
          }
        }
      }

      // Deduplicate by platform (keep first found)
      const deduped = found.filter(
        (item, i, arr) => arr.findIndex((x) => x.platform === item.platform) === i
      );

      return JSON.stringify({
        url,
        socials: deduped,
        count: deduped.length,
        platforms: deduped.map((s) => s.platform),
      });
    } catch (err) {
      return JSON.stringify({
        error: `Failed to extract social links: ${err instanceof Error ? err.message : String(err)}`,
        socials: [],
        count: 0,
      });
    }
  },
};
