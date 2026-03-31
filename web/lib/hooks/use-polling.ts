"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface UsePollingOptions {
  enabled?: boolean;
}

interface UsePollingResult<T> {
  data: T | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function usePolling<T>(
  fetchFn: () => Promise<T>,
  intervalMs: number,
  options?: UsePollingOptions,
): UsePollingResult<T> {
  const enabled = options?.enabled ?? true;

  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFnRef = useRef(fetchFn);
  fetchFnRef.current = fetchFn;

  const executeFetch = useCallback(async () => {
    try {
      setError(null);
      const result = await fetchFnRef.current();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    setIsLoading(true);
    executeFetch();

    const id = setInterval(executeFetch, intervalMs);
    return () => clearInterval(id);
  }, [enabled, intervalMs, executeFetch]);

  return { data, isLoading, error, refetch: executeFetch };
}
