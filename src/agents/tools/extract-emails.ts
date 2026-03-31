// Extract email addresses from a webpage — scrapes HTML and uses regex to find emails.
// No external API needed. Filters out common false positives (images, tracking pixels).

import type { Tool } from "../core/types.js";

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// Domains to exclude (tracking, analytics, CDN)
const EXCLUDED_DOMAINS = [
  "sentry.io", "googleapis.com", "cloudfront.net", "amazonaws.com",
  "example.com", "email.com", "domain.com", "yoursite.com",
  "website.com", "test.com", "company.com",
];

// TLDs that are almost always false positives in this context
const EXCLUDED_TLDS = [".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".woff", ".woff2", ".ttf", ".eot", ".css", ".js"];

function isValidEmail(email: string): boolean {
  const lower = email.toLowerCase();
  // Skip image-like patterns
  if (EXCLUDED_TLDS.some((tld) => lower.endsWith(tld))) return false;
  // Skip common non-email patterns
  if (lower.includes("..")) return false;
  if (lower.startsWith(".") || lower.endsWith(".")) return false;
  // Skip excluded domains
  const domain = lower.split("@")[1];
  if (!domain) return false;
  if (EXCLUDED_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))) return false;
  return true;
}

export const extractEmailsTool: Tool = {
  name: "extract_emails",
  description:
    "Extract email addresses from a webpage by scraping its HTML content. Returns a deduplicated list of found email addresses. Use this to find contact emails for businesses.",
  input_schema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "The URL of the webpage to extract emails from",
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
        return JSON.stringify({ error: `Failed to fetch page: ${response.status}`, emails: [] });
      }

      const html = await response.text();

      // Also try to find emails in mailto: links
      const mailtoRegex = /mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;
      const mailtoEmails: string[] = [];
      let mailtoMatch: RegExpExecArray | null;
      while ((mailtoMatch = mailtoRegex.exec(html)) !== null) {
        mailtoEmails.push(mailtoMatch[1].toLowerCase());
      }

      // Find all emails in the HTML
      const allEmails: string[] = [];
      let match: RegExpExecArray | null;
      while ((match = EMAIL_REGEX.exec(html)) !== null) {
        allEmails.push(match[0].toLowerCase());
      }

      // Combine, filter, deduplicate
      const combined = [...mailtoEmails, ...allEmails].filter(isValidEmail);
      const unique = [...new Set(combined)];

      // Sort: prefer info@, contact@, hello@ emails
      const priorityPrefixes = ["info@", "contact@", "hello@", "hallo@", "welkom@", "sales@"];
      const sorted = unique.sort((a, b) => {
        const aPriority = priorityPrefixes.some((p) => a.startsWith(p)) ? 0 : 1;
        const bPriority = priorityPrefixes.some((p) => b.startsWith(p)) ? 0 : 1;
        return aPriority - bPriority;
      });

      return JSON.stringify({ url, emails: sorted, count: sorted.length });
    } catch (err) {
      return JSON.stringify({
        error: `Failed to extract emails: ${err instanceof Error ? err.message : String(err)}`,
        emails: [],
        count: 0,
      });
    }
  },
};
