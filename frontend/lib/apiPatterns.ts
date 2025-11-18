/**
 * Common API call patterns
 */

/**
 * Common function for parallel API calls
 * @param apiCalls - Array of API calls
 * @returns Array of parallel execution results
 */
export async function parallelApiCalls<T>(
  apiCalls: (() => Promise<T>)[]
): Promise<T[]> {
  return Promise.all(apiCalls.map(call => call().catch(() => null as T)));
}

/**
 * Common function for conditional API calls
 * @param condition - Call condition
 * @param apiCall - API call function
 * @param fallback - Fallback value when condition is not met
 * @returns API call result or fallback value
 */
export async function conditionalApiCall<T>(
  condition: boolean,
  apiCall: () => Promise<T>,
  fallback: T
): Promise<T> {
  if (!condition) return fallback;
  return apiCall().catch(() => fallback);
}

/**
 * Common function for API calls with retry
 * @param apiCall - API call function
 * @param maxRetries - Maximum number of retries
 * @param delay - Retry interval (milliseconds)
 * @returns API call result
 */
export async function retryApiCall<T>(
  apiCall: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await apiCall();
    } catch (error) {
      // Preserve the original error information, even if it's not an Error object.
      lastError = error instanceof Error ? error : new Error(String(error));
      if (i < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
      }
    }
  }

  // If the loop completes, lastError will always be non-null.
  // We use a non-null assertion (!) to tell TypeScript it's safe to throw.
  throw lastError!;
}

/**
 * Common function for batch API calls
 * @param items - Array of items to process
 * @param batchSize - Batch size
 * @param apiCall - API call function for batch processing
 * @returns Array of processing results
 */
export async function batchApiCall<T, R>(
  items: T[],
  batchSize: number,
  apiCall: (batch: T[]) => Promise<R[]>
): Promise<R[]> {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await apiCall(batch);
    results.push(...batchResults);
  }

  return results;
}

/**
 * Common function for cached API calls
 * @param key - Cache key
 * @param apiCall - API call function
 * @param ttl - Cache TTL (milliseconds)
 * @returns API call result
 */
export function cachedApiCall<T>(
  key: string,
  apiCall: () => Promise<T>,
  ttl: number = 5 * 60 * 1000 // 5 minutes
): () => Promise<T> {
  const cache = new Map<string, { data: T; timestamp: number }>();

  return async (): Promise<T> => {
    const cached = cache.get(key);
    if (cached && Date.now() - cached.timestamp < ttl) {
      return cached.data;
    }

    const data = await apiCall();
    cache.set(key, { data, timestamp: Date.now() });
    return data;
  };
}

/**
 * Common function for debounced API calls
 * @param apiCall - API call function
 * @param delay - Debounce delay (milliseconds)
 * @returns Debounced API call function
 */
export function debouncedApiCall<T>(
  apiCall: () => Promise<T>,
  delay: number = 300
): () => Promise<T> {
  let timeoutId: NodeJS.Timeout;
  let pendingPromise: Promise<T> | null = null;
  let resolvers: Array<{
    resolve: (value: T) => void;
    reject: (reason: unknown) => void;
  }> = [];

  return (): Promise<T> => {
    return new Promise((resolve, reject) => {
      clearTimeout(timeoutId);

      // Add resolver to the list
      resolvers.push({ resolve, reject });

      timeoutId = setTimeout(async () => {
        const currentResolvers = [...resolvers];
        resolvers = [];

        try {
          if (!pendingPromise) {
            pendingPromise = apiCall();
          }
          const result = await pendingPromise;

          // Resolve all pending promises
          currentResolvers.forEach(({ resolve }) => resolve(result));
        } catch (error) {
          // Reject all pending promises
          currentResolvers.forEach(({ reject }) => reject(error));
        } finally {
          pendingPromise = null;
        }
      }, delay);
    });
  };
}