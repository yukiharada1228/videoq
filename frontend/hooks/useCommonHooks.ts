/**
 * 共通のAPI呼び出しフック（DRY原則・N+1問題対策）
 */

import { useCallback, useEffect, useRef, useState } from 'react';

interface UseApiCallOptions<T> {
  fetchFn: () => Promise<T>;
  errorMessage: string;
  shouldFetch?: boolean;
  onFetchStart?: () => void;
  onSuccess?: (data: T) => void;
  onError?: (error: string) => void;
}

interface UseApiCallReturn<T> {
  data: T | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  setError: (error: string | null) => void;
}

export function useApiCall<T>({
  fetchFn,
  errorMessage,
  shouldFetch = true,
  onFetchStart,
  onSuccess,
  onError,
}: UseApiCallOptions<T>): UseApiCallReturn<T> {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // useRefで関数インスタンスを保持し、無限ループを防ぐ（DRY原則）
  const fetchFnRef = useRef(fetchFn);
  const onFetchStartRef = useRef(onFetchStart);
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  const errorMessageRef = useRef(errorMessage);

  // 最新の値を常に保持
  fetchFnRef.current = fetchFn;
  onFetchStartRef.current = onFetchStart;
  onSuccessRef.current = onSuccess;
  onErrorRef.current = onError;
  errorMessageRef.current = errorMessage;

  const executeCall = useCallback(async () => {
    if (!shouldFetch) return;

    try {
      setIsLoading(true);
      setError(null);
      onFetchStartRef.current?.();
      
      const result = await fetchFnRef.current();
      setData(result);
      onSuccessRef.current?.(result);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : errorMessageRef.current;
      setError(errorMsg);
      onErrorRef.current?.(errorMsg);
    } finally {
      setIsLoading(false);
    }
  }, [shouldFetch]);

  useEffect(() => {
    executeCall();
  }, [executeCall]);

  return {
    data,
    isLoading,
    error,
    refetch: executeCall,
    setError,
  };
}

/**
 * バッチAPI呼び出しフック（N+1問題対策）
 */
interface UseBatchApiCallOptions<T> {
  fetchFns: (() => Promise<T>)[];
  errorMessage: string;
  shouldFetch?: boolean;
  onFetchStart?: () => void;
  onSuccess?: (data: T[]) => void;
  onError?: (error: string) => void;
}

interface UseBatchApiCallReturn<T> {
  data: T[] | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  setError: (error: string | null) => void;
}

export function useBatchApiCall<T>({
  fetchFns,
  errorMessage,
  shouldFetch = true,
  onFetchStart,
  onSuccess,
  onError,
}: UseBatchApiCallOptions<T>): UseBatchApiCallReturn<T> {
  const [data, setData] = useState<T[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFnsRef = useRef(fetchFns);
  const onFetchStartRef = useRef(onFetchStart);
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  const errorMessageRef = useRef(errorMessage);

  fetchFnsRef.current = fetchFns;
  onFetchStartRef.current = onFetchStart;
  onSuccessRef.current = onSuccess;
  onErrorRef.current = onError;
  errorMessageRef.current = errorMessage;

  const executeBatchCall = useCallback(async () => {
    if (!shouldFetch || fetchFnsRef.current.length === 0) return;

    try {
      setIsLoading(true);
      setError(null);
      onFetchStartRef.current?.();
      
      // 並列でAPI呼び出しを実行（N+1問題対策）
      const results = await Promise.all(fetchFnsRef.current.map(fn => fn()));
      setData(results);
      onSuccessRef.current?.(results);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : errorMessageRef.current;
      setError(errorMsg);
      onErrorRef.current?.(errorMsg);
    } finally {
      setIsLoading(false);
    }
  }, [shouldFetch]);

  useEffect(() => {
    executeBatchCall();
  }, [executeBatchCall]);

  return {
    data,
    isLoading,
    error,
    refetch: executeBatchCall,
    setError,
  };
}

/**
 * 共通のフォーム状態管理フック（DRY原則）
 */
interface UseFormStateOptions<T> {
  initialValues: T;
  onSubmit: (values: T) => Promise<void>;
  validate?: (values: T) => Record<string, string> | null;
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

interface UseFormStateReturn<T> {
  values: T;
  errors: Record<string, string>;
  isSubmitting: boolean;
  error: string | null;
  setValue: (field: keyof T, value: any) => void;
  setValues: (values: Partial<T>) => void;
  setError: (error: string | null) => void;
  handleSubmit: (e: React.FormEvent) => Promise<void>;
  reset: () => void;
}

export function useFormState<T extends Record<string, any>>({
  initialValues,
  onSubmit,
  validate,
  onSuccess,
  onError,
}: UseFormStateOptions<T>): UseFormStateReturn<T> {
  const [values, setValues] = useState<T>(initialValues);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setValue = useCallback((field: keyof T, value: any) => {
    setValues(prev => ({ ...prev, [field]: value }));
    // エラーをクリア
    if (errors[field as string]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field as string];
        return newErrors;
      });
    }
  }, [errors]);

  const setValuesPartial = useCallback((newValues: Partial<T>) => {
    setValues(prev => ({ ...prev, ...newValues }));
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    
    // バリデーション
    if (validate) {
      const validationErrors = validate(values);
      if (validationErrors) {
        setErrors(validationErrors);
        return;
      }
    }

    try {
      setIsSubmitting(true);
      setError(null);
      await onSubmit(values);
      onSuccess?.();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'An error occurred';
      setError(errorMsg);
      onError?.(errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  }, [values, validate, onSubmit, onSuccess, onError]);

  const reset = useCallback(() => {
    setValues(initialValues);
    setErrors({});
    setError(null);
    setIsSubmitting(false);
  }, [initialValues]);

  return {
    values,
    errors,
    isSubmitting,
    error,
    setValue,
    setValues: setValuesPartial,
    setError,
    handleSubmit,
    reset,
  };
}
