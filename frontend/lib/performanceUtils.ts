/**
 * Common performance optimization utilities
 */

/**
 * Memoization function
 * @param fn - Function to memoize
 * @param keySelector - Function to select cache key
 * @returns Memoized function
 */
export function memoize<T extends (...args: unknown[]) => unknown>(
  fn: T,
  keySelector?: (...args: Parameters<T>) => string
): T {
  const cache = new Map<string, ReturnType<T>>();
  
  return ((...args: Parameters<T>) => {
    const key = keySelector ? keySelector(...args) : JSON.stringify(args);
    
    if (cache.has(key)) {
      return cache.get(key) as ReturnType<T>;
    }
    
    const result = fn(...args) as ReturnType<T>;
    cache.set(key, result);
    return result;
  }) as T;
}

/**
 * Lazy load function
 * @param loader - Function to load data
 * @param cache - Cache map
 * @returns Lazy load function
 */
export function lazyLoad<T>(
  loader: () => Promise<T>,
  cache: Map<string, T> = new Map()
): () => Promise<T> {
  let promise: Promise<T> | null = null;
  
  return async (): Promise<T> => {
    if (promise) {
      return promise;
    }
    
    promise = loader().then(result => {
      cache.set('data', result);
      return result;
    });
    
    return promise;
  };
}

/**
 * Batch processing function
 * @param items - Array of items to process
 * @param processor - Batch processing function
 * @param batchSize - Batch size
 * @returns Array of processing results
 */
export async function batchProcess<T, R>(
  items: T[],
  processor: (batch: T[]) => Promise<R[]>,
  batchSize: number = 10
): Promise<R[]> {
  const results: R[] = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await processor(batch);
    results.push(...batchResults);
  }
  
  return results;
}

/**
 * Parallel processing function
 * @param items - Array of items to process
 * @param processor - Parallel processing function
 * @param concurrency - Concurrency level
 * @returns Array of processing results
 */
export async function parallelProcess<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  concurrency: number = 5
): Promise<R[]> {
  const results: R[] = [];
  
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);
  }
  
  return results;
}

/**
 * Function with cache
 * @param fn - Function to cache
 * @param ttl - Cache TTL (milliseconds)
 * @returns Function with cache
 */
export function withCache<T extends (...args: unknown[]) => unknown>(
  fn: T,
  ttl: number = 5 * 60 * 1000 // 5 minutes
): T {
  const cache = new Map<string, { data: ReturnType<T>; timestamp: number }>();
  
  return ((...args: Parameters<T>) => {
    const key = JSON.stringify(args);
    const cached = cache.get(key);
    
    if (cached && Date.now() - cached.timestamp < ttl) {
      return cached.data;
    }
    
    const result = fn(...args) as ReturnType<T>;
    cache.set(key, { data: result, timestamp: Date.now() });
    return result;
  }) as T;
}

/**
 * Function with retry
 * @param fn - Function to retry
 * @param maxRetries - Maximum number of retries
 * @param delay - Retry interval (milliseconds)
 * @returns Function with retry
 */
export function withRetry<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  maxRetries: number = 3,
  delay: number = 1000
): T {
  return (async (...args: Parameters<T>) => {
    let lastError: Error | null = null;
    
    for (let i = 0; i <= maxRetries; i++) {
      try {
        return await fn(...args);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Operation failed');
        if (i < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
        }
      }
    }
    
    if (lastError) {
      throw lastError;
    }
    throw new Error('Operation failed');
  }) as T;
}

/**
 * Function with debounce
 * @param fn - Function to debounce
 * @param delay - Debounce delay (milliseconds)
 * @returns Function with debounce
 */
export function withDebounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number = 300
): T {
  let timeoutId: NodeJS.Timeout;
  
  return ((...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  }) as T;
}

/**
 * Function with throttle
 * @param fn - Function to throttle
 * @param delay - Throttle delay (milliseconds)
 * @returns Function with throttle
 */
export function withThrottle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number = 100
): T {
  let lastCall = 0;
  
  return ((...args: Parameters<T>) => {
    const now = Date.now();
    if (now - lastCall >= delay) {
      lastCall = now;
      fn(...args);
    }
  }) as T;
}

/**
 * Performance measurement function
 * @param fn - Function to measure
 * @param label - Measurement label
 * @returns Function with measurement results
 */
export function withPerformanceMeasurement<T extends (...args: unknown[]) => unknown>(
  fn: T,
  label: string
): T {
  return ((...args: Parameters<T>) => {
    const hasPerformance = typeof performance !== 'undefined';
    const start = hasPerformance ? performance.now() : 0;
    const result = fn(...args);
    if (hasPerformance && process.env.NODE_ENV !== 'production') {
      const duration = performance.now() - start;
      console.debug(`[Performance] ${label}: ${duration.toFixed(2)}ms`);
    }
    return result;
  }) as T;
}

/**
 * Async performance measurement function
 * @param fn - Async function to measure
 * @param label - Measurement label
 * @returns Async function with measurement results
 */
export function withAsyncPerformanceMeasurement<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  label: string
): T {
  return (async (...args: Parameters<T>) => {
    const hasPerformance = typeof performance !== 'undefined';
    const start = hasPerformance ? performance.now() : 0;
    const result = await fn(...args);
    if (hasPerformance && process.env.NODE_ENV !== 'production') {
      const duration = performance.now() - start;
      console.debug(`[Performance] ${label}: ${duration.toFixed(2)}ms`);
    }
    return result;
  }) as T;
}
