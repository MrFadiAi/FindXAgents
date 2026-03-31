/**
 * Token-bucket rate limiter for API calls.
 * Ensures we stay within per-source rate limits (e.g. KVK: 10 req/s).
 */
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly maxTokens: number,
    private readonly refillIntervalMs: number,
  ) {
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
  }

  async acquire(): Promise<void> {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens--;
      return;
    }
    await new Promise<void>((resolve) => {
      this.timer = setTimeout(resolve, this.refillIntervalMs);
    });
    this.refill();
    this.tokens--;
  }

  dispose(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const tokensToAdd = Math.floor(elapsed / this.refillIntervalMs);
    if (tokensToAdd > 0) {
      this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
      this.lastRefill = now;
    }
  }
}

/** 10 requests/second — used by KVK API */
export function createKvkRateLimiter(): RateLimiter {
  return new RateLimiter(10, 100);
}

/** 5 requests/second — conservative for Google Places */
export function createGoogleRateLimiter(): RateLimiter {
  return new RateLimiter(5, 200);
}
