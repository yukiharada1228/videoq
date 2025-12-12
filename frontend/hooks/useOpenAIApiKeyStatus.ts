import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiClient } from '@/lib/api';

type CacheEntry = {
  hasApiKey: boolean;
  fetchedAt: number;
};

let cache: CacheEntry | null = null;

export function setOpenAIApiKeyStatusCache(hasApiKey: boolean): void {
  cache = { hasApiKey, fetchedAt: Date.now() };
}

export function invalidateOpenAIApiKeyStatusCache(): void {
  cache = null;
}

export interface UseOpenAIApiKeyStatusOptions {
  enabled?: boolean;
  cacheMs?: number;
}

export interface UseOpenAIApiKeyStatusResult {
  hasApiKey: boolean | null;
  isChecking: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useOpenAIApiKeyStatus(
  options: UseOpenAIApiKeyStatusOptions = {},
): UseOpenAIApiKeyStatusResult {
  const { enabled = true, cacheMs = 30_000 } = options;

  const [hasApiKey, setHasApiKey] = useState<boolean | null>(() => cache?.hasApiKey ?? null);
  const [isChecking, setIsChecking] = useState<boolean>(() => enabled && cache == null);
  const [error, setError] = useState<string | null>(null);

  const isCacheFresh = useMemo(() => {
    if (!cache) return false;
    return Date.now() - cache.fetchedAt < cacheMs;
  }, [cacheMs]);

  const refresh = useCallback(async () => {
    if (!enabled) return;

    setIsChecking(true);
    setError(null);

    try {
      const status = await apiClient.getOpenAIApiKeyStatus();
      cache = { hasApiKey: status.has_api_key, fetchedAt: Date.now() };
      setHasApiKey(status.has_api_key);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to fetch API key status';
      setError(message);
      // Unknown state should remain null; consumers can decide how to handle.
      setHasApiKey(null);
    } finally {
      setIsChecking(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setIsChecking(false);
      return;
    }

    if (isCacheFresh && cache) {
      setHasApiKey(cache.hasApiKey);
      setIsChecking(false);
      return;
    }

    void refresh();
  }, [enabled, isCacheFresh, refresh]);

  return { hasApiKey, isChecking, error, refresh };
}

