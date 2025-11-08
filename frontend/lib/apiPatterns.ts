/**
 * 共通のAPI呼び出しパターン
 */

/**
 * 並列API呼び出しの共通関数（N+1問題対策）
 * @param apiCalls - API呼び出しの配列
 * @returns 並列実行された結果の配列
 */
export async function parallelApiCalls<T>(
  apiCalls: (() => Promise<T>)[]
): Promise<T[]> {
  return Promise.all(apiCalls.map(call => call().catch(() => null as T)));
}

/**
 * 条件付きAPI呼び出しの共通関数（DRY原則）
 * @param condition - 呼び出し条件
 * @param apiCall - API呼び出し関数
 * @param fallback - 条件が満たされない場合のフォールバック値
 * @returns API呼び出し結果またはフォールバック値
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
 * リトライ付きAPI呼び出しの共通関数（DRY原則）
 * @param apiCall - API呼び出し関数
 * @param maxRetries - 最大リトライ回数
 * @param delay - リトライ間隔（ミリ秒）
 * @returns API呼び出し結果
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
      lastError = error instanceof Error ? error : new Error('API call failed');
      if (i < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
      }
    }
  }
  
  if (lastError) {
    throw lastError;
  }
  throw new Error('API call failed');
}

/**
 * バッチAPI呼び出しの共通関数（N+1問題対策）
 * @param items - 処理するアイテムの配列
 * @param batchSize - バッチサイズ
 * @param apiCall - バッチ処理用のAPI呼び出し関数
 * @returns 処理結果の配列
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
 * キャッシュ付きAPI呼び出しの共通関数（N+1問題対策）
 * @param key - キャッシュキー
 * @param apiCall - API呼び出し関数
 * @param ttl - キャッシュの有効期限（ミリ秒）
 * @returns API呼び出し結果
 */
export function cachedApiCall<T>(
  key: string,
  apiCall: () => Promise<T>,
  ttl: number = 5 * 60 * 1000 // 5分
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
 * デバウンス付きAPI呼び出しの共通関数（DRY原則）
 * @param apiCall - API呼び出し関数
 * @param delay - デバウンス遅延（ミリ秒）
 * @returns デバウンスされたAPI呼び出し関数
 */
export function debouncedApiCall<T>(
  apiCall: () => Promise<T>,
  delay: number = 300
): () => Promise<T> {
  let timeoutId: NodeJS.Timeout;
  let promise: Promise<T> | null = null;
  
  return (): Promise<T> => {
    return new Promise((resolve, reject) => {
      clearTimeout(timeoutId);
      
      timeoutId = setTimeout(async () => {
        try {
          if (!promise) {
            promise = apiCall();
          }
          const result = await promise;
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          promise = null;
        }
      }, delay);
    });
  };
}
