import { useState } from 'react';

interface UseMutationOptions<T> {
  onSuccess?: (data?: T) => void;
  onError?: (error: Error) => void;
  confirmMessage?: string;
}

interface UseMutationReturn<T> {
  isLoading: boolean;
  error: string | null;
  mutate: (...args: any[]) => Promise<T | undefined>;
}

export function useMutation<T = void>(
  mutationFn: (...args: any[]) => Promise<T>,
  options: UseMutationOptions<T> = {}
): UseMutationReturn<T> {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { onSuccess, onError, confirmMessage } = options;

  const mutate = async (...args: any[]): Promise<T | undefined> => {
    if (confirmMessage && !confirm(confirmMessage)) {
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const result = await mutationFn(...args);
      if (onSuccess) {
        onSuccess(result);
      }
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '操作に失敗しました';
      setError(errorMessage);
      if (onError) {
        onError(err as Error);
      }
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    isLoading,
    error,
    mutate,
  };
}

