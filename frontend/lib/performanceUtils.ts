/**
 * 共通のパフォーマンス最適化ユーティリティ
 */

/**
 * メモ化関数
 * @param fn - メモ化する関数
 * @param keySelector - キャッシュキーを選択する関数
 * @returns メモ化された関数
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
 * 遅延読み込み関数
 * @param loader - データを読み込む関数
 * @param cache - キャッシュマップ
 * @returns 遅延読み込み関数
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
 * バッチ処理関数
 * @param items - 処理するアイテムの配列
 * @param processor - バッチ処理関数
 * @param batchSize - バッチサイズ
 * @returns 処理結果の配列
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
 * 並列処理関数
 * @param items - 処理するアイテムの配列
 * @param processor - 並列処理関数
 * @param concurrency - 並列度
 * @returns 処理結果の配列
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
 * キャッシュ付き関数
 * @param fn - キャッシュする関数
 * @param ttl - キャッシュの有効期限（ミリ秒）
 * @returns キャッシュ付き関数
 */
export function withCache<T extends (...args: unknown[]) => unknown>(
  fn: T,
  ttl: number = 5 * 60 * 1000 // 5分
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
 * リトライ付き関数（DRY原則）
 * @param fn - リトライする関数
 * @param maxRetries - 最大リトライ回数
 * @param delay - リトライ間隔（ミリ秒）
 * @returns リトライ付き関数
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
 * デバウンス付き関数（DRY原則）
 * @param fn - デバウンスする関数
 * @param delay - デバウンス遅延（ミリ秒）
 * @returns デバウンス付き関数
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
 * スロットル付き関数（DRY原則）
 * @param fn - スロットルする関数
 * @param delay - スロットル遅延（ミリ秒）
 * @returns スロットル付き関数
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
 * パフォーマンス測定関数（DRY原則）
 * @param fn - 測定する関数
 * @param label - 測定ラベル
 * @returns 測定結果付き関数
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
 * 非同期パフォーマンス測定関数（DRY原則）
 * @param fn - 測定する非同期関数
 * @param label - 測定ラベル
 * @returns 測定結果付き非同期関数
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
