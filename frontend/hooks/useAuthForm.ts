import { useState, useCallback } from 'react';
import { useAsyncState } from './useAsyncState';

interface UseAuthFormProps<T> {
  onSubmit: (data: T) => Promise<void>;
  initialData: T;
  onSuccessRedirect?: () => void;
}

interface UseAuthFormReturn<T> {
  formData: T;
  error: string | null;
  loading: boolean;
  setError: (error: string | null) => void;
  handleChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleSubmit: (e: React.FormEvent) => Promise<void>;
}

export function useAuthForm<T extends Record<string, any>>({
  onSubmit,
  initialData,
  onSuccessRedirect,
}: UseAuthFormProps<T>): UseAuthFormReturn<T> {
  const [formData, setFormData] = useState<T>(initialData);
  
  const { isLoading, error, execute: submitForm, setError } = useAsyncState({
    onSuccess: onSuccessRedirect,
  });

  const updateField = useCallback((field: keyof T, value: T[keyof T]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    updateField(e.target.name as keyof T, e.target.value as T[keyof T]);
  }, [updateField]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    await submitForm(async () => {
      await onSubmit(formData);
      return formData;
    });
  }, [submitForm, onSubmit, formData]);

  return {
    formData,
    error,
    loading: isLoading,
    setError,
    handleChange,
    handleSubmit,
  };
}

