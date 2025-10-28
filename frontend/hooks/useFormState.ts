import { useState, useCallback, useRef } from 'react';

/**
 * フォーム状態管理を統一するカスタムフック（DRY原則）
 * バリデーション、エラー、送信状態を一元管理
 */
interface UseFormStateOptions<T> {
  initialData: T;
  validate?: (data: T) => { isValid: boolean; error?: string };
  onSubmit: (data: T) => Promise<void>;
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

interface UseFormStateReturn<T> {
  formData: T;
  isLoading: boolean;
  error: string | null;
  setFormData: (data: T | ((prev: T) => T)) => void;
  updateField: <K extends keyof T>(field: K, value: T[K]) => void;
  handleSubmit: (e: React.FormEvent) => Promise<void>;
  reset: () => void;
  setError: (error: string | null) => void;
}

export function useFormState<T extends Record<string, any>>(
  options: UseFormStateOptions<T>
): UseFormStateReturn<T> {
  const { initialData, validate, onSubmit, onSuccess, onError } = options;
  
  const [formData, setFormData] = useState<T>(initialData);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // コールバックをrefで保持
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  const validateRef = useRef(validate);
  onSuccessRef.current = onSuccess;
  onErrorRef.current = onError;
  validateRef.current = validate;

  const updateField = useCallback(<K extends keyof T>(field: K, value: T[K]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    
    // バリデーション
    if (validateRef.current) {
      const validation = validateRef.current(formData);
      if (!validation.isValid) {
        setError(validation.error || 'バリデーションエラーが発生しました');
        return;
      }
    }

    try {
      setIsLoading(true);
      setError(null);
      
      await onSubmit(formData);
      
      if (onSuccessRef.current) {
        onSuccessRef.current();
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '送信に失敗しました';
      setError(errorMessage);
      
      if (onErrorRef.current) {
        onErrorRef.current(err as Error);
      }
    } finally {
      setIsLoading(false);
    }
  }, [formData, onSubmit]);

  const reset = useCallback(() => {
    setFormData(initialData);
    setError(null);
    setIsLoading(false);
  }, [initialData]);

  return {
    formData,
    isLoading,
    error,
    setFormData,
    updateField,
    handleSubmit,
    reset,
    setError,
  };
}
