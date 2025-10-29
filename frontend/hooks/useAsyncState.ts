import { useState, useCallback, useRef } from 'react';

/**
 * 非同期操作の状態管理を統一するカスタムフック（DRY原則）
 * ローディング、エラー、データの状態を一元管理
 * 
 * このフックは以下の機能を統合しています：
 * - useApiCall: API呼び出しの状態管理
 * - useMutation: ミューテーション操作の状態管理
 * - useAsyncState: 汎用的な非同期操作の状態管理
 */
interface UseAsyncStateOptions<T> {
  initialData?: T | null;
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
  confirmMessage?: string;
}

interface UseAsyncStateReturn<T> {
  data: T | null;
  isLoading: boolean;
  error: string | null;
  execute: (asyncFn: () => Promise<T>) => Promise<T | undefined>;
  mutate: (...args: any[]) => Promise<T | undefined>;
  reset: () => void;
  setData: (data: T | null) => void;
  setError: (error: string | null) => void;
}

export function useAsyncState<T = any>(
  options: UseAsyncStateOptions<T> = {}
): UseAsyncStateReturn<T> {
  const { initialData = null, onSuccess, onError, confirmMessage } = options;
  
  const [data, setData] = useState<T | null>(initialData);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // コールバックをrefで保持して無限ループを防ぐ
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  onSuccessRef.current = onSuccess;
  onErrorRef.current = onError;

  const execute = useCallback(async (asyncFn: () => Promise<T>): Promise<T | undefined> => {
    try {
      setIsLoading(true);
      setError(null);
      
      const result = await asyncFn();
      setData(result);
      
      if (onSuccessRef.current) {
        onSuccessRef.current(result);
      }
      
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '操作に失敗しました';
      setError(errorMessage);
      
      if (onErrorRef.current) {
        onErrorRef.current(err as Error);
      }
      
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const mutate = useCallback(async (asyncFn: () => Promise<T>): Promise<T | undefined> => {
    if (confirmMessage && !confirm(confirmMessage)) {
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      
      const result = await asyncFn();
      
      setData(result);
      
      if (onSuccessRef.current) {
        onSuccessRef.current(result);
      }
      
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '操作に失敗しました';
      setError(errorMessage);
      
      if (onErrorRef.current) {
        onErrorRef.current(err as Error);
      }
      
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [confirmMessage]);

  const reset = useCallback(() => {
    setData(initialData);
    setError(null);
    setIsLoading(false);
  }, [initialData]);

  return {
    data,
    isLoading,
    error,
    execute,
    mutate,
    reset,
    setData,
    setError,
  };
}
