/**
 * Website existence checker.
 *
 * HTTP probe pipeline that verifies whether a business has a website
 * and categorizes its status:
 * - none:      no URL known, or URL doesn't resolve
 * - redirect:  URL resolves but redirects (3xx)
 * - active:    URL returns 200 with HTML content
 * - error:     URL returns 4xx/5xx or connection fails
 */

export type WebsiteStatus = "none" | "redirect" | "active" | "error";

export interface WebsiteCheckResult {
  url: string;
  status: WebsiteStatus;
  statusCode?: number;
  finalUrl?: string;
  responseTimeMs: number;
  error?: string;
}

const WEBSITE_CHECK_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 5;
const CONCURRENT_CHECKS = 10;

/**
 * Check a single URL's website status.
 */
export async function checkWebsite(url: string): Promise<WebsiteCheckResult> {
  const start = Date.now();

  if (!url) {
    return {
      url,
      status: "none",
      responseTimeMs: Date.now() - start,
    };
  }

  // Normalize URL
  let normalizedUrl = url.trim();
  if (
    !normalizedUrl.startsWith("http://") &&
    !normalizedUrl.startsWith("https://")
  ) {
    normalizedUrl = `https://${normalizedUrl}`;
  }

  let redirectCount = 0;
  let currentUrl = normalizedUrl;

  while (redirectCount < MAX_REDIRECTS) {
    try {
      const response = await fetch(currentUrl, {
        method: "HEAD",
        redirect: "manual",
        signal: AbortSignal.timeout(WEBSITE_CHECK_TIMEOUT_MS),
        headers: {
          "User-Agent":
            "FindX-Bot/1.0 (business prospecting; +https://findx.nl)",
          Accept: "text/html",
        },
      });

      const responseTime = Date.now() - start;

      // Handle redirects
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) {
          return {
            url: normalizedUrl,
            status: "error",
            statusCode: response.status,
            responseTimeMs: responseTime,
            error: "Redirect without location header",
          };
        }
        currentUrl = new URL(location, currentUrl).toString();
        redirectCount++;
        continue;
      }

      // Active website
      if (response.ok) {
        return {
          url: normalizedUrl,
          status: "active",
          statusCode: response.status,
          finalUrl: currentUrl !== normalizedUrl ? currentUrl : undefined,
          responseTimeMs: responseTime,
        };
      }

      // Client/server error
      return {
        url: normalizedUrl,
        status: "error",
        statusCode: response.status,
        responseTimeMs: responseTime,
        error: `HTTP ${response.status}`,
      };
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Unknown error";

      // Timeout or connection refused → no website
      if (
        errorMessage.includes("ECONNREFUSED") ||
        errorMessage.includes("ENOTFOUND") ||
        errorMessage.includes("timeout")
      ) {
        return {
          url: normalizedUrl,
          status: "none",
          responseTimeMs: Date.now() - start,
          error: errorMessage,
        };
      }

      return {
        url: normalizedUrl,
        status: "error",
        responseTimeMs: Date.now() - start,
        error: errorMessage,
      };
    }
  }

  // Too many redirects
  return {
    url: normalizedUrl,
    status: "redirect",
    finalUrl: currentUrl,
    responseTimeMs: Date.now() - start,
    error: `Exceeded ${MAX_REDIRECTS} redirects`,
  };
}

/**
 * Check website status for a batch of URLs with concurrency control.
 */
export async function checkWebsites(
  urls: string[],
): Promise<Map<string, WebsiteCheckResult>> {
  const results = new Map<string, WebsiteCheckResult>();
  const queue = [...urls];

  async function worker(): Promise<void> {
    while (queue.length > 0) {
      const url = queue.shift();
      if (!url) break;
      const result = await checkWebsite(url);
      results.set(url, result);
    }
  }

  const workers = Array.from(
    { length: Math.min(CONCURRENT_CHECKS, urls.length) },
    () => worker(),
  );

  await Promise.all(workers);
  return results;
}

/**
 * Check website status for leads, returning only those with a URL to check.
 */
export function extractUrlsFromLeads(
  leads: Array<{ website?: string | null }>,
): string[] {
  return leads
    .map((l) => l.website?.trim())
    .filter((url): url is string => !!url && url.length > 0);
}
