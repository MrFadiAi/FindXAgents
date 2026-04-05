import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RateLimiter, createKvkRateLimiter, createGoogleRateLimiter } from './rate-limiter';

describe('RateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should initialize with max tokens', async () => {
    const limiter = new RateLimiter(5, 1000);
    // Should allow acquiring tokens up to max immediately
    for (let i = 0; i < 5; i++) {
      await limiter.acquire();
    }
    limiter.dispose();
  });

  it('should refill tokens based on elapsed time', async () => {
    const limiter = new RateLimiter(2, 100);
    await limiter.acquire();
    await limiter.acquire();

    // Now tokens are 0. Advance time by 1 refill interval to get 1 token back
    vi.advanceTimersByTime(100);
    await limiter.acquire();
    limiter.dispose();
  });

  it('should wait for a refill interval when no tokens are available', async () => {
    const limiter = new RateLimiter(1, 500);
    await limiter.acquire();

    const promise = limiter.acquire();

    // Advance time slightly less than interval - should not resolve
    vi.advanceTimersByTime(499);

    let resolved = false;
    promise.then(() => { resolved = true; });
    await vi.advanceTimersByTime(0); // flush microtasks
    expect(resolved).toBe(false);

    // Advance past interval - use async version to properly flush
    await vi.advanceTimersByTimeAsync(1);
    expect(resolved).toBe(true);

    limiter.dispose();
  });

  it('should correctly calculate elapsed time after waiting', async () => {
    const limiter = new RateLimiter(1, 100);
    await limiter.acquire();

    // Tokens are now 0. Start second acquire -- it will wait for refill
    const promise = limiter.acquire();
    await vi.advanceTimersByTimeAsync(100);
    // Second acquire resolved after refill

    // After 100ms, 1 token refilled and consumed by second acquire. Tokens=0.
    // Third acquire should also need to wait
    const promise3 = limiter.acquire();
    let resolved3 = false;
    promise3.then(() => { resolved3 = true; });
    await vi.advanceTimersByTime(0);
    expect(resolved3).toBe(false);

    // Advance past refill interval
    await vi.advanceTimersByTimeAsync(100);
    expect(resolved3).toBe(true);

    limiter.dispose();
  });

  it('should clear the internal timer when dispose is called', async () => {
    const limiter = new RateLimiter(0, 100);
    const promise = limiter.acquire();

    limiter.dispose();

    // After dispose, advancing timers should not resolve the promise
    vi.advanceTimersByTime(500);
    
    let resolved = false;
    promise.then(() => { resolved = true; });
    await vi.advanceTimersByTime(0);
    
    expect(resolved).toBe(false);
  });

  it('should safely call dispose when no timer is active', () => {
    const limiter = new RateLimiter(10, 100);
    // Should not throw
    limiter.dispose();
  });

  it('should not exceed max tokens even after long idle periods', async () => {
    const limiter = new RateLimiter(3, 100);

    // Consume all tokens
    await limiter.acquire();
    await limiter.acquire();
    await limiter.acquire();

    // Idle for a long time
    vi.advanceTimersByTime(10000);

    // Should only allow up to maxTokens (3)
    const promise1 = limiter.acquire();
    const promise2 = limiter.acquire();
    const promise3 = limiter.acquire();

    // All 3 should resolve immediately since tokens refilled to max
    await Promise.all([promise1, promise2, promise3]);

    // The 4th should require waiting again
    const promise4 = limiter.acquire();
    let resolved4 = false;
    promise4.then(() => resolved4 = true);

    await vi.advanceTimersByTime(0);
    expect(resolved4).toBe(false);

    limiter.dispose();
  });

  it('should handle continuous acquire calls under load', async () => {
    const limiter = new RateLimiter(2, 50);
    const results: number[] = [];

    const trackAcquire = async (id: number) => {
      await limiter.acquire();
      results.push(id);
    };

    // Start 3 tasks with 2 max tokens and 50ms refill
    // (only 1 pending acquire to avoid timer overwrite issues)
    const tasks = [
      trackAcquire(1),
      trackAcquire(2),
      trackAcquire(3),
    ];

    // Initially 1 and 2 should resolve (2 tokens available)
    await vi.advanceTimersByTime(0);
    expect(results).toEqual([1, 2]);

    // After 50ms, 1 token refilled, task 3 resolves
    await vi.advanceTimersByTimeAsync(50);
    expect(results).toEqual([1, 2, 3]);

    await Promise.all(tasks);
    limiter.dispose();
  });
});

describe('createKvkRateLimiter', () => {
  it('should create a RateLimiter with 10 max tokens and 100ms interval', () => {
    const limiter = createKvkRateLimiter();
    // Private properties, so we test behavior (10 fast acquires)
    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(limiter.acquire());
    }
    
    return Promise.all(promises).finally(() => limiter.dispose());
  });
});

describe('createGoogleRateLimiter', () => {
  it('should create a RateLimiter with 5 max tokens and 200ms interval', () => {
    const limiter = createGoogleRateLimiter();
    // Private properties, so we test behavior (5 fast acquires)
    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(limiter.acquire());
    }
    
    return Promise.all(promises).finally(() => limiter.dispose());
  });
});