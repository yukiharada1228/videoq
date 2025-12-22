import { useState, useCallback, useRef } from 'react';

/**
 * Custom hook to unify state management for async operations
 * Centrally manage loading, error, and data state
 *
 * This hook integrates the following functionality:
 * - useApiCall: State management for API calls
 * - useMutation: State management for mutation operations
 * - useAsyncState: Generic state management for async operations
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
  mutate: (asyncFn: () => Promise<T>) => Promise<T | undefined>;
  reset: () => void;
  setData: (data: T | null) => void;
  setError: (error: string | null) => void;
}

export function useAsyncState<T = unknown>(
  options: UseAsyncStateOptions<T> = {}
): UseAsyncStateReturn<T> {
  const { initialData = null, onSuccess, onError, confirmMessage } = options;
  
  const [data, setData] = useState<T | null>(initialData);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep callbacks in ref to prevent infinite loops
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
      const errorMessage = err instanceof Error ? err.message : 'Operation failed';
      setError(errorMessage);
      
      if (onErrorRef.current) {
        const errorObject = err instanceof Error ? err : new Error(errorMessage);
        onErrorRef.current(errorObject);
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
      const errorMessage = err instanceof Error ? err.message : 'Operation failed';
      setError(errorMessage);
      
      if (onErrorRef.current) {
        const errorObject = err instanceof Error ? err : new Error(errorMessage);
        onErrorRef.current(errorObject);
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
